/**
 * Observation for optional **`reply_channel === "web"`** on `ai/intent.intake` (dashboard web ingress shape).
 *
 * **Not “client web intake”:** client intake migration is **email**; web widget is photographer ↔ Ana. Full draft path
 * when this fanout fires.
 *
 * Grep: `[orchestrator.intake.post_bootstrap.live_web]`
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";
import type { IntakeLiveOutcomeBucket } from "./intakeLivePostBootstrapOrchestratorObservationRecord.ts";

export const ORCHESTRATOR_INTAKE_POST_BOOTSTRAP_LIVE_WEB_LOG_TAG =
  "[orchestrator.intake.post_bootstrap.live_web]";

export type IntakePostBootstrapLiveWebFanoutSource = "intake_post_bootstrap_live_web";

export type IntakeLivePostBootstrapWebCorrelationFields = {
  intakeLiveWebCorrelationId: string;
  intakeLiveWebFanoutSource: IntakePostBootstrapLiveWebFanoutSource;
};

export type IntakeLivePostBootstrapWebOrchestratorObservationRecord = {
  compare_kind: "orchestrator.intake.post_bootstrap_live_web.v1";
  intakePostBootstrapLiveWeb: true;
  intakeLiveWebCorrelationId: string;
  intakeLiveWebFanoutSource: IntakePostBootstrapLiveWebFanoutSource;
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "web";
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
  outcome_bucket: IntakeLiveOutcomeBucket;
  rollback_suggested_no_visible_outcome: boolean;
  rollback_suggested_verifier_blocked: boolean;
};

export function parseIntakeLivePostBootstrapWebFromEventData(data: {
  intakeLiveWebCorrelationId?: string;
  intakeLiveWebFanoutSource?: string;
}): IntakeLivePostBootstrapWebCorrelationFields | null {
  const id = data.intakeLiveWebCorrelationId;
  const src = data.intakeLiveWebFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "intake_post_bootstrap_live_web") {
    return null;
  }
  return {
    intakeLiveWebCorrelationId: id.trim(),
    intakeLiveWebFanoutSource: src,
  };
}

function outcomeBucket(result: ClientOrchestratorV1CoreResult): IntakeLiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}

export function buildIntakeLivePostBootstrapWebOrchestratorObservationRecord(
  correlation: IntakeLivePostBootstrapWebCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  ctx: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "web";
    requestedExecutionMode: string;
    verifierPassed: boolean;
  },
): IntakeLivePostBootstrapWebOrchestratorObservationRecord {
  const cc = result.chosenCandidate;
  const bucket = outcomeBucket(result);
  const draftOnlyNoVisible =
    ctx.requestedExecutionMode === "draft_only" &&
    !result.draftCreated &&
    !result.escalationArtifactCreated;

  return {
    compare_kind: "orchestrator.intake.post_bootstrap_live_web.v1",
    intakePostBootstrapLiveWeb: true,
    intakeLiveWebCorrelationId: correlation.intakeLiveWebCorrelationId,
    intakeLiveWebFanoutSource: correlation.intakeLiveWebFanoutSource,
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

export function logIntakeLivePostBootstrapWebOrchestratorObservationRecord(
  record: IntakeLivePostBootstrapWebOrchestratorObservationRecord,
): void {
  console.log(ORCHESTRATOR_INTAKE_POST_BOOTSTRAP_LIVE_WEB_LOG_TAG, JSON.stringify(record));
}
