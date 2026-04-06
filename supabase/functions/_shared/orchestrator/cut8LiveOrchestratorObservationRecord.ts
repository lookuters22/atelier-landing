/**
 * V3 CUT8 — observation for live main-path **studio** + known-wedding (`triage_main_studio_live`).
 *
 * Grep: `[orchestrator.cut8.live.observe]`
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";
import { type Cut2LiveOutcomeBucket, type Cut2LiveOrchestratorObservationRecord } from "./cut2LiveOrchestratorObservationRecord.ts";

export const ORCHESTRATOR_CUT8_LIVE_OBSERVE_LOG_TAG = "[orchestrator.cut8.live.observe]";

export type Cut8LiveFanoutSource = "triage_main_studio_live";

export type Cut8LiveCorrelationFields = {
  cut8LiveCorrelationId: string;
  cut8LiveFanoutSource: Cut8LiveFanoutSource;
};

export type Cut8LiveOrchestratorObservationRecord = Omit<
  Cut2LiveOrchestratorObservationRecord,
  "compare_kind" | "cut2LiveCorrelationId" | "cut2LiveFanoutSource"
> & {
  compare_kind: "orchestrator.cut8.live.v1";
  cut8LiveCorrelationId: string;
  cut8LiveFanoutSource: Cut8LiveFanoutSource;
};

function outcomeBucket(result: ClientOrchestratorV1CoreResult): Cut2LiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}

export function parseCut8LiveCorrelationFromEventData(data: {
  cut8LiveCorrelationId?: string;
  cut8LiveFanoutSource?: string;
}): Cut8LiveCorrelationFields | null {
  const id = data.cut8LiveCorrelationId;
  const src = data.cut8LiveFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "triage_main_studio_live") {
    return null;
  }
  return {
    cut8LiveCorrelationId: id.trim(),
    cut8LiveFanoutSource: src,
  };
}

export function buildCut8LiveOrchestratorObservationRecord(
  correlation: Cut8LiveCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  ctx: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email" | "web";
    requestedExecutionMode: string;
    verifierPassed: boolean;
  },
): Cut8LiveOrchestratorObservationRecord {
  const cc = result.chosenCandidate;
  const bucket = outcomeBucket(result);
  const draftOnlyNoVisible =
    ctx.requestedExecutionMode === "draft_only" &&
    !result.draftCreated &&
    !result.escalationArtifactCreated;

  return {
    compare_kind: "orchestrator.cut8.live.v1",
    cut8LiveCorrelationId: correlation.cut8LiveCorrelationId,
    cut8LiveFanoutSource: correlation.cut8LiveFanoutSource,
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

export function logCut8LiveOrchestratorObservationRecord(
  record: Cut8LiveOrchestratorObservationRecord,
): void {
  console.log(ORCHESTRATOR_CUT8_LIVE_OBSERVE_LOG_TAG, JSON.stringify(record));
}
