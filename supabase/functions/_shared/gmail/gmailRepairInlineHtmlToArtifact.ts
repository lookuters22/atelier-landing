/**
 * A2: Move legacy inline `gmail_import.body_html_sanitized` on `messages` to Storage +
 * `gmail_render_artifacts` + compact `render_html_ref` (same shape as G3 new writes).
 * Idempotent: safe to rerun; skips rows already ref-backed or without inline HTML.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  applyGmailRenderRefToMetadata,
  parseGmailImportRenderHtmlRefFromMetadata,
  persistGmailRenderHtmlArtifact,
} from "./gmailPersistRenderArtifact.ts";

export type GmailInlineHtmlRepairEligibility =
  | "eligible"
  | "skipped_already_ref"
  | "skipped_artifact_fk"
  | "skipped_no_inline";

/** Pure predicate for tests and pre-checks (does not read DB). */
export function gmailMessageInlineHtmlRepairEligibility(
  metadata: unknown,
  gmailRenderArtifactId: string | null | undefined,
): GmailInlineHtmlRepairEligibility {
  if (gmailRenderArtifactId) return "skipped_artifact_fk";
  if (parseGmailImportRenderHtmlRefFromMetadata(metadata)) return "skipped_already_ref";
  if (!metadata || typeof metadata !== "object") return "skipped_no_inline";
  const gi = (metadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return "skipped_no_inline";
  const h = (gi as Record<string, unknown>).body_html_sanitized;
  if (typeof h !== "string" || h.trim().length === 0) return "skipped_no_inline";
  return "eligible";
}

export type RepairGmailMessageInlineHtmlOutcome =
  | { outcome: "migrated"; message_id: string; artifact_id: string }
  | { outcome: "skipped_already_ref" | "skipped_artifact_fk" | "skipped_no_inline"; message_id: string }
  | { outcome: "failed"; message_id: string; reason: string };

/**
 * Repair one message by id: re-fetch, persist HTML, strip inline from metadata.
 * On persist failure, leaves the row unchanged (legacy inline still works for reads).
 */
export async function repairGmailMessageInlineHtmlToArtifact(
  supabase: SupabaseClient,
  messageId: string,
): Promise<RepairGmailMessageInlineHtmlOutcome> {
  const { data: row, error: fetchErr } = await supabase
    .from("messages")
    .select("id, photographer_id, metadata, gmail_render_artifact_id")
    .eq("id", messageId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { outcome: "failed", message_id: messageId, reason: fetchErr?.message ?? "not_found" };
  }

  const meta = row.metadata as Record<string, unknown> | null;
  const eligibility = gmailMessageInlineHtmlRepairEligibility(meta, row.gmail_render_artifact_id);
  if (eligibility === "skipped_already_ref") {
    return { outcome: "skipped_already_ref", message_id: messageId };
  }
  if (eligibility === "skipped_artifact_fk") {
    return { outcome: "skipped_artifact_fk", message_id: messageId };
  }
  if (eligibility === "skipped_no_inline") {
    return { outcome: "skipped_no_inline", message_id: messageId };
  }

  const gi = meta!.gmail_import as Record<string, unknown>;
  const html = gi.body_html_sanitized;
  if (typeof html !== "string" || html.trim().length === 0) {
    return { outcome: "skipped_no_inline", message_id: messageId };
  }

  const photographerId = row.photographer_id as string;

  const persisted = await persistGmailRenderHtmlArtifact(supabase, {
    photographerId,
    html,
    messageId,
  });

  if (!persisted.ok) {
    return {
      outcome: "failed",
      message_id: messageId,
      reason: persisted.error,
    };
  }

  const newMetadata = applyGmailRenderRefToMetadata(meta!, persisted.ref);

  const { error: upErr } = await supabase
    .from("messages")
    .update({
      metadata: newMetadata as unknown as Record<string, unknown>,
      gmail_render_artifact_id: persisted.artifactId,
    })
    .eq("id", messageId);

  if (upErr) {
    return { outcome: "failed", message_id: messageId, reason: upErr.message };
  }

  return {
    outcome: "migrated",
    message_id: messageId,
    artifact_id: persisted.artifactId,
  };
}

export type RunGmailInlineHtmlRepairBatchResult = {
  scanned: number;
  migrated: number;
  skipped_already_ref: number;
  skipped_artifact_fk: number;
  skipped_no_inline: number;
  failed: number;
  /** One line per failure (bounded). */
  failure_samples: string[];
};

const MAX_FAILURE_SAMPLES = 8;

/**
 * Scan RPC candidates and repair each row. Reruns are safe: repaired rows drop out of the scan.
 */
export async function runGmailInlineHtmlRepairBatch(
  supabase: SupabaseClient,
  opts?: { limit?: number; p_after?: string | null },
): Promise<RunGmailInlineHtmlRepairBatchResult> {
  const limit = opts?.limit ?? 25;
  const { data: candidates, error: rpcErr } = await supabase.rpc(
    "gmail_messages_inline_html_repair_candidates_v1",
    {
      p_limit: limit,
      p_after: opts?.p_after ?? null,
    },
  );

  if (rpcErr) {
    return {
      scanned: 0,
      migrated: 0,
      skipped_already_ref: 0,
      skipped_artifact_fk: 0,
      skipped_no_inline: 0,
      failed: 0,
      failure_samples: [rpcErr.message],
    };
  }

  const rows = (candidates ?? []) as {
    id: string;
    photographer_id: string;
    metadata: unknown;
  }[];

  const acc: RunGmailInlineHtmlRepairBatchResult = {
    scanned: rows.length,
    migrated: 0,
    skipped_already_ref: 0,
    skipped_artifact_fk: 0,
    skipped_no_inline: 0,
    failed: 0,
    failure_samples: [],
  };

  for (const r of rows) {
    const res = await repairGmailMessageInlineHtmlToArtifact(supabase, r.id);
    switch (res.outcome) {
      case "migrated":
        acc.migrated += 1;
        break;
      case "skipped_already_ref":
        acc.skipped_already_ref += 1;
        break;
      case "skipped_artifact_fk":
        acc.skipped_artifact_fk += 1;
        break;
      case "skipped_no_inline":
        acc.skipped_no_inline += 1;
        break;
      case "failed":
        acc.failed += 1;
        if (acc.failure_samples.length < MAX_FAILURE_SAMPLES) {
          acc.failure_samples.push(`${res.message_id}:${res.reason}`);
        }
        break;
    }
  }

  return acc;
}
