/**
 * G2: Periodic backfill — prepare materialization for pending candidates not yet prepared (or failed).
 */
import { inngest } from "../../_shared/inngest.ts";
import { gmailImportCandidateMaterializationLaneDisabled } from "../../_shared/gmail/gmailMaterializationLanePause.ts";
import { runPrepareImportCandidateMaterialization } from "../../_shared/gmail/prepareImportCandidateMaterialization.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

const BATCH = 30;

export const backfillGmailImportCandidateMaterialization = inngest.createFunction(
  {
    id: "backfill-gmail-import-candidate-materialization",
    name: "Gmail — G2 backfill materialization prepare (cron)",
  },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    return await step.run("backfill-pending", async () => {
      if (gmailImportCandidateMaterializationLaneDisabled()) {
        return {
          ok: true as const,
          skipped: true as const,
          reason: "materialization_lane_disabled" as const,
        };
      }
      const { data: rows, error } = await supabaseAdmin
        .from("import_candidates")
        .select("id")
        .eq("status", "pending")
        .in("materialization_prepare_status", ["not_prepared", "prepare_failed"])
        .order("updated_at", { ascending: true })
        .limit(BATCH);

      if (error) {
        return { ok: false as const, error: error.message };
      }

      const results: unknown[] = [];
      for (const r of rows ?? []) {
        const id = r.id as string;
        const res = await runPrepareImportCandidateMaterialization(id);
        results.push(res);
      }

      return { ok: true as const, attempted: (rows ?? []).length, results };
    });
  },
);
