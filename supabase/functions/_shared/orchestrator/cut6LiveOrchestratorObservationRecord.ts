/**
 * V3 CUT6 — observation for live main-path **logistics** + known-wedding (`triage_main_logistics_live`).
 *
 * Grep: `[orchestrator.cut6.live.observe]`
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";
import { type Cut2LiveOutcomeBucket, type Cut2LiveOrchestratorObservationRecord } from "./cut2LiveOrchestratorObservationRecord.ts";

export const ORCHESTRATOR_CUT6_LIVE_OBSERVE_LOG_TAG = "[orchestrator.cut6.live.observe]";

export type Cut6LiveFanoutSource = "triage_main_logistics_live";

export type Cut6LiveCorrelationFields = {
  cut6LiveCorrelationId: string;
  cut6LiveFanoutSource: Cut6LiveFanoutSource;
};

export type Cut6LiveOrchestratorObservationRecord = Omit<
  Cut2LiveOrchestratorObservationRecord,
  "compare_kind" | "cut2LiveCorrelationId" | "cut2LiveFanoutSource"
> & {
  compare_kind: "orchestrator.cut6.live.v1";
  cut6LiveCorrelationId: string;
  cut6LiveFanoutSource: Cut6LiveFanoutSource;
};

function outcomeBucket(result: ClientOrchestratorV1CoreResult): Cut2LiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}

export function parseCut6LiveCorrelationFromEventData(data: {
  cut6LiveCorrelationId?: string;
  cut6LiveFanoutSource?: string;
}): Cut6LiveCorrelationFields | null {
  const id = data.cut6LiveCorrelationId;
  const src = data.cut6LiveFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "triage_main_logistics_live") {
    return null;
  }
  return {
    cut6LiveCorrelationId: id.trim(),
    cut6LiveFanoutSource: src,
  };
}

export function buildCut6LiveOrchestratorObservationRecord(
  correlation: Cut6LiveCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  ctx: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email" | "web";
    requestedExecutionMode: string;
    verifierPassed: boolean;
  },
): Cut6LiveOrchestratorObservationRecord {
  const cc = result.chosenCandidate;
  const bucket = outcomeBucket(result);
  const draftOnlyNoVisible =
    ctx.requestedExecutionMode === "draft_only" &&
    !result.draftCreated &&
    !result.escalationArtifactCreated;

  return {
    compare_kind: "orchestrator.cut6.live.v1",
    cut6LiveCorrelationId: correlation.cut6LiveCorrelationId,
    cut6LiveFanoutSource: correlation.cut6LiveFanoutSource,
    photographerId: result.photographerId,
    weddingId: ctx.weddingId,
    threadId: ctx.threadId,
    replyChannel: ctx.replyChannel,
    requestedExecutionMode: ctx.requestedExecutionMode,
    verifier_passed: ctx.verifierPassed,
    orchestratorOutcome: result.orchestratorOutcome,
    draftCreated: result.draftCreated,
    escalationArtifactCreated: result.escalationArtifactCreated,
    draftSkipReason: result.draftAttempt.skipReason,
    escalationSkipReason: result.escalationAttempt.skipReason,
    neitherDraftNorEscalationReason: result.neitherDraftNorEscalationReason,
    proposalCount: result.proposalCount,
    chosenCandidateActionFamily: cc?.action_family ?? null,
    chosenCandidateActionKey: cc?.action_key ?? null,
    outcome_bucket: bucket,
    rollback_suggested_no_visible_outcome: draftOnlyNoVisible,
    rollback_suggested_verifier_blocked: !ctx.verifierPassed,
  };
}

export function logCut6LiveOrchestratorObservationRecord(
  record: Cut6LiveOrchestratorObservationRecord,
): void {
  console.log(ORCHESTRATOR_CUT6_LIVE_OBSERVE_LOG_TAG, JSON.stringify(record));
}
