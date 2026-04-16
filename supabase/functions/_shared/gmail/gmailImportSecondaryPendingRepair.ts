/**
 * Minimal consumer for `gmail_import_secondary_pending`: retries degraded follow-ups (render FK,
 * attachment metadata merge, staged finalize). Invoked from gmail-repair-ops (service_role).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isGmailMaterializationArtifactV1 } from "./gmailMaterializationArtifactV1.ts";
import { parseGmailImportRenderHtmlRefFromMetadata } from "./gmailPersistRenderArtifact.ts";
import {
  finalizeStagedImportAttachmentsToMessage,
  type StagedImportAttachmentRef,
} from "./gmailStageImportCandidateAttachments.ts";
import type { GmailSecondaryPendingKind } from "./gmailImportSecondaryFollowup.ts";

export type GmailSecondaryPendingBatchResult = {
  scanned: number;
  completed: number;
  failed: number;
  skipped: number;
  samples: { id: string; pending_kind: string; outcome: string }[];
};

export function secondaryPendingRenderRepairEligibility(
  metadata: unknown,
  gmailRenderArtifactId: string | null,
): "no_ref" | "already_linked" | "needs_link" {
  const ref = parseGmailImportRenderHtmlRefFromMetadata(metadata);
  if (!ref) return "no_ref";
  if (gmailRenderArtifactId === ref.artifact_id) return "already_linked";
  return "needs_link";
}

async function mergeFailureDetail(
  supabase: SupabaseClient,
  rowId: string,
  photographerId: string,
  prev: Record<string, unknown>,
  err: string,
): Promise<void> {
  const attempts = typeof prev.repair_attempts === "number" ? prev.repair_attempts : 0;
  await supabase
    .from("gmail_import_secondary_pending")
    .update({
      updated_at: new Date().toISOString(),
      detail: {
        ...prev,
        last_error: err.slice(0, 500),
        last_attempt_at: new Date().toISOString(),
        repair_attempts: attempts + 1,
      },
    })
    .eq("id", rowId)
    .eq("photographer_id", photographerId);
}

async function markDone(
  supabase: SupabaseClient,
  rowId: string,
  photographerId: string,
  prev: Record<string, unknown>,
  extra: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from("gmail_import_secondary_pending")
    .update({
      status: "done",
      updated_at: new Date().toISOString(),
      detail: { ...prev, ...extra, repaired_at: new Date().toISOString() },
    })
    .eq("id", rowId)
    .eq("photographer_id", photographerId);
}

async function processRenderOrMetadata(
  supabase: SupabaseClient,
  row: {
    id: string;
    photographer_id: string;
    message_id: string;
    detail: Record<string, unknown>;
  },
): Promise<{ ok: boolean; outcome: string }> {
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("id, photographer_id, metadata, gmail_render_artifact_id")
    .eq("id", row.message_id)
    .maybeSingle();

  if (msgErr || !msg) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, msgErr?.message ?? "message_not_found");
    return { ok: false, outcome: "message_missing" };
  }
  if (msg.photographer_id !== row.photographer_id) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, "tenant_mismatch_message");
    return { ok: false, outcome: "tenant_mismatch" };
  }

  const meta = msg.metadata as Record<string, unknown>;
  const eligibility = secondaryPendingRenderRepairEligibility(meta, msg.gmail_render_artifact_id as string | null);

  if (eligibility === "no_ref") {
    await markDone(supabase, row.id, row.photographer_id, row.detail, {
      repair_outcome: "skipped_no_render_html_ref",
    });
    return { ok: true, outcome: "skipped_no_ref" };
  }

  if (eligibility === "already_linked") {
    await markDone(supabase, row.id, row.photographer_id, row.detail, { repair_outcome: "already_consistent" });
    return { ok: true, outcome: "already_linked" };
  }

  const ref = parseGmailImportRenderHtmlRefFromMetadata(meta);
  if (!ref) {
    await markDone(supabase, row.id, row.photographer_id, row.detail, { repair_outcome: "skipped_no_render_html_ref" });
    return { ok: true, outcome: "skipped_no_ref" };
  }

  const { error: artErr } = await supabase
    .from("gmail_render_artifacts")
    .update({ message_id: row.message_id })
    .eq("id", ref.artifact_id)
    .eq("photographer_id", row.photographer_id);

  if (artErr) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, artErr.message);
    return { ok: false, outcome: "artifact_update_failed" };
  }

  const { error: mErr } = await supabase
    .from("messages")
    .update({ gmail_render_artifact_id: ref.artifact_id })
    .eq("id", row.message_id)
    .eq("photographer_id", row.photographer_id);

  if (mErr) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, mErr.message);
    return { ok: false, outcome: "message_fk_update_failed" };
  }

  await markDone(supabase, row.id, row.photographer_id, row.detail, {
    repair_outcome: "render_artifact_linked",
    artifact_id: ref.artifact_id,
  });
  return { ok: true, outcome: "linked" };
}

async function processAttachmentMetadataUpdate(
  supabase: SupabaseClient,
  row: {
    id: string;
    photographer_id: string;
    message_id: string;
    import_candidate_id: string;
    detail: Record<string, unknown>;
  },
): Promise<{ ok: boolean; outcome: string }> {
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("id, photographer_id, metadata")
    .eq("id", row.message_id)
    .maybeSingle();

  if (msgErr || !msg) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, msgErr?.message ?? "message_not_found");
    return { ok: false, outcome: "message_missing" };
  }
  if (msg.photographer_id !== row.photographer_id) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, "tenant_mismatch_message");
    return { ok: false, outcome: "tenant_mismatch" };
  }

  const { data: cand, error: cErr } = await supabase
    .from("import_candidates")
    .select("materialization_artifact")
    .eq("id", row.import_candidate_id)
    .eq("photographer_id", row.photographer_id)
    .maybeSingle();

  if (cErr) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, cErr.message);
    return { ok: false, outcome: "candidate_fetch_failed" };
  }

  const msgMeta = (msg.metadata ?? {}) as Record<string, unknown>;
  const prevGi =
    msgMeta.gmail_import && typeof msgMeta.gmail_import === "object"
      ? { ...(msgMeta.gmail_import as Record<string, unknown>) }
      : {};
  const pipeline = prevGi.attachment_pipeline;
  const prevAi =
    prevGi.attachment_import && typeof prevGi.attachment_import === "object"
      ? { ...(prevGi.attachment_import as Record<string, unknown>) }
      : {};

  const { count: dbCount, error: cntErr } = await supabase
    .from("message_attachments")
    .select("id", { count: "exact", head: true })
    .eq("message_id", row.message_id);

  if (cntErr) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, cntErr.message);
    return { ok: false, outcome: "count_failed" };
  }

  const n = dbCount ?? 0;
  let candidateCount = typeof prevAi.candidate_count === "number" ? (prevAi.candidate_count as number) : n;
  const art = cand?.materialization_artifact;
  if (
    isGmailMaterializationArtifactV1(art) &&
    Array.isArray(art.staged_attachments) &&
    art.staged_attachments.length > 0
  ) {
    candidateCount = art.staged_attachments.length;
  }

  const { error: upErr } = await supabase
    .from("messages")
    .update({
      metadata: {
        ...msgMeta,
        gmail_import: {
          ...prevGi,
          attachment_import: {
            ...prevAi,
            pipeline,
            candidate_count: candidateCount,
            imported: n,
            failed: Math.max(0, candidateCount - n),
            skipped_oversized: prevAi.skipped_oversized ?? 0,
            skipped_oversized_prefetch: prevAi.skipped_oversized_prefetch ?? 0,
            skipped_already_present: prevAi.skipped_already_present ?? 0,
            source: "secondary_pending_metadata_repair",
            secondary_pending_repair_at: new Date().toISOString(),
            message_attachments_db_count: n,
          },
        },
      },
    })
    .eq("id", row.message_id)
    .eq("photographer_id", row.photographer_id);

  if (upErr) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, upErr.message);
    return { ok: false, outcome: "metadata_update_failed" };
  }

  await markDone(supabase, row.id, row.photographer_id, row.detail, {
    repair_outcome: "attachment_metadata_reapplied",
    message_attachments_db_count: n,
  });
  return { ok: true, outcome: "metadata_repaired" };
}

async function processStagedAttachmentsFinalize(
  supabase: SupabaseClient,
  row: {
    id: string;
    photographer_id: string;
    message_id: string;
    import_candidate_id: string;
    detail: Record<string, unknown>;
  },
): Promise<{ ok: boolean; outcome: string }> {
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("id, photographer_id, metadata")
    .eq("id", row.message_id)
    .maybeSingle();

  if (msgErr || !msg) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, msgErr?.message ?? "message_not_found");
    return { ok: false, outcome: "message_missing" };
  }
  if (msg.photographer_id !== row.photographer_id) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, "tenant_mismatch_message");
    return { ok: false, outcome: "tenant_mismatch" };
  }

  const { data: cand, error: cErr } = await supabase
    .from("import_candidates")
    .select("materialization_artifact")
    .eq("id", row.import_candidate_id)
    .eq("photographer_id", row.photographer_id)
    .maybeSingle();

  if (cErr || !cand) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, cErr?.message ?? "candidate_missing");
    return { ok: false, outcome: "candidate_fetch_failed" };
  }

  const art = cand.materialization_artifact;
  if (!isGmailMaterializationArtifactV1(art) || !Array.isArray(art.staged_attachments)) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, "no_staged_attachments_in_artifact");
    return { ok: false, outcome: "bad_artifact" };
  }

  const staged = art.staged_attachments as StagedImportAttachmentRef[];
  if (staged.length === 0) {
    await markDone(supabase, row.id, row.photographer_id, row.detail, {
      repair_outcome: "skipped_empty_staged_list",
    });
    return { ok: true, outcome: "empty_staged" };
  }

  let fin: { imported: number; failed: number };
  try {
    fin = await finalizeStagedImportAttachmentsToMessage(supabase, {
      photographerId: row.photographer_id,
      messageId: row.message_id,
      importCandidateId: row.import_candidate_id,
      staged,
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, m);
    return { ok: false, outcome: "finalize_threw" };
  }

  const msgMeta = (msg.metadata ?? {}) as Record<string, unknown>;
  const prevGi =
    msgMeta.gmail_import && typeof msgMeta.gmail_import === "object"
      ? { ...(msgMeta.gmail_import as Record<string, unknown>) }
      : {};
  const pipeline = prevGi.attachment_pipeline;

  const { error: metaUpErr } = await supabase
    .from("messages")
    .update({
      metadata: {
        ...msgMeta,
        gmail_import: {
          ...prevGi,
          attachment_import: {
            pipeline,
            candidate_count: staged.length,
            imported: fin.imported,
            failed: fin.failed,
            skipped_oversized: 0,
            skipped_oversized_prefetch: 0,
            skipped_already_present: 0,
            source: "staged_finalize_secondary_repair",
            secondary_pending_repair_at: new Date().toISOString(),
          },
        },
      },
    })
    .eq("id", row.message_id)
    .eq("photographer_id", row.photographer_id);

  if (metaUpErr) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, metaUpErr.message);
    return { ok: false, outcome: "post_finalize_metadata_failed" };
  }

  if (fin.failed > 0) {
    await mergeFailureDetail(supabase, row.id, row.photographer_id, row.detail, `finalize_partial: imported=${fin.imported} failed=${fin.failed}`);
    return { ok: false, outcome: "partial_finalize" };
  }

  await markDone(supabase, row.id, row.photographer_id, row.detail, {
    repair_outcome: "staged_finalize_complete",
    imported: fin.imported,
    failed: fin.failed,
  });
  return { ok: true, outcome: "staged_done" };
}

async function processOne(
  supabase: SupabaseClient,
  row: {
    id: string;
    photographer_id: string;
    import_candidate_id: string;
    message_id: string;
    pending_kind: string;
    detail: Record<string, unknown> | null;
  },
): Promise<{ ok: boolean; outcome: string }> {
  const kind = row.pending_kind as GmailSecondaryPendingKind;
  const detail = (row.detail && typeof row.detail === "object" ? row.detail : {}) as Record<string, unknown>;

  if (kind === "render_or_metadata") {
    return processRenderOrMetadata(supabase, { ...row, detail });
  }
  if (kind === "attachment_metadata_update") {
    return processAttachmentMetadataUpdate(supabase, { ...row, detail });
  }
  if (kind === "staged_attachments_finalize") {
    return processStagedAttachmentsFinalize(supabase, { ...row, detail });
  }

  await mergeFailureDetail(supabase, row.id, row.photographer_id, detail, `unknown_pending_kind:${row.pending_kind}`);
  return { ok: false, outcome: "unknown_kind" };
}

export async function runGmailImportSecondaryPendingBatch(
  supabase: SupabaseClient,
  opts: { photographerId: string; limit?: number },
): Promise<GmailSecondaryPendingBatchResult> {
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 50);
  const { data: rows, error } = await supabase
    .from("gmail_import_secondary_pending")
    .select("id, photographer_id, import_candidate_id, message_id, pending_kind, detail")
    .eq("photographer_id", opts.photographerId)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return {
      scanned: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      samples: [{ id: "", pending_kind: "", outcome: `query_error:${error.message}` }],
    };
  }

  const list = rows ?? [];
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const samples: GmailSecondaryPendingBatchResult["samples"] = [];

  for (const r of list) {
    const res = await processOne(supabase, r as {
      id: string;
      photographer_id: string;
      import_candidate_id: string;
      message_id: string;
      pending_kind: string;
      detail: Record<string, unknown> | null;
    });
    if (res.ok) {
      completed += 1;
    } else {
      failed += 1;
    }
    if (res.outcome.startsWith("skipped")) skipped += 1;

    if (samples.length < 8) {
      samples.push({ id: r.id as string, pending_kind: r.pending_kind as string, outcome: res.outcome });
    }
  }

  return {
    scanned: list.length,
    completed,
    failed,
    skipped,
    samples,
  };
}
