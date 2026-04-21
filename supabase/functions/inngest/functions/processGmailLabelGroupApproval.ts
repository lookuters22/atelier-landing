/**
 * G5 async: chunked grouped Gmail label approval — avoids long synchronous Edge requests.
 *
 * Attachment path (high level): CRM-linking to the batch wedding requires explicit
 * attachment eligibility (known client email or sender anchor from prior linked
 * threads in this group), not merely shared label + passing suppression.
 * See `docs/v3/GMAIL_GROUPED_IMPORT_ATTACHMENT_PATH.md`.
 */
import type {
  GmailAccountTokenCache,
  GmailThreadFetchCache,
} from "../../_shared/gmail/buildGmailMaterializationArtifact.ts";
import {
  GMAIL_LABEL_GROUP_APPROVE_V1_EVENT,
  GMAIL_LABEL_GROUP_APPROVE_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { logGmailGroupApproveWorkerV1 } from "../../_shared/gmail/gmailImportObservability.ts";
import { finalizeApprovedImportCandidate } from "../../_shared/gmail/finalizeGmailImportCandidateApproved.ts";
import { materializeGmailImportCandidate } from "../../_shared/gmail/gmailImportMaterialize.ts";
import {
  ensureBatchWeddingForGroup,
  type LazyWeddingState,
} from "../../_shared/gmail/gmailLabelImportLazyWedding.ts";
import { loadAnchorEmailsForGroupedImportWedding } from "../../_shared/gmail/gmailProjectAttachmentEligibility.ts";
import { backpatchLazyGroupedImportWeddingLink } from "../../_shared/gmail/backpatchLazyGroupedImportWeddingLink.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { logA4WorkerOpLatencyV1 } from "../../_shared/workerOpLatencyObservability.ts";

const WORKER_ID = "process-gmail-label-group-approval";

const CANDIDATE_SELECT =
  "id, photographer_id, connected_account_id, status, raw_provider_thread_id, subject, snippet, source_label_name, source_identifier, materialized_thread_id, materialization_prepare_status, materialization_artifact, gmail_label_import_group_id";

/** Bounded per Inngest step to stay within Edge limits; many steps = one run. */
const CHUNK_SIZE = 5;
const MAX_CHUNKS = 120;
/** Rows per Inngest run before finalize must stop or re-queue (CHUNK_SIZE * MAX_CHUNKS). */
export const GMAIL_GROUP_APPROVE_MAX_ROWS_PER_RUN = CHUNK_SIZE * MAX_CHUNKS;

type GroupRow = {
  id: string;
  photographer_id: string;
  status: string;
  materialized_wedding_id: string | null;
  source_label_name: string | null;
  approval_total_candidates: number;
  approval_processed_count: number;
  approval_approved_count: number;
  approval_failed_count: number;
};

/** Mutable counters for one chunk — avoids N× fetchGroup + extra failed_detail reads per candidate. */
type ChunkGroupCounterState = {
  approval_approved_count: number;
  approval_processed_count: number;
  approval_failed_count: number;
  approval_failed_detail: unknown[];
};

async function fetchGroup(groupId: string): Promise<GroupRow | null> {
  const { data, error } = await supabaseAdmin
    .from("gmail_label_import_groups")
    .select(
      "id, photographer_id, status, materialized_wedding_id, source_label_name, approval_total_candidates, approval_processed_count, approval_approved_count, approval_failed_count",
    )
    .eq("id", groupId)
    .maybeSingle();
  if (error || !data) return null;
  return data as GroupRow;
}

async function loadChunkGroupCounterState(groupId: string): Promise<ChunkGroupCounterState | null> {
  const { data, error } = await supabaseAdmin
    .from("gmail_label_import_groups")
    .select("approval_approved_count, approval_processed_count, approval_failed_count, approval_failed_detail")
    .eq("id", groupId)
    .maybeSingle();
  if (error || !data) return null;
  const prev = data.approval_failed_detail;
  const detail: unknown[] = Array.isArray(prev) ? [...prev] : [];
  return {
    approval_approved_count: data.approval_approved_count ?? 0,
    approval_processed_count: data.approval_processed_count ?? 0,
    approval_failed_count: data.approval_failed_count ?? 0,
    approval_failed_detail: detail,
  };
}

async function persistChunkSuccessBump(groupId: string, state: ChunkGroupCounterState): Promise<void> {
  state.approval_approved_count += 1;
  state.approval_processed_count += 1;
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("gmail_label_import_groups")
    .update({
      approval_approved_count: state.approval_approved_count,
      approval_processed_count: state.approval_processed_count,
      updated_at: now,
    })
    .eq("id", groupId);
  if (error) {
    throw new Error(error.message);
  }
}

async function persistChunkFailureBump(
  groupId: string,
  state: ChunkGroupCounterState,
  candidateId: string,
  errMsg: string,
): Promise<void> {
  state.approval_failed_count += 1;
  state.approval_processed_count += 1;
  state.approval_failed_detail.push({
    import_candidate_id: candidateId,
    error: errMsg.slice(0, 500),
  });
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("gmail_label_import_groups")
    .update({
      approval_failed_count: state.approval_failed_count,
      approval_processed_count: state.approval_processed_count,
      approval_last_error: errMsg.slice(0, 500),
      approval_failed_detail: state.approval_failed_detail,
      updated_at: now,
    })
    .eq("id", groupId);
  if (error) {
    throw new Error(error.message);
  }
}

async function finalizeGroupTerminalStatus(groupId: string): Promise<void> {
  const g = await fetchGroup(groupId);
  if (!g) return;
  if (g.status !== "approving") return;

  const failed = g.approval_failed_count ?? 0;
  const approved = g.approval_approved_count ?? 0;
  let status: string;
  if (failed === 0) {
    status = "approved";
  } else if (approved === 0) {
    status = "failed";
  } else {
    status = "partially_approved";
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("gmail_label_import_groups")
    .update({
      status,
      updated_at: now,
      ...(status === "approved" ? { approval_last_error: null } : {}),
    })
    .eq("id", groupId)
    .eq("status", "approving");
}

async function processChunk(params: {
  photographerId: string;
  groupId: string;
  lazyWedding: LazyWeddingState;
}): Promise<{ emptyQueue: boolean }> {
  const { photographerId, groupId, lazyWedding } = params;
  const now = new Date().toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("import_candidates")
    .select(CANDIDATE_SELECT)
    .eq("gmail_label_import_group_id", groupId)
    .eq("photographer_id", photographerId)
    .eq("status", "pending")
    .is("import_approval_error", null)
    .order("created_at", { ascending: true })
    .limit(CHUNK_SIZE);

  if (error) {
    console.error("[processGmailLabelGroupApproval] fetch chunk", error.message);
    throw new Error(error.message);
  }

  const list = rows ?? [];
  if (list.length === 0) {
    return { emptyQueue: true };
  }

  const counterState = await loadChunkGroupCounterState(groupId);
  if (!counterState) {
    throw new Error("gmail_label_import_group_not_found_for_chunk_counters");
  }

  /** Reuse OAuth DB reads + `ensureValidGoogleAccessToken` when all rows share one Gmail account. */
  const gmailAccountTokenCache: GmailAccountTokenCache = new Map();
  /** Reuse `users.threads.get?format=full` when the same Gmail thread appears more than once in this chunk. */
  const gmailThreadFetchCache: GmailThreadFetchCache = new Map();

  /**
   * Same-chunk sender anchors: Inngest steps reset in-memory state, but within
   * one chunk we must let thread B inherit thread A's sender after A links.
   */
  const chunkAnchorOverlay = new Set<string>();

  for (const cand of list) {
    const row = cand as Record<string, unknown>;
    const cid = row.id as string;

    const anchorFromDb = lazyWedding.weddingId
      ? await loadAnchorEmailsForGroupedImportWedding(
          supabaseAdmin,
          photographerId,
          lazyWedding.weddingId,
          groupId,
        )
      : new Set<string>();
    const mergedAnchors = new Set<string>([...anchorFromDb, ...chunkAnchorOverlay]);
    const groupedAttachmentAnchorEmails = [...mergedAnchors];

    /**
     * Pass the current lazyWedding id (may be null until the first
     * attachment-eligible candidate). Suppressed rows always materialize with
     * `weddingId: null` regardless. Eligible rows that arrive before lazy
     * creation get `null` here and are backpatched to the lazyWedding id
     * immediately after creation below.
     */
    const passWeddingId = lazyWedding.weddingId;

    const result = await materializeGmailImportCandidate(supabaseAdmin, {
      photographerId,
      importCandidateId: cid,
      row,
      weddingId: passWeddingId,
      gmailLabelImportGroupId: groupId,
      materializedWeddingId: passWeddingId,
      now,
      gmailAccountTokenCache,
      gmailThreadFetchCache,
      clearImportApprovalError: true,
      groupedAttachmentAnchorEmails,
    });

    if ("error" in result) {
      await supabaseAdmin
        .from("import_candidates")
        .update({
          import_approval_error: (result.error as string).slice(0, 2000),
          updated_at: now,
        })
        .eq("id", cid)
        .eq("photographer_id", photographerId);
      await persistChunkFailureBump(groupId, counterState, cid, result.error as string);
      continue;
    }

    const threadId = result.threadId;
    const suppressed = result.suppressed === true;
    const attachmentEligible = result.groupedAttachmentEligible === true;

    /**
     * Lazy batch-wedding creation — only the first attachment-eligible candidate
     * triggers `createGmailLabelImportWedding`. If every candidate is suppressed
     * or ineligible, no wedding is created and CRM stays clean.
     */
    if (!suppressed && attachmentEligible && !lazyWedding.weddingId) {
      const ensure = await ensureBatchWeddingForGroup(supabaseAdmin, groupId, photographerId, lazyWedding, now);
      if ("error" in ensure) {
        await supabaseAdmin
          .from("import_candidates")
          .update({
            import_approval_error: ensure.error.slice(0, 2000),
            updated_at: now,
          })
          .eq("id", cid)
          .eq("photographer_id", photographerId);
        await persistChunkFailureBump(groupId, counterState, cid, ensure.error);
        continue;
      }

      /**
       * The just-materialized thread was created with `wedding_id: null` and
       * its `ai_routing_metadata` / `import_provenance` JSON has no
       * `materialized_wedding_id` (because `materializedWeddingId` was null
       * inside `materializeGmailImportCandidate`). Backpatch all three so the
       * relational link, the thread provenance JSON, and the candidate
       * provenance JSON agree on the lazy wedding id. Suppressed candidates
       * never reach this branch.
       */
      if (result.finalizedCore) {
        const bp = await backpatchLazyGroupedImportWeddingLink({
          supabaseAdmin,
          photographerId,
          threadId,
          importCandidateId: cid,
          groupId,
          weddingId: ensure.weddingId,
        });
        if (!bp.ok) {
          await supabaseAdmin
            .from("import_candidates")
            .update({
              import_approval_error: bp.error.slice(0, 2000),
              updated_at: now,
            })
            .eq("id", cid)
            .eq("photographer_id", photographerId);
          await persistChunkFailureBump(groupId, counterState, cid, bp.error);
          continue;
        }
      }
    }

    if (result.finalizedCore) {
      if (attachmentEligible) {
        const em = result.normalizedInboundEmail?.trim().toLowerCase() ?? "";
        if (em) chunkAnchorOverlay.add(em);
      }
      await persistChunkSuccessBump(groupId, counterState);
      continue;
    }

    /**
     * Suppressed rows must not CRM-link to the batch-created inquiry wedding
     * even on the reuse-thread path; we keep canonical inbox visibility via
     * the thread itself, but `threadWeddingId` drops to null and the provenance
     * records why.
     */
    const finErr = await finalizeApprovedImportCandidate(supabaseAdmin, {
      importCandidateId: cid,
      photographerId,
      threadId,
      row,
      now,
      extraProvenance: {
        ...(lazyWedding.weddingId ? { materialized_wedding_id: lazyWedding.weddingId } : {}),
        gmail_label_import_group_id: groupId,
        ...(suppressed
          ? {
              suppression: {
                verdict: result.suppressionVerdict ?? "promotional_or_marketing",
                origin: "gmail_import_grouped_reuse",
                at: now,
                ...(lazyWedding.weddingId
                  ? { original_grouped_wedding_id: lazyWedding.weddingId }
                  : {}),
              },
            }
          : {}),
        ...(!suppressed && result.groupedAttachmentEligible === false
          ? {
              grouped_attachment_eligibility: {
                eligible: false,
                reason: result.groupedAttachmentReason ?? "no_positive_attachment_evidence",
                ...(result.groupedAttachmentEvidence
                  ? { evidence: result.groupedAttachmentEvidence }
                  : {}),
                at: now,
              },
            }
          : {}),
      },
      clearImportApprovalError: true,
      threadWeddingId:
        suppressed
          ? null
          : result.needsThreadWeddingIdUpdate && attachmentEligible
          ? lazyWedding.weddingId
          : null,
    });

    if (finErr) {
      await supabaseAdmin
        .from("import_candidates")
        .update({
          import_approval_error: finErr.slice(0, 2000),
          updated_at: now,
        })
        .eq("id", cid)
        .eq("photographer_id", photographerId);
      await persistChunkFailureBump(groupId, counterState, cid, finErr);
      continue;
    }

    if (attachmentEligible) {
      const em = result.normalizedInboundEmail?.trim().toLowerCase() ?? "";
      if (em) chunkAnchorOverlay.add(em);
    }

    await persistChunkSuccessBump(groupId, counterState);
  }

  return { emptyQueue: false };
}

export const processGmailLabelGroupApproval = inngest.createFunction(
  {
    id: "process-gmail-label-group-approval",
    name: "Gmail — async grouped label approval (chunked)",
    retries: 2,
  },
  { event: GMAIL_LABEL_GROUP_APPROVE_V1_EVENT },
  async ({ event, step, attempt, runId }) => {
    if (event.data.schemaVersion !== GMAIL_LABEL_GROUP_APPROVE_V1_SCHEMA_VERSION) {
      logA4WorkerOpLatencyV1({
        worker: WORKER_ID,
        action: "handler",
        ok: false,
        duration_ms: 0,
        outcome: "schema_version_mismatch",
        skipped_reason: "schema_version",
        attempt,
        run_id: runId,
      });
      return { ok: false as const, error: "schema_version_mismatch" };
    }

    const { photographerId, gmailLabelImportGroupId: groupId } = event.data;

    const guard = await step.run("guard", async () => {
      const t0 = Date.now();
      const base = {
        worker: WORKER_ID,
        action: "guard",
        photographer_id: photographerId,
        gmail_label_import_group_id: groupId,
        attempt,
        run_id: runId,
      };

      const g = await fetchGroup(groupId);
      if (!g || g.photographer_id !== photographerId) {
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          outcome: "group_not_found",
        });
        return { ok: false as const, reason: "group_not_found" as const };
      }
      if (g.status !== "approving") {
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          outcome: "not_approving",
        });
        return { ok: false as const, reason: "not_approving" as const, status: g.status };
      }
      /**
       * Wedding may legitimately be null on first run — it is created lazily
       * by the chunk loop the first time an attachment-eligible candidate appears.
       * Retry runs after partial approval may already have it set; either is
       * valid. The `missing_wedding` guard from the earlier eager-creation
       * design has been removed.
       */
      logA4WorkerOpLatencyV1({
        ...base,
        ok: true,
        duration_ms: Date.now() - t0,
        outcome: "ok",
        approval_total_candidates: g.approval_total_candidates,
      });
      return {
        ok: true as const,
        weddingId: (g.materialized_wedding_id as string | null) ?? null,
        labelName: (g.source_label_name as string | null) ?? null,
        total: g.approval_total_candidates,
      };
    });

    if (!guard.ok) {
      logGmailGroupApproveWorkerV1({
        stage: "guard_skip",
        photographer_id: photographerId,
        gmail_label_import_group_id: groupId,
        skipped_reason: JSON.stringify(guard),
      });
      return { ok: false as const, skipped: guard };
    }

    /**
     * Mutable per-run lazy-wedding state. Initialised from whatever the group
     * row holds (null on fresh approve_group, set after first attachment-eligible
     * candidate or on retry of a partially-approved group).
     */
    const lazyWedding: LazyWeddingState = {
      weddingId: guard.weddingId,
      labelName: guard.labelName,
    };

    let chunkIndex = 0;

    while (chunkIndex < MAX_CHUNKS) {
      const idx = chunkIndex;
      const r = await step.run(`chunk-${chunkIndex}`, async () => {
        const t0 = Date.now();
        const out = await processChunk({ photographerId, groupId, lazyWedding });
        logA4WorkerOpLatencyV1({
          worker: WORKER_ID,
          action: "chunk",
          photographer_id: photographerId,
          gmail_label_import_group_id: groupId,
          chunk_index: idx,
          ok: true,
          duration_ms: Date.now() - t0,
          empty_queue: out.emptyQueue,
          attempt,
          run_id: runId,
        });
        return out;
      });

      logGmailGroupApproveWorkerV1({
        stage: "chunk_done",
        photographer_id: photographerId,
        gmail_label_import_group_id: groupId,
        chunk_index: chunkIndex,
        empty_queue: r.emptyQueue,
      });

      if (r.emptyQueue) {
        break;
      }
      chunkIndex += 1;
    }

    await step.run("finalize", async () => {
      const t0 = Date.now();
      const base = {
        worker: WORKER_ID,
        action: "finalize",
        photographer_id: photographerId,
        gmail_label_import_group_id: groupId,
        attempt,
        run_id: runId,
      };

      const g = await fetchGroup(groupId);
      if (!g || g.status !== "approving") {
        logA4WorkerOpLatencyV1({
          ...base,
          ok: true,
          duration_ms: Date.now() - t0,
          outcome: "skipped",
          skipped_reason: "not_approving_or_missing",
        });
        return;
      }
      const now = new Date().toISOString();
      const total = g.approval_total_candidates ?? 0;
      const processed = g.approval_processed_count ?? 0;

      if (total === 0) {
        await supabaseAdmin
          .from("gmail_label_import_groups")
          .update({
            status: "failed",
            approval_last_error: "No candidates were queued for this batch.",
            updated_at: now,
          })
          .eq("id", groupId)
          .eq("status", "approving");
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "empty_batch",
          outcome: "no_candidates_queued",
        });
        return;
      }

      if (processed >= total) {
        await finalizeGroupTerminalStatus(groupId);
        logA4WorkerOpLatencyV1({
          ...base,
          ok: true,
          duration_ms: Date.now() - t0,
          outcome: "terminal_status_set",
        });
        return;
      }

      const { count: pendingWithoutError } = await supabaseAdmin
        .from("import_candidates")
        .select("id", { count: "exact", head: true })
        .eq("gmail_label_import_group_id", groupId)
        .eq("photographer_id", photographerId)
        .eq("status", "pending")
        .is("import_approval_error", null);

      const remaining = pendingWithoutError ?? 0;

      if (remaining > 0) {
        const chunkLimitHit = chunkIndex >= MAX_CHUNKS;
        const approvedN = g.approval_approved_count ?? 0;
        const failedN = g.approval_failed_count ?? 0;
        const anyOutcome = approvedN + failedN > 0;
        const terminal = anyOutcome ? "partially_approved" : "failed";
        const msg = chunkLimitHit
          ? `Inngest chunk limit (${GMAIL_GROUP_APPROVE_MAX_ROWS_PER_RUN} rows per run). ${remaining} candidate(s) still queued (not yet attempted). Use “Retry failed batch rows” in Settings, or approve individual threads.`
          : `Grouped approval stopped early (${processed}/${total} processed, ${remaining} still queued without errors). Check logs or use Retry.`;

        await supabaseAdmin
          .from("gmail_label_import_groups")
          .update({
            status: terminal,
            approval_last_error: msg.slice(0, 2000),
            updated_at: now,
          })
          .eq("id", groupId)
          .eq("status", "approving");
        logA4WorkerOpLatencyV1({
          ...base,
          ok: terminal === "partially_approved",
          duration_ms: Date.now() - t0,
          outcome: chunkLimitHit ? "chunk_limit_with_remaining" : "stopped_early_with_remaining",
          failure_category: chunkLimitHit ? "chunk_limit" : "early_stop",
          remaining_candidates: remaining,
        });
        return;
      }

      if (processed < total) {
        await supabaseAdmin
          .from("gmail_label_import_groups")
          .update({
            status: "failed",
            approval_last_error:
              "Counter mismatch after grouped approval (unexpected). Check import_candidates and approval_* counters.",
            updated_at: now,
          })
          .eq("id", groupId)
          .eq("status", "approving");
        const gAfter = await fetchGroup(groupId);
        logGmailGroupApproveWorkerV1({
          stage: "finalize_done",
          photographer_id: photographerId,
          gmail_label_import_group_id: groupId,
          group_status_after: gAfter?.status,
          approval_processed: gAfter?.approval_processed_count,
          approval_total: gAfter?.approval_total_candidates,
        });
        logA4WorkerOpLatencyV1({
          ...base,
          ok: false,
          duration_ms: Date.now() - t0,
          failure_category: "counter_mismatch",
          outcome: "processed_lt_total",
          group_status_after: gAfter?.status,
          approval_processed: gAfter?.approval_processed_count,
          approval_total: gAfter?.approval_total_candidates,
        });
      }
    });

    return {
      ok: true as const,
      groupId,
      weddingId: lazyWedding.weddingId,
      chunks: chunkIndex + 1,
    };
  },
);
