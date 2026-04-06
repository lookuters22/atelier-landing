/**
 * V3 CUT5 — observation for live main-path **project_management** + known-wedding (`triage_main_project_management_live`).
 *
 * Grep: `[orchestrator.cut5.live.observe]`
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";
import { type Cut2LiveOutcomeBucket, type Cut2LiveOrchestratorObservationRecord } from "./cut2LiveOrchestratorObservationRecord.ts";

export const ORCHESTRATOR_CUT5_LIVE_OBSERVE_LOG_TAG = "[orchestrator.cut5.live.observe]";

export type Cut5LiveFanoutSource = "triage_main_project_management_live";

export type Cut5LiveCorrelationFields = {
  cut5LiveCorrelationId: string;
  cut5LiveFanoutSource: Cut5LiveFanoutSource;
};

export type Cut5LiveOrchestratorObservationRecord = Omit<
  Cut2LiveOrchestratorObservationRecord,
  "compare_kind" | "cut2LiveCorrelationId" | "cut2LiveFanoutSource"
> & {
  compare_kind: "orchestrator.cut5.live.v1";
  cut5LiveCorrelationId: string;
  cut5LiveFanoutSource: Cut5LiveFanoutSource;
};

function outcomeBucket(result: ClientOrchestratorV1CoreResult): Cut2LiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}

export function parseCut5LiveCorrelationFromEventData(data: {
  cut5LiveCorrelationId?: string;
  cut5LiveFanoutSource?: string;
}): Cut5LiveCorrelationFields | null {
  const id = data.cut5LiveCorrelationId;
  const src = data.cut5LiveFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "triage_main_project_management_live") {
    return null;
  }
  return {
    cut5LiveCorrelationId: id.trim(),
    cut5LiveFanoutSource: src,
  };
}

export function buildCut5LiveOrchestratorObservationRecord(
  correlation: Cut5LiveCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  ctx: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email" | "web";
    requestedExecutionMode: string;
    verifierPassed: boolean;
  },
): Cut5LiveOrchestratorObservationRecord {
  const cc = result.chosenCandidate;
  const bucket = outcomeBucket(result);
  const draftOnlyNoVisible =
    ctx.requestedExecutionMode === "draft_only" &&
    !result.draftCreated &&
    !result.escalationArtifactCreated;

  return {
    compare_kind: "orchestrator.cut5.live.v1",
    cut5LiveCorrelationId: correlation.cut5LiveCorrelationId,
    cut5LiveFanoutSource: correlation.cut5LiveFanoutSource,
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

export function logCut5LiveOrchestratorObservationRecord(
  record: Cut5LiveOrchestratorObservationRecord,
): void {
  console.log(ORCHESTRATOR_CUT5_LIVE_OBSERVE_LOG_TAG, JSON.stringify(record));
}
