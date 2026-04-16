/**
 * A2: Repair legacy `import_candidates.materialization_artifact` JSON that still embeds
 * `metadata.gmail_import.body_html_sanitized` — same hybrid model as messages + new prepares.
 *
 * Idempotency: nested `render_html_ref` and/or `materialization_render_artifact_id` cause skip;
 * reruns only process rows still matching the scan (inline + no ref + no FK).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  applyGmailRenderRefToMetadata,
  type GmailImportRenderHtmlRefV1,
  persistGmailRenderHtmlArtifact,
} from "./gmailPersistRenderArtifact.ts";
import {
  gmailMessageInlineHtmlRepairEligibility,
  type GmailInlineHtmlRepairEligibility,
} from "./gmailRepairInlineHtmlToArtifact.ts";
import {
  isGmailMaterializationArtifactV1,
  type GmailMaterializationArtifactV1,
} from "./gmailMaterializationArtifactV1.ts";

export type { GmailInlineHtmlRepairEligibility as GmailImportCandidateArtifactRepairEligibility };

/** Eligibility uses the same rules as message repair on nested `artifact.metadata` + candidate render FK. */
export function gmailImportCandidateArtifactInlineHtmlRepairEligibility(
  materializationArtifact: unknown,
  materializationRenderArtifactId: string | null | undefined,
): GmailInlineHtmlRepairEligibility {
  if (!isGmailMaterializationArtifactV1(materializationArtifact)) {
    return "skipped_no_inline";
  }
  return gmailMessageInlineHtmlRepairEligibility(
    materializationArtifact.metadata,
    materializationRenderArtifactId,
  );
}

/** Apply ref to V1 artifact metadata only — body, raw_payload, staged_attachments unchanged. */
export function applyGmailRenderRefToMaterializationArtifactV1(
  artifact: GmailMaterializationArtifactV1,
  ref: GmailImportRenderHtmlRefV1,
): GmailMaterializationArtifactV1 {
  const meta = artifact.metadata as Record<string, unknown>;
  return {
    ...artifact,
    metadata: applyGmailRenderRefToMetadata(meta, ref),
  };
}

export type RepairImportCandidateArtifactOutcome =
  | { outcome: "migrated"; import_candidate_id: string; artifact_id: string }
  | {
      outcome: "skipped_already_ref" | "skipped_artifact_fk" | "skipped_no_inline";
      import_candidate_id: string;
    }
  | { outcome: "failed"; import_candidate_id: string; reason: string };

export async function repairImportCandidateMaterializationArtifactInlineHtml(
  supabase: SupabaseClient,
  importCandidateId: string,
): Promise<RepairImportCandidateArtifactOutcome> {
  const { data: row, error: fetchErr } = await supabase
    .from("import_candidates")
    .select("id, photographer_id, materialization_artifact, materialization_render_artifact_id")
    .eq("id", importCandidateId)
    .maybeSingle();

  if (fetchErr || !row) {
    return {
      outcome: "failed",
      import_candidate_id: importCandidateId,
      reason: fetchErr?.message ?? "not_found",
    };
  }

  const rawArt = row.materialization_artifact;
  const eligibility = gmailImportCandidateArtifactInlineHtmlRepairEligibility(
    rawArt,
    row.materialization_render_artifact_id,
  );

  if (eligibility === "skipped_already_ref") {
    return { outcome: "skipped_already_ref", import_candidate_id: importCandidateId };
  }
  if (eligibility === "skipped_artifact_fk") {
    return { outcome: "skipped_artifact_fk", import_candidate_id: importCandidateId };
  }
  if (eligibility === "skipped_no_inline") {
    return { outcome: "skipped_no_inline", import_candidate_id: importCandidateId };
  }

  const art = rawArt as GmailMaterializationArtifactV1;
  const gi = art.metadata.gmail_import as Record<string, unknown>;
  const html = gi.body_html_sanitized;
  if (typeof html !== "string" || html.trim().length === 0) {
    return { outcome: "skipped_no_inline", import_candidate_id: importCandidateId };
  }

  const photographerId = row.photographer_id as string;

  const persisted = await persistGmailRenderHtmlArtifact(supabase, {
    photographerId,
    html,
    importCandidateId,
  });

  if (!persisted.ok) {
    return {
      outcome: "failed",
      import_candidate_id: importCandidateId,
      reason: persisted.error,
    };
  }

  const newArtifact = applyGmailRenderRefToMaterializationArtifactV1(art, persisted.ref);
  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("import_candidates")
    .update({
      materialization_artifact: newArtifact as unknown as Record<string, unknown>,
      materialization_render_artifact_id: persisted.artifactId,
      updated_at: now,
    })
    .eq("id", importCandidateId);

  if (upErr) {
    return {
      outcome: "failed",
      import_candidate_id: importCandidateId,
      reason: upErr.message,
    };
  }

  return {
    outcome: "migrated",
    import_candidate_id: importCandidateId,
    artifact_id: persisted.artifactId,
  };
}

export type RunImportCandidateArtifactInlineHtmlRepairBatchResult = {
  scanned: number;
  migrated: number;
  skipped_already_ref: number;
  skipped_artifact_fk: number;
  skipped_no_inline: number;
  failed: number;
  failure_samples: string[];
};

const MAX_FAILURE_SAMPLES = 8;

export async function runImportCandidateArtifactInlineHtmlRepairBatch(
  supabase: SupabaseClient,
  opts?: { limit?: number; p_after?: string | null },
): Promise<RunImportCandidateArtifactInlineHtmlRepairBatchResult> {
  const limit = opts?.limit ?? 25;
  const { data: candidates, error: rpcErr } = await supabase.rpc(
    "gmail_import_candidate_artifact_inline_html_repair_candidates_v1",
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
    materialization_artifact: unknown;
  }[];

  const acc: RunImportCandidateArtifactInlineHtmlRepairBatchResult = {
    scanned: rows.length,
    migrated: 0,
    skipped_already_ref: 0,
    skipped_artifact_fk: 0,
    skipped_no_inline: 0,
    failed: 0,
    failure_samples: [],
  };

  for (const r of rows) {
    const res = await repairImportCandidateMaterializationArtifactInlineHtml(supabase, r.id);
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
          acc.failure_samples.push(`${res.import_candidate_id}:${res.reason}`);
        }
        break;
    }
  }

  return acc;
}
