/**
 * G2: Background preparation of Gmail materialization artifact for staged import_candidates.
 */
import {
  bundleToArtifactV1,
  computeGmailMaterializationBundle,
} from "./buildGmailMaterializationArtifact.ts";
import {
  deleteStagingPrefixForImportCandidate,
  stageImportCandidateAttachments,
  type StagedImportAttachmentRef,
} from "./gmailStageImportCandidateAttachments.ts";
import { supabaseAdmin } from "../supabase.ts";
import { classifyGmailHtmlRenderPath, logGmailPrepareCompleteV1 } from "./gmailImportObservability.ts";
import type { GmailMaterializationArtifactV1 } from "./gmailMaterializationArtifactV1.ts";

const PREPARE_STUCK_AFTER_MS = 25 * 60 * 1000;

export type PrepareImportCandidateResult =
  | { ok: true; skipped: true; reason: "already_prepared" | "not_pending" | "already_preparing" }
  | { ok: true; prepared: true; importCandidateId: string }
  | { ok: false; error: string; importCandidateId: string };

export async function runPrepareImportCandidateMaterialization(
  importCandidateId: string,
): Promise<PrepareImportCandidateResult> {
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("import_candidates")
    .select(
      "id, photographer_id, connected_account_id, status, snippet, raw_provider_thread_id, materialization_prepare_status, materialization_artifact, materialization_prepare_started_at",
    )
    .eq("id", importCandidateId)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, error: "candidate_not_found", importCandidateId };
  }

  if (row.status !== "pending") {
    return { ok: true, skipped: true, reason: "not_pending" };
  }

  if (row.materialization_prepare_status === "prepared" && row.materialization_artifact) {
    return { ok: true, skipped: true, reason: "already_prepared" };
  }

  if (row.materialization_prepare_status === "preparing") {
    const started = row.materialization_prepare_started_at
      ? new Date(row.materialization_prepare_started_at as string).getTime()
      : 0;
    if (Date.now() - started < PREPARE_STUCK_AFTER_MS) {
      return { ok: true, skipped: true, reason: "already_preparing" };
    }
  }

  const now = new Date().toISOString();

  await supabaseAdmin
    .from("import_candidates")
    .update({
      materialization_prepare_status: "preparing",
      materialization_prepare_started_at: now,
      materialization_prepare_error: null,
      updated_at: now,
    })
    .eq("id", importCandidateId)
    .eq("status", "pending");

  try {
    await deleteStagingPrefixForImportCandidate(
      supabaseAdmin,
      row.photographer_id as string,
      importCandidateId,
    );

    const bundle = await computeGmailMaterializationBundle(
      row.connected_account_id as string,
      row.raw_provider_thread_id as string,
      typeof row.snippet === "string" ? row.snippet : null,
      {
        photographerId: row.photographer_id as string,
        importCandidateId,
      },
    );

    let staged: StagedImportAttachmentRef[] = [];
    let stagingUploadFailures: { candidate_index: number; error: string }[] = [];
    if (bundle.gmailImport && bundle.gmailImport.candidates.length > 0) {
      const stageResult = await stageImportCandidateAttachments(supabaseAdmin, {
        accessToken: bundle.gmailImport.accessToken,
        gmailMessageId: bundle.gmailImport.gmailMessageId,
        photographerId: row.photographer_id as string,
        importCandidateId,
        candidates: bundle.gmailImport.candidates,
      });
      staged = stageResult.staged;
      stagingUploadFailures = stageResult.upload_failures;
    }

    let artifact: GmailMaterializationArtifactV1 = bundleToArtifactV1(bundle, staged);
    if (stagingUploadFailures.length > 0) {
      const m = artifact.metadata as Record<string, unknown>;
      const giRaw = m.gmail_import;
      const gi =
        giRaw && typeof giRaw === "object"
          ? { ...(giRaw as Record<string, unknown>) }
          : {};
      artifact = {
        ...artifact,
        metadata: {
          ...m,
          gmail_import: { ...gi, staging_upload_failures: stagingUploadFailures },
        },
      };
    }

    const done = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from("import_candidates")
      .update({
        materialization_prepare_status: "prepared",
        materialization_prepared_at: done,
        materialization_artifact: artifact as unknown as Record<string, unknown>,
        materialization_artifact_version: 1,
        materialization_prepare_error: null,
        updated_at: done,
        ...(bundle.gmailRenderArtifactId
          ? { materialization_render_artifact_id: bundle.gmailRenderArtifactId }
          : { materialization_render_artifact_id: null }),
      })
      .eq("id", importCandidateId)
      .eq("status", "pending");

    if (upErr) {
      throw new Error(upErr.message);
    }

    const htmlPath = classifyGmailHtmlRenderPath(artifact.metadata);
    logGmailPrepareCompleteV1({
      import_candidate_id: importCandidateId,
      photographer_id: row.photographer_id as string,
      outcome: "prepared",
      has_render_artifact_id: Boolean(bundle.gmailRenderArtifactId),
      html_in_metadata_inline: htmlPath === "inline_metadata",
    });

    return { ok: true, prepared: true, importCandidateId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fail = new Date().toISOString();
    await deleteStagingPrefixForImportCandidate(
      supabaseAdmin,
      row.photographer_id as string,
      importCandidateId,
    );
    await supabaseAdmin
      .from("import_candidates")
      .update({
        materialization_prepare_status: "prepare_failed",
        materialization_prepare_error: msg.slice(0, 2000),
        updated_at: fail,
      })
      .eq("id", importCandidateId);
    logGmailPrepareCompleteV1({
      import_candidate_id: importCandidateId,
      photographer_id: row.photographer_id as string,
      outcome: "prepare_failed",
      has_render_artifact_id: false,
      html_in_metadata_inline: false,
      error: msg.slice(0, 500),
    });
    return { ok: false, error: msg, importCandidateId };
  }
}

export { isGmailMaterializationArtifactV1 } from "./gmailMaterializationArtifactV1.ts";
