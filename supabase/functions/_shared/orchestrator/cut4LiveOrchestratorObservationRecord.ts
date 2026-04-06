/**
 * V3 CUT4 — observation for **live** main-path concierge + known-wedding orchestrator runs (`triage_main_concierge_live`).
 *
 * Grep: `[orchestrator.cut4.live.observe]`
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";
import { type Cut2LiveOutcomeBucket, type Cut2LiveOrchestratorObservationRecord } from "./cut2LiveOrchestratorObservationRecord.ts";

export const ORCHESTRATOR_CUT4_LIVE_OBSERVE_LOG_TAG = "[orchestrator.cut4.live.observe]";

export type Cut4LiveFanoutSource = "triage_main_concierge_live";

export type Cut4LiveCorrelationFields = {
  cut4LiveCorrelationId: string;
  cut4LiveFanoutSource: Cut4LiveFanoutSource;
};

export type Cut4LiveOrchestratorObservationRecord = Omit<
  Cut2LiveOrchestratorObservationRecord,
  "compare_kind" | "cut2LiveCorrelationId" | "cut2LiveFanoutSource"
> & {
  compare_kind: "orchestrator.cut4.live.v1";
  cut4LiveCorrelationId: string;
  cut4LiveFanoutSource: Cut4LiveFanoutSource;
};

function outcomeBucket(result: ClientOrchestratorV1CoreResult): Cut2LiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}

export function parseCut4LiveCorrelationFromEventData(data: {
  cut4LiveCorrelationId?: string;
  cut4LiveFanoutSource?: string;
}): Cut4LiveCorrelationFields | null {
  const id = data.cut4LiveCorrelationId;
  const src = data.cut4LiveFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "triage_main_concierge_live") {
    return null;
  }
  return {
    cut4LiveCorrelationId: id.trim(),
    cut4LiveFanoutSource: src,
  };
}

export function buildCut4LiveOrchestratorObservationRecord(
  correlation: Cut4LiveCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  ctx: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email" | "web";
    requestedExecutionMode: string;
    verifierPassed: boolean;
  },
): Cut4LiveOrchestratorObservationRecord {
  const cc = result.chosenCandidate;
  const bucket = outcomeBucket(result);
  const draftOnlyNoVisible =
    ctx.requestedExecutionMode === "draft_only" &&
    !result.draftCreated &&
    !result.escalationArtifactCreated;

  return {
    compare_kind: "orchestrator.cut4.live.v1",
    cut4LiveCorrelationId: correlation.cut4LiveCorrelationId,
    cut4LiveFanoutSource: correlation.cut4LiveFanoutSource,
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

export function logCut4LiveOrchestratorObservationRecord(
  record: Cut4LiveOrchestratorObservationRecord,
): void {
  console.log(ORCHESTRATOR_CUT4_LIVE_OBSERVE_LOG_TAG, JSON.stringify(record));
}
