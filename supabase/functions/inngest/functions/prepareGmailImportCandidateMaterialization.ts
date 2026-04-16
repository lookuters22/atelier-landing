/**
 * G2: Event-driven precompute of Gmail materialization artifact for a staged import_candidate.
 */
import {
  GMAIL_IMPORT_CANDIDATE_PREPARE_MATERIALIZATION_V1_EVENT,
  GMAIL_IMPORT_CANDIDATE_PREPARE_MATERIALIZATION_V1_SCHEMA_VERSION,
  inngest,
} from "../../_shared/inngest.ts";
import { gmailImportCandidateMaterializationLaneDisabled } from "../../_shared/gmail/gmailMaterializationLanePause.ts";
import { runPrepareImportCandidateMaterialization } from "../../_shared/gmail/prepareImportCandidateMaterialization.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

export const prepareGmailImportCandidateMaterialization = inngest.createFunction(
  {
    id: "prepare-gmail-import-candidate-materialization",
    name: "Gmail — G2 prepare materialization artifact (single candidate)",
  },
  { event: GMAIL_IMPORT_CANDIDATE_PREPARE_MATERIALIZATION_V1_EVENT },
  async ({ event, step }) => {
    if (gmailImportCandidateMaterializationLaneDisabled()) {
      console.log(
        JSON.stringify({
          type: "gmail_prepare_materialization_skipped",
          reason: "GMAIL_IMPORT_CANDIDATE_MATERIALIZATION_LANE_DISABLED",
          importCandidateId: event.data.importCandidateId,
        }),
      );
      return {
        ok: true as const,
        skipped: true as const,
        reason: "materialization_lane_disabled" as const,
      };
    }
    if (event.data.schemaVersion !== GMAIL_IMPORT_CANDIDATE_PREPARE_MATERIALIZATION_V1_SCHEMA_VERSION) {
      return { ok: false as const, error: "schema_version_mismatch" };
    }
    const { importCandidateId, photographerId } = event.data;

    return await step.run("prepare-materialization", async () => {
      const { data: row, error } = await supabaseAdmin
        .from("import_candidates")
        .select("photographer_id")
        .eq("id", importCandidateId)
        .maybeSingle();
      if (error || !row) {
        return { ok: false as const, error: "candidate_not_found" };
      }
      if (row.photographer_id !== photographerId) {
        return { ok: false as const, error: "tenant_mismatch" };
      }
      return runPrepareImportCandidateMaterialization(importCandidateId);
    });
  },
);
