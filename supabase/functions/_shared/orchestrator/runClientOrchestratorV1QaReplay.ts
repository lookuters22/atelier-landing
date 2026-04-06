/**
 * Phase 2 Slice B1 — synchronous replay of the `clientOrchestratorV1` pipeline for QA scripts.
 *
 * Delegates to `executeClientOrchestratorV1Core` in `clientOrchestratorV1Core.ts` (same logic as the Inngest worker).
 * Not used by triage or live routing.
 *
 * **QA-only:** `qaBroadcastRiskOverride` is forwarded as the core optional parameter (replay-only).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { BroadcastRiskLevel } from "../../../../src/types/decisionContext.types.ts";
import {
  type ClientOrchestratorV1CoreResult,
  type ClientOrchestratorV1ExecutionMode,
  executeClientOrchestratorV1Core,
} from "./clientOrchestratorV1Core.ts";

export type { ClientOrchestratorV1ExecutionMode };
export type { ClientOrchestratorV1Outcome } from "./clientOrchestratorV1Core.ts";

export type ClientOrchestratorV1QaReplayInput = {
  supabase: SupabaseClient;
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web";
  rawMessage: string;
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode;
  /**
   * After `buildDecisionContext`, replace `audience.broadcastRisk` for this run only (replay / QA).
   * Does not persist to DB.
   */
  qaBroadcastRiskOverride?: BroadcastRiskLevel;
};

export type ClientOrchestratorV1QaReplayResult = ClientOrchestratorV1CoreResult;

/**
 * Runs the same pipeline as `clientOrchestratorV1` (no Inngest). For QA / `qa_runner` only.
 */
export async function runClientOrchestratorV1QaReplay(
  params: ClientOrchestratorV1QaReplayInput,
): Promise<ClientOrchestratorV1QaReplayResult> {
  return executeClientOrchestratorV1Core({
    supabase: params.supabase,
    photographerId: params.photographerId,
    weddingId: params.weddingId,
    threadId: params.threadId,
    replyChannel: params.replyChannel,
    rawMessage: params.rawMessage,
    requestedExecutionMode: params.requestedExecutionMode,
    qaBroadcastRiskOverride: params.qaBroadcastRiskOverride,
  });
}
