/**
 * V3 CUT3 — machine-readable observation for **live** CUT2 web-widget known-wedding orchestrator runs only.
 *
 * Grep-friendly log line: `[orchestrator.cut2.live.observe]` + JSON (stable prefix).
 * Not emitted for shadow fanout or QA-only sends (no `cut2LiveFanoutSource`).
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";

export const ORCHESTRATOR_CUT2_LIVE_OBSERVE_LOG_TAG = "[orchestrator.cut2.live.observe]";

export type Cut2LiveFanoutSource = "triage_web_widget_live";

export type Cut2LiveCorrelationFields = {
  cut2LiveCorrelationId: string;
  cut2LiveFanoutSource: Cut2LiveFanoutSource;
};

export type Cut2LiveOutcomeBucket =
  | "draft_created"
  | "escalation_artifact"
  | "neither_draft_nor_escalation";

export type Cut2LiveOrchestratorObservationRecord = {
  compare_kind: "orchestrator.cut2.live.v1";
  cut2LiveCorrelationId: string;
  cut2LiveFanoutSource: Cut2LiveFanoutSource;
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web";
  requestedExecutionMode: string;
  verifier_passed: boolean;
  orchestratorOutcome: ClientOrchestratorV1CoreResult["orchestratorOutcome"];
  draftCreated: boolean;
  escalationArtifactCreated: boolean;
  draftSkipReason: string | null;
  escalationSkipReason: string | null;
  neitherDraftNorEscalationReason: string | null;
  proposalCount: number;
  chosenCandidateActionFamily: string | null;
  chosenCandidateActionKey: string | null;
  outcome_bucket: Cut2LiveOutcomeBucket;
  /**
   * Under draft_only live CUT2: neither draft nor escalation — review for silent no-op; consider disabling CUT2 env.
   */
  rollback_suggested_no_visible_outcome: boolean;
  /** Verifier did not pass — policy/risk gate; review before widening cutover. */
  rollback_suggested_verifier_blocked: boolean;
};

export function parseCut2LiveCorrelationFromEventData(data: {
  cut2LiveCorrelationId?: string;
  cut2LiveFanoutSource?: string;
}): Cut2LiveCorrelationFields | null {
  const id = data.cut2LiveCorrelationId;
  const src = data.cut2LiveFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "triage_web_widget_live") {
    return null;
  }
  return {
    cut2LiveCorrelationId: id.trim(),
    cut2LiveFanoutSource: src,
  };
}

function outcomeBucket(result: ClientOrchestratorV1CoreResult): Cut2LiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}

export function buildCut2LiveOrchestratorObservationRecord(
  correlation: Cut2LiveCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  ctx: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email" | "web";
    requestedExecutionMode: string;
    verifierPassed: boolean;
  },
): Cut2LiveOrchestratorObservationRecord {
  const cc = result.chosenCandidate;
  const bucket = outcomeBucket(result);
  const draftOnlyNoVisible =
    ctx.requestedExecutionMode === "draft_only" &&
    !result.draftCreated &&
    !result.escalationArtifactCreated;

  return {
    compare_kind: "orchestrator.cut2.live.v1",
    cut2LiveCorrelationId: correlation.cut2LiveCorrelationId,
    cut2LiveFanoutSource: correlation.cut2LiveFanoutSource,
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

export function logCut2LiveOrchestratorObservationRecord(
  record: Cut2LiveOrchestratorObservationRecord,
): void {
  console.log(ORCHESTRATOR_CUT2_LIVE_OBSERVE_LOG_TAG, JSON.stringify(record));
}
