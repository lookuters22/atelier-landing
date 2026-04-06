/**
 * V3 CUT7 — observation for live main-path **commercial** + known-wedding (`triage_main_commercial_live`).
 *
 * Grep: `[orchestrator.cut7.live.observe]`
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";
import { type Cut2LiveOutcomeBucket, type Cut2LiveOrchestratorObservationRecord } from "./cut2LiveOrchestratorObservationRecord.ts";

export const ORCHESTRATOR_CUT7_LIVE_OBSERVE_LOG_TAG = "[orchestrator.cut7.live.observe]";

export type Cut7LiveFanoutSource = "triage_main_commercial_live";

export type Cut7LiveCorrelationFields = {
  cut7LiveCorrelationId: string;
  cut7LiveFanoutSource: Cut7LiveFanoutSource;
};

export type Cut7LiveOrchestratorObservationRecord = Omit<
  Cut2LiveOrchestratorObservationRecord,
  "compare_kind" | "cut2LiveCorrelationId" | "cut2LiveFanoutSource"
> & {
  compare_kind: "orchestrator.cut7.live.v1";
  cut7LiveCorrelationId: string;
  cut7LiveFanoutSource: Cut7LiveFanoutSource;
};

function outcomeBucket(result: ClientOrchestratorV1CoreResult): Cut2LiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}

export function parseCut7LiveCorrelationFromEventData(data: {
  cut7LiveCorrelationId?: string;
  cut7LiveFanoutSource?: string;
}): Cut7LiveCorrelationFields | null {
  const id = data.cut7LiveCorrelationId;
  const src = data.cut7LiveFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "triage_main_commercial_live") {
    return null;
  }
  return {
    cut7LiveCorrelationId: id.trim(),
    cut7LiveFanoutSource: src,
  };
}

export function buildCut7LiveOrchestratorObservationRecord(
  correlation: Cut7LiveCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  ctx: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email" | "web";
    requestedExecutionMode: string;
    verifierPassed: boolean;
  },
): Cut7LiveOrchestratorObservationRecord {
  const cc = result.chosenCandidate;
  const bucket = outcomeBucket(result);
  const draftOnlyNoVisible =
    ctx.requestedExecutionMode === "draft_only" &&
    !result.draftCreated &&
    !result.escalationArtifactCreated;

  return {
    compare_kind: "orchestrator.cut7.live.v1",
    cut7LiveCorrelationId: correlation.cut7LiveCorrelationId,
    cut7LiveFanoutSource: correlation.cut7LiveFanoutSource,
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

export function logCut7LiveOrchestratorObservationRecord(
  record: Cut7LiveOrchestratorObservationRecord,
): void {
  console.log(ORCHESTRATOR_CUT7_LIVE_OBSERVE_LOG_TAG, JSON.stringify(record));
}
