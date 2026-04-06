import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import {
  CRM_STAGE_UPDATED_V1_EVENT,
  CRM_STAGE_UPDATED_V1_SCHEMA_VERSION,
  inngest,
} from "../inngest.ts";
import { CrmToolInputSchema } from "./schemas.ts";

/**
 * `executeCrmTool` — CRM project stage update (execute_v3 Step 6E ownership for this tool only).
 *
 * - **What it reads:** `weddings` row fields `id`, `stage`, filtered by `weddingId` and tenant `photographer_id`.
 * - **What it writes:** `weddings.stage` when `decisionMode === "auto"` and the stage changes; emits legacy `crm/stage.updated`
 *   and versioned `crm/stage.updated.v1` (Phase 7A) for the same transition.
 * - **Read-only vs write-capable:** Write-capable on the `auto` path only; non-`auto` returns structured refusal (no DB update).
 * - **Verifier approval:** This tool does not call `toolVerifier`. Callers must sequence message-level `toolVerifier` (and other
 *   policy) before treating an `auto` CRM write as allowed in high-risk flows; `decisionMode` is the in-tool gate for the write.
 * - **Which roles may call it:** Main orchestrator and operator-style execution agents with tenant context. Not the verifier
 *   (gates only, no CRM mutations) or the writer/persona role for direct CRM writes (Phase 6.5).
 *
 * Service-role Supabase clients must still filter by `photographer_id`. Phase 6C: only `decisionMode === "auto"` performs a
 * write; no silent no-op when requested stage equals current stage.
 */
export async function executeCrmTool(
  input: unknown,
  photographerId: string,
  supabase: SupabaseClient,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const parsed = CrmToolInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      };
    }

    const d = parsed.data;
    if (d.decisionMode !== "auto") {
      return {
        success: false,
        facts: {
          writeBlocked: true,
          decisionMode: d.decisionMode,
          weddingId: d.weddingId,
          requestedStage: d.projectStage,
          escalation: d.escalation,
          ...(d.justification !== undefined && {
            justification: d.justification,
          }),
        },
        confidence: 1,
        error: "crm_stage_update_blocked_by_decision_mode",
      };
    }

    const { data: before, error: fetchErr } = await supabase
      .from("weddings")
      .select("id, stage")
      .eq("id", d.weddingId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (fetchErr) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: fetchErr.message,
      };
    }

    if (!before) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: "No wedding updated (invalid wedding id or tenant mismatch).",
      };
    }

    const previousStage = String(before.stage);
    if (previousStage === d.projectStage) {
      return {
        success: false,
        facts: {
          conflict: "stage_unchanged",
          weddingId: d.weddingId,
          currentStage: previousStage,
          requestedStage: d.projectStage,
        },
        confidence: 1,
        error: "crm_stage_noop_requested_stage_matches_current",
      };
    }

    const { data, error } = await supabase
      .from("weddings")
      .update({ stage: d.projectStage })
      .eq("id", d.weddingId)
      .eq("photographer_id", photographerId)
      .select("id, stage");

    if (error) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: error.message,
      };
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: "No wedding updated (invalid wedding id or tenant mismatch).",
      };
    }

    await inngest.send({
      name: "crm/stage.updated",
      data: {
        weddingId: d.weddingId,
        photographerId,
        previousStage,
        newStage: d.projectStage,
      },
    });
    await inngest.send({
      name: CRM_STAGE_UPDATED_V1_EVENT,
      data: {
        schemaVersion: CRM_STAGE_UPDATED_V1_SCHEMA_VERSION,
        weddingId: d.weddingId,
        photographerId,
        previousStage,
        newStage: d.projectStage,
      },
    });

    return {
      success: true,
      facts: {
        weddingId: d.weddingId,
        previousStage,
        updatedStage: d.projectStage,
        decisionMode: d.decisionMode,
      },
      confidence: 1,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      facts: {},
      confidence: 0,
      error: message,
    };
  }
}
