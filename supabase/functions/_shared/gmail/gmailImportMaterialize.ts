/**
 * G2/G3/G5: Materialize one staged `import_candidate` into canonical thread + message (+ attachments).
 * Shared by single approve (unfiled) and grouped approve (wedding-scoped).
 *
 * Suppression guard:
 *   Before CRM-linking a grouped candidate to its batch `weddingId`, the loaded
 *   body + subject + Gmail source label are passed through
 *   `classifyGmailImportCandidate`. When the candidate is promotional / system
 *   / non-client, the row STILL lands in canonical inbox (operator visibility
 *   preserved) but `weddingId` is forced to `null` so the batch-created inquiry
 *   wedding does not swallow the thread. The suppression verdict + reasons are
 *   persisted in `ai_routing_metadata.suppression` for audit.
 */
import {
  type GmailAccountTokenCache,
  type GmailThreadFetchCache,
  computeGmailMaterializationBundle,
} from "./buildGmailMaterializationArtifact.ts";
import { classifyGmailImportCandidate } from "../suppression/classifyGmailImportCandidate.ts";
import {
  evaluateGroupedImportAttachmentEligibility,
  photographerHasClientMatchingEmail,
} from "./gmailProjectAttachmentEligibility.ts";
import { extractSenderEmailFromRaw } from "../../../../src/lib/inboundSuppressionClassifier.ts";
import { parseGmailImportRenderHtmlRefFromMetadata } from "./gmailPersistRenderArtifact.ts";
import { importGmailAttachmentsForMessage } from "./gmailImportAttachments.ts";
import type { GmailAttachmentCandidate } from "./gmailMimeAttachments.ts";
import {
  finalizeStagedImportAttachmentsToMessage,
  type StagedImportAttachmentRef,
} from "./gmailStageImportCandidateAttachments.ts";
import {
  classifyGmailAttachmentMaterializePath,
  classifyGmailHtmlRenderPath,
  logGmailApproveMaterializeV1,
} from "./gmailImportObservability.ts";
import { isGmailMaterializationArtifactV1 } from "./prepareImportCandidateMaterialization.ts";
import { logGmailImportMaterializeAttachmentSubstepV1 } from "./gmailImportMaterializeAttachmentSubstepObservability.ts";
import {
  enqueueGmailImportSecondaryPending,
  markImportCandidateSecondaryDegraded,
  type GmailSecondaryPendingKind,
} from "./gmailImportSecondaryFollowup.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

function pendingKindForSecondaryStep(step: string): GmailSecondaryPendingKind {
  if (step === "staged_attachment_metadata_update" || step === "live_attachment_metadata_update") {
    return "attachment_metadata_update";
  }
  return "render_or_metadata";
}

async function recordGmailSecondaryFailuresWithBacklog(
  supabaseAdmin: SupabaseClient,
  opts: {
    photographerId: string;
    importCandidateId: string;
    threadId: string;
    messageId: string;
    baseMetadata: Record<string, unknown>;
    failures: { step: string; error: string }[];
  },
): Promise<void> {
  const { photographerId, importCandidateId, threadId, messageId, baseMetadata, failures } = opts;
  if (failures.length === 0) return;

  await markImportCandidateSecondaryDegraded(supabaseAdmin, importCandidateId, photographerId);

  for (const f of failures) {
    await enqueueGmailImportSecondaryPending(supabaseAdmin, {
      photographerId,
      importCandidateId,
      messageId,
      threadId,
      pendingKind: pendingKindForSecondaryStep(f.step),
      detail: { step: f.step, error: f.error.slice(0, 500) },
    });
  }

  const prevGi =
    baseMetadata.gmail_import && typeof baseMetadata.gmail_import === "object"
      ? { ...(baseMetadata.gmail_import as Record<string, unknown>) }
      : {};
  const prev = Array.isArray(prevGi.secondary_write_failures)
    ? [...(prevGi.secondary_write_failures as unknown[])]
    : [];
  const at = new Date().toISOString();
  for (const f of failures) {
    prev.push({ step: f.step, error: f.error.slice(0, 500), at });
  }
  const { error } = await supabaseAdmin
    .from("messages")
    .update({
      metadata: {
        ...baseMetadata,
        gmail_import: { ...prevGi, secondary_write_failures: prev },
      },
    })
    .eq("id", messageId);
  if (error) {
    console.error("[gmailImportMaterialize] secondary_write_failures persist", error.message);
  }
}

export function gmailExternalThreadKey(rawProviderThreadId: string): string {
  return `gmail:${rawProviderThreadId}`;
}

/**
 * Inbound-From extraction lives in its own pure module so unit tests can
 * import it without dragging in the Deno `npm:@supabase/...` client.
 * Re-exported here for backwards compatibility with existing callers.
 */
export { readInboundFromHeader } from "./readInboundFromHeader.ts";
import { inboundMetadataHeadersForClassifier, readInboundFromHeader } from "./readInboundFromHeader.ts";

export type ApproveMaterialization = {
  body: string;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  gmailImport: {
    gmailMessageId: string;
    accessToken: string;
    candidates: GmailAttachmentCandidate[];
  } | null;
  stagedAttachments: StagedImportAttachmentRef[];
  usedPreparedArtifact: boolean;
};

export async function loadGmailImportForApprove(
  row: Record<string, unknown>,
  opts?: {
    gmailAccountTokenCache?: GmailAccountTokenCache | null;
    gmailThreadFetchCache?: GmailThreadFetchCache | null;
  },
): Promise<ApproveMaterialization> {
  const rawArt = row.materialization_artifact;
  if (
    row.materialization_prepare_status === "prepared" &&
    rawArt &&
    isGmailMaterializationArtifactV1(rawArt)
  ) {
    return {
      body: rawArt.body,
      metadata: rawArt.metadata as Record<string, unknown>,
      raw_payload: rawArt.raw_payload as Record<string, unknown>,
      gmailImport: null,
      stagedAttachments: Array.isArray(rawArt.staged_attachments)
        ? (rawArt.staged_attachments as StagedImportAttachmentRef[])
        : [],
      usedPreparedArtifact: true,
    };
  }

  /** A2/G3: same Storage + `render_html_ref` path as prepare — keeps hot `messages` rows lean on approve fallback. */
  const photographerId = typeof row.photographer_id === "string" ? row.photographer_id : null;
  const importCandidateId = typeof row.id === "string" ? row.id : null;
  const persistRender =
    photographerId && importCandidateId
      ? { photographerId, importCandidateId }
      : null;

  const bundle = await computeGmailMaterializationBundle(
    row.connected_account_id as string,
    row.raw_provider_thread_id as string,
    typeof row.snippet === "string" ? row.snippet : null,
    persistRender,
    opts?.gmailAccountTokenCache ?? undefined,
    opts?.gmailThreadFetchCache ?? undefined,
  );
  return {
    body: bundle.body,
    metadata: bundle.metadata,
    raw_payload: bundle.raw_payload,
    gmailImport: bundle.gmailImport,
    stagedAttachments: [],
    usedPreparedArtifact: false,
  };
}

export type MaterializeGmailImportCandidateParams = {
  photographerId: string;
  importCandidateId: string;
  /** Row from `import_candidates` including materialization columns. */
  row: Record<string, unknown>;
  /** G5: when set, thread is filed under this wedding (Pipeline project). */
  weddingId: string | null;
  /** Optional G5 audit — embedded in `ai_routing_metadata` + import_provenance. */
  gmailLabelImportGroupId?: string | null;
  materializedWeddingId?: string | null;
  now: string;
  /** Grouped batch: reuse OAuth resolution across rows in the same chunk (same connected account). */
  gmailAccountTokenCache?: GmailAccountTokenCache | null;
  /** Grouped batch: reuse cold-path Gmail thread fetch when the same thread is processed twice in one chunk. */
  gmailThreadFetchCache?: GmailThreadFetchCache | null;
  /** Grouped approval: clear import_approval_error when approving (RPC). */
  clearImportApprovalError?: boolean;
  /**
   * G5 Chunk 3: normalized inbound sender emails already linked to this batch
   * wedding for the same `gmail_label_import_group_id` (plus same-chunk overlay).
   */
  groupedAttachmentAnchorEmails?: string[] | null;
};

export type MaterializeGmailImportCandidateResult =
  | {
      threadId: string;
      needsThreadWeddingIdUpdate: boolean;
      /** True when new thread path: `complete_gmail_import_materialize_new_thread` approved the candidate. */
      finalizedCore: boolean;
      messageId?: string;
      /**
       * True when the inbound suppression classifier flagged this candidate
       * as promo / system / non-client. Grouped approval still wants this
       * signal so it does not force-attach the thread to the batch wedding.
       */
      suppressed?: boolean;
      /** Machine-readable suppression verdict when `suppressed === true`. */
      suppressionVerdict?: string;
      /** Grouped import only — false means thread must stay unfiled despite passing suppression. */
      groupedAttachmentEligible?: boolean;
      groupedAttachmentReason?: string;
      groupedAttachmentEvidence?: Record<string, unknown>;
      normalizedInboundEmail?: string | null;
    }
  | { error: string };

/**
 * Creates or links canonical thread + first message for this candidate.
 *
 * New-thread path: DB core (thread + message + render FK + import_candidates approve) runs in one RPC.
 * Reuse-thread path: returns existing `threadId`; caller must `finalizeApprovedImportCandidate` (RPC).
 *
 * `needsThreadWeddingIdUpdate`: when true, the thread row existed before materialize (reuse path)
 * and grouped callers pass `threadWeddingId` into finalize RPC. New threads set `wedding_id` on insert.
 */
export async function materializeGmailImportCandidate(
  supabaseAdmin: SupabaseClient,
  params: MaterializeGmailImportCandidateParams,
): Promise<MaterializeGmailImportCandidateResult> {
  const {
    photographerId,
    importCandidateId,
    row,
    weddingId,
    gmailLabelImportGroupId,
    materializedWeddingId,
    now,
    gmailAccountTokenCache,
    gmailThreadFetchCache,
    clearImportApprovalError = false,
    groupedAttachmentAnchorEmails = null,
  } = params;

  /** Grouped batch passes chunk caches — match fallback bundle substep telemetry scope. */
  const attachmentSubstepTel = Boolean(gmailAccountTokenCache || gmailThreadFetchCache);

  const rawProviderThreadId = row.raw_provider_thread_id as string;
  const connectedAccountId = row.connected_account_id as string;
  const subject = row.subject as string | null | undefined;
  const sourceLabelName = row.source_label_name as string;
  const sourceIdentifier = row.source_identifier as string;

  const externalKey = gmailExternalThreadKey(rawProviderThreadId);

  const { data: existing } = await supabaseAdmin
    .from("threads")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("channel", "email")
    .eq("external_thread_key", externalKey)
    .maybeSingle();

  let threadId: string;
  /** New-thread insert sets `wedding_id`; reuse path may still need caller to assign wedding. */
  let needsThreadWeddingIdUpdate = false;

  if (existing?.id) {
    threadId = existing.id as string;
    needsThreadWeddingIdUpdate = true;

    const { data: acctReuse } = await supabaseAdmin
      .from("connected_accounts")
      .select("email")
      .eq("id", connectedAccountId)
      .maybeSingle();

    const reuseBundle = await loadGmailImportForApprove(row, {
      gmailAccountTokenCache,
      gmailThreadFetchCache,
    });
    const inboundFromReuse = readInboundFromHeader(reuseBundle.metadata);
    const senderLabelReuse =
      inboundFromReuse?.trim() ||
      (acctReuse?.email as string | undefined)?.trim() ||
      "Gmail";
    const headerSliceReuse = inboundMetadataHeadersForClassifier(reuseBundle.metadata);
    const suppressionReuse = classifyGmailImportCandidate({
      senderRaw: inboundFromReuse ?? senderLabelReuse,
      subject: typeof subject === "string" ? subject : null,
      snippet: typeof row.snippet === "string" ? row.snippet : null,
      body: reuseBundle.body,
      sourceLabelName,
      headers: headerSliceReuse ?? undefined,
    });
    const suppressedReuse = suppressionReuse.suppressed;

    let groupedReuseEligibility:
      | {
          eligible: boolean;
          reason: string;
          normalizedEmail: string | null;
          evidence?: Record<string, unknown>;
        }
      | null = null;
    if (gmailLabelImportGroupId && !suppressedReuse) {
      const norm = extractSenderEmailFromRaw(inboundFromReuse ?? senderLabelReuse);
      const anchorReuse = new Set(groupedAttachmentAnchorEmails ?? []);
      const knownReuse = await photographerHasClientMatchingEmail(
        supabaseAdmin,
        photographerId,
        norm,
      );
      const evReuse = evaluateGroupedImportAttachmentEligibility({
        normalizedSenderEmail: norm,
        anchorNormalizedEmails: anchorReuse,
        knownClientEmailMatch: knownReuse,
      });
      groupedReuseEligibility = {
        eligible: evReuse.eligible,
        reason: evReuse.reason,
        normalizedEmail: norm,
        evidence: evReuse.evidence,
      };
    }

    logGmailApproveMaterializeV1({
      photographer_id: photographerId,
      import_candidate_id: importCandidateId,
      thread_id: threadId,
      message_id: "",
      used_prepared_artifact: reuseBundle.usedPreparedArtifact,
      materialization_prepare_status: row.materialization_prepare_status as string | null,
      html_render_path: "none",
      approve_fallback_no_prepared_artifact: !reuseBundle.usedPreparedArtifact,
      html_fallback_inline_not_storage: false,
      attachment_path: "none",
      grouped_batch: Boolean(gmailLabelImportGroupId),
      reuse_existing_thread: true,
    });
    return {
      threadId,
      needsThreadWeddingIdUpdate: true,
      finalizedCore: false,
      ...(suppressedReuse
        ? { suppressed: true, suppressionVerdict: suppressionReuse.verdict }
        : {}),
      ...(gmailLabelImportGroupId && !suppressedReuse && groupedReuseEligibility
        ? {
            groupedAttachmentEligible: groupedReuseEligibility.eligible,
            groupedAttachmentReason: groupedReuseEligibility.reason,
            groupedAttachmentEvidence: groupedReuseEligibility.evidence,
            normalizedInboundEmail: groupedReuseEligibility.normalizedEmail ?? undefined,
          }
        : {}),
    };
  }

  const { data: acct } = await supabaseAdmin
    .from("connected_accounts")
    .select("email")
    .eq("id", connectedAccountId)
    .maybeSingle();

    const title =
      typeof subject === "string" && subject.trim().length > 0
        ? subject.trim().slice(0, 500)
        : "Gmail thread";

    const {
      body: bodyText,
      metadata: msgMeta,
      raw_payload: msgRaw,
      gmailImport,
      stagedAttachments,
      usedPreparedArtifact,
    } = await loadGmailImportForApprove(row, { gmailAccountTokenCache, gmailThreadFetchCache });

    /**
     * Real inbound `From` lives in `metadata.gmail_import.inbound_headers.from`
     * (persisted by `extractSuppressionRelevantInboundHeaders` during bundle
     * compute). Fall back to the connected-account mailbox only when no header
     * is recoverable — that is the photographer's own address and is wrong as
     * an inbound sender, but better than `"Gmail"` for legacy / fallback rows.
     */
    const inboundFromHeader = readInboundFromHeader(msgMeta);
    const senderLabel =
      inboundFromHeader?.trim() ||
      (acct?.email as string | undefined)?.trim() ||
      "Gmail";

    /**
     * Suppression guard — DO NOT CRM-link promo / system / non-client threads to
     * the batch-created inquiry wedding. Thread still materializes (canonical
     * inbox visibility preserved) but `effectiveWeddingId` drops to null so
     * grouped label imports cannot auto-create inquiry-stage weddings for
     * newsletters / OTA blasts / automated notifications.
     *
     * IMPORTANT: feed the REAL inbound `From` (not the photographer mailbox)
     * to the classifier so sender local-part / domain heuristics actually fire
     * for OTA / marketing senders like `email.campaign@sg.booking.com`.
     */
    const headerSliceNew = inboundMetadataHeadersForClassifier(msgMeta);
    const suppressionClassification = classifyGmailImportCandidate({
      senderRaw: inboundFromHeader ?? senderLabel,
      subject: typeof subject === "string" ? subject : null,
      snippet: typeof row.snippet === "string" ? row.snippet : null,
      body: bodyText,
      sourceLabelName,
      headers: headerSliceNew ?? undefined,
    });
    const suppressed = suppressionClassification.suppressed;
    const groupedImport = Boolean(gmailLabelImportGroupId);

    let groupedAttachmentEligible: boolean | undefined;
    let groupedAttachmentReason: string | undefined;
    let groupedAttachmentEvidence: Record<string, unknown> | undefined;
    let normalizedInboundEmail: string | null = null;

    if (groupedImport && !suppressed) {
      normalizedInboundEmail = extractSenderEmailFromRaw(inboundFromHeader ?? senderLabel);
      const anchorSet = new Set(groupedAttachmentAnchorEmails ?? []);
      const knownClient = await photographerHasClientMatchingEmail(
        supabaseAdmin,
        photographerId,
        normalizedInboundEmail,
      );
      const elig = evaluateGroupedImportAttachmentEligibility({
        normalizedSenderEmail: normalizedInboundEmail,
        anchorNormalizedEmails: anchorSet,
        knownClientEmailMatch: knownClient,
      });
      groupedAttachmentEligible = elig.eligible;
      groupedAttachmentReason = elig.reason;
      groupedAttachmentEvidence = elig.evidence;
    }

    const attachmentPassesGroupedGate = !groupedImport || groupedAttachmentEligible === true;
    const effectiveWeddingId = suppressed ? null : attachmentPassesGroupedGate ? weddingId : null;

    const suppressionMetadata = suppressed
      ? {
          suppression: {
            verdict: suppressionClassification.verdict,
            reasons: suppressionClassification.reasons,
            confidence: suppressionClassification.confidence,
            at: now,
            origin: "gmail_import_materialize",
            original_grouped_wedding_id: weddingId,
          },
        }
      : {};

    const groupedAttachmentSkipMetadata =
      groupedImport && !suppressed && !attachmentPassesGroupedGate
        ? {
            grouped_attachment_eligibility: {
              eligible: false,
              reason: groupedAttachmentReason,
              evidence: groupedAttachmentEvidence,
              at: now,
            },
          }
        : {};

    const provenance = {
      source: "gmail_label_import" as const,
      import_candidate_id: importCandidateId,
      gmail_thread_id: rawProviderThreadId,
      source_label_name: sourceLabelName,
      source_label_id: sourceIdentifier,
      connected_account_id: connectedAccountId,
      ...(gmailLabelImportGroupId
        ? { gmail_label_import_group_id: gmailLabelImportGroupId }
        : {}),
      ...(materializedWeddingId ? { materialized_wedding_id: materializedWeddingId } : {}),
      ...suppressionMetadata,
      ...groupedAttachmentSkipMetadata,
    };

    const importProvenance: Record<string, unknown> = {
      source: "gmail_label_import",
      gmail_thread_id: rawProviderThreadId,
      materialized_at: now,
      ...(gmailLabelImportGroupId ? { gmail_label_import_group_id: gmailLabelImportGroupId } : {}),
      ...(materializedWeddingId ? { materialized_wedding_id: materializedWeddingId } : {}),
      ...groupedAttachmentSkipMetadata,
    };

    const renderRef = parseGmailImportRenderHtmlRefFromMetadata(msgMeta);

    const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc(
      "complete_gmail_import_materialize_new_thread",
      {
        p_photographer_id: photographerId,
        p_import_candidate_id: importCandidateId,
        p_connected_account_id: connectedAccountId,
        p_external_thread_key: externalKey,
        p_thread_title: title,
        p_thread_wedding_id: effectiveWeddingId,
        p_last_activity_at: now,
        p_ai_routing_metadata: provenance,
        p_message_body: bodyText,
        p_message_sender: senderLabel,
        p_message_sent_at: now,
        p_message_metadata: msgMeta,
        p_message_raw_payload: Object.keys(msgRaw).length > 0 ? msgRaw : null,
        p_import_provenance: importProvenance,
        p_render_artifact_id: renderRef?.artifact_id ?? null,
        p_clear_import_approval_error: clearImportApprovalError,
      },
    );

    if (rpcErr) {
      console.error("[gmailImportMaterialize] complete_gmail_import_materialize_new_thread", rpcErr.message);
      return { error: rpcErr.message };
    }

    const rpcRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const r = rpcRow as Record<string, unknown>;
    const outThread = r.out_thread_id;
    const outMessage = r.out_message_id;
    if (typeof outThread !== "string" || typeof outMessage !== "string") {
      return { error: "materialize_rpc_invalid_response" };
    }

    threadId = outThread;
    const msgInserted = { id: outMessage };

    const secondaryFailures: { step: string; error: string }[] = [];

    if (stagedAttachments.length > 0) {
      const tStaged = Date.now();
      let fin: Awaited<ReturnType<typeof finalizeStagedImportAttachmentsToMessage>>;
      try {
        fin = await finalizeStagedImportAttachmentsToMessage(supabaseAdmin, {
          photographerId,
          messageId: msgInserted.id as string,
          importCandidateId,
          staged: stagedAttachments,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attachmentSubstepTel) {
          logGmailImportMaterializeAttachmentSubstepV1({
            stage: "staged_finalize",
            duration_ms: Date.now() - tStaged,
            ok: false,
            outcome: msg.slice(0, 300),
            photographer_id: photographerId,
            import_candidate_id: importCandidateId,
            thread_id: threadId,
            message_id: msgInserted.id as string,
            gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
            staged_count: stagedAttachments.length,
          });
        }
        throw e;
      }
      if (attachmentSubstepTel) {
        logGmailImportMaterializeAttachmentSubstepV1({
          stage: "staged_finalize",
          duration_ms: Date.now() - tStaged,
          ok: true,
          photographer_id: photographerId,
          import_candidate_id: importCandidateId,
          thread_id: threadId,
          message_id: msgInserted.id as string,
          gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
          staged_count: stagedAttachments.length,
        });
      }
      console.log(
        JSON.stringify({
          type: "gmail_import_attachments_staged_finalize",
          message_id: msgInserted.id,
          ...fin,
          used_prepared_artifact: usedPreparedArtifact,
        }),
      );
      const prevGi = (msgMeta as { gmail_import?: Record<string, unknown> }).gmail_import ?? {};
      const pipeline = prevGi.attachment_pipeline;
      const tStagedMeta = Date.now();
      const { error: metaUpErr } = await supabaseAdmin
        .from("messages")
        .update({
          metadata: {
            ...msgMeta,
            gmail_import: {
              ...prevGi,
              attachment_import: {
                pipeline,
                candidate_count: stagedAttachments.length,
                imported: fin.imported,
                failed: fin.failed,
                skipped_oversized: 0,
                skipped_oversized_prefetch: 0,
                skipped_already_present: 0,
                source: "staged_finalize",
              },
            },
          },
        })
        .eq("id", msgInserted.id as string);
      if (attachmentSubstepTel) {
        logGmailImportMaterializeAttachmentSubstepV1({
          stage: "staged_metadata_update",
          duration_ms: Date.now() - tStagedMeta,
          ok: !metaUpErr,
          outcome: metaUpErr ? metaUpErr.message.slice(0, 300) : undefined,
          photographer_id: photographerId,
          import_candidate_id: importCandidateId,
          thread_id: threadId,
          message_id: msgInserted.id as string,
          gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
        });
      }
      if (metaUpErr) {
        secondaryFailures.push({ step: "staged_attachment_metadata_update", error: metaUpErr.message });
      }
      if (fin.failed > 0) {
        await markImportCandidateSecondaryDegraded(supabaseAdmin, importCandidateId, photographerId);
        await enqueueGmailImportSecondaryPending(supabaseAdmin, {
          photographerId,
          importCandidateId,
          messageId: msgInserted.id as string,
          threadId,
          pendingKind: "staged_attachments_finalize",
          detail: { imported: fin.imported, failed: fin.failed },
        });
      }
    } else if (gmailImport && gmailImport.candidates.length > 0) {
      const tLive = Date.now();
      let att: Awaited<ReturnType<typeof importGmailAttachmentsForMessage>>;
      try {
        att = await importGmailAttachmentsForMessage(supabaseAdmin, {
          accessToken: gmailImport.accessToken,
          gmailMessageId: gmailImport.gmailMessageId,
          photographerId,
          messageId: msgInserted.id as string,
          candidates: gmailImport.candidates,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attachmentSubstepTel) {
          logGmailImportMaterializeAttachmentSubstepV1({
            stage: "live_import",
            duration_ms: Date.now() - tLive,
            ok: false,
            outcome: msg.slice(0, 300),
            photographer_id: photographerId,
            import_candidate_id: importCandidateId,
            thread_id: threadId,
            message_id: msgInserted.id as string,
            gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
            live_candidate_count: gmailImport.candidates.length,
          });
        }
        throw e;
      }
      if (attachmentSubstepTel) {
        logGmailImportMaterializeAttachmentSubstepV1({
          stage: "live_import",
          duration_ms: Date.now() - tLive,
          ok: true,
          photographer_id: photographerId,
          import_candidate_id: importCandidateId,
          thread_id: threadId,
          message_id: msgInserted.id as string,
          gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
          live_candidate_count: gmailImport.candidates.length,
        });
      }
      console.log(
        JSON.stringify({
          type: "gmail_import_attachments",
          message_id: msgInserted.id,
          ...att,
          used_prepared_artifact: usedPreparedArtifact,
        }),
      );
      const prevGi = (msgMeta as { gmail_import?: Record<string, unknown> }).gmail_import ?? {};
      const pipeline = prevGi.attachment_pipeline;
      const tLiveMeta = Date.now();
      const { error: metaUpErr } = await supabaseAdmin
        .from("messages")
        .update({
          metadata: {
            ...msgMeta,
            gmail_import: {
              ...prevGi,
              attachment_import: {
                pipeline,
                candidate_count: gmailImport.candidates.length,
                imported: att.imported,
                failed: att.failed,
                skipped_oversized: att.skipped_oversized,
                skipped_oversized_prefetch: att.skipped_oversized_prefetch,
                skipped_already_present: att.skipped_already_present,
              },
            },
          },
        })
        .eq("id", msgInserted.id as string);
      if (attachmentSubstepTel) {
        logGmailImportMaterializeAttachmentSubstepV1({
          stage: "live_metadata_update",
          duration_ms: Date.now() - tLiveMeta,
          ok: !metaUpErr,
          outcome: metaUpErr ? metaUpErr.message.slice(0, 300) : undefined,
          photographer_id: photographerId,
          import_candidate_id: importCandidateId,
          thread_id: threadId,
          message_id: msgInserted.id as string,
          gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
        });
      }
      if (metaUpErr) {
        secondaryFailures.push({ step: "live_attachment_metadata_update", error: metaUpErr.message });
      }
    } else if (attachmentSubstepTel) {
      logGmailImportMaterializeAttachmentSubstepV1({
        stage: "attachments_skip",
        duration_ms: 0,
        ok: true,
        outcome: "no_staged_no_live_candidates",
        photographer_id: photographerId,
        import_candidate_id: importCandidateId,
        thread_id: threadId,
        message_id: msgInserted.id as string,
        gmail_label_import_group_id: gmailLabelImportGroupId ?? null,
      });
    }

    await recordGmailSecondaryFailuresWithBacklog(supabaseAdmin, {
      photographerId,
      importCandidateId,
      threadId,
      messageId: msgInserted.id as string,
      baseMetadata: msgMeta,
      failures: secondaryFailures,
    });

    const htmlPath = classifyGmailHtmlRenderPath(msgMeta);
    const attPath = classifyGmailAttachmentMaterializePath({
      stagedCount: stagedAttachments.length,
      liveCandidateCount: gmailImport?.candidates?.length ?? 0,
    });
    logGmailApproveMaterializeV1({
      photographer_id: photographerId,
      import_candidate_id: importCandidateId,
      thread_id: threadId,
      message_id: msgInserted.id as string,
      used_prepared_artifact: usedPreparedArtifact,
      materialization_prepare_status: row.materialization_prepare_status as string | null,
      html_render_path: htmlPath,
      approve_fallback_no_prepared_artifact: !usedPreparedArtifact,
      html_fallback_inline_not_storage: htmlPath === "inline_metadata",
      attachment_path: attPath,
      grouped_batch: Boolean(gmailLabelImportGroupId),
    });

    return {
      threadId,
      needsThreadWeddingIdUpdate: false,
      finalizedCore: true,
      messageId: msgInserted.id as string,
      ...(suppressed
        ? {
            suppressed: true,
            suppressionVerdict: suppressionClassification.verdict,
          }
        : {}),
      ...(groupedImport && !suppressed
        ? {
            groupedAttachmentEligible,
            groupedAttachmentReason,
            groupedAttachmentEvidence,
            normalizedInboundEmail: normalizedInboundEmail ?? undefined,
          }
        : {}),
    };
}

/** Create a Pipeline wedding used as the G5 project container for a Gmail label batch. */
export async function createGmailLabelImportWedding(
  supabaseAdmin: SupabaseClient,
  opts: { photographerId: string; labelName: string; now: string },
): Promise<{ weddingId: string } | { error: string }> {
  const coupleNames = `Gmail label: ${opts.labelName}`.trim().slice(0, 500);
  const { data: w, error } = await supabaseAdmin
    .from("weddings")
    .insert({
      photographer_id: opts.photographerId,
      couple_names: coupleNames.length > 0 ? coupleNames : "Gmail import",
      location: "TBD",
      wedding_date: opts.now,
      stage: "inquiry",
      package_inclusions: [],
    })
    .select("id")
    .single();

  if (error || !w?.id) {
    console.error("[gmailImportMaterialize] wedding insert", error?.message);
    return { error: error?.message ?? "wedding_insert_failed" };
  }
  return { weddingId: w.id as string };
}
