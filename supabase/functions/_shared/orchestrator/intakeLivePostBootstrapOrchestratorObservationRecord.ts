/**
 * Intake post-bootstrap **live** (email-only) — `ai/orchestrator.client.v1` replaces persona for that turn.
 *
 * Distinct from parity (`intake_post_bootstrap_parity`) and CUT2–CUT8. Full draft/escalation path applies.
 *
 * Grep: `[orchestrator.intake.post_bootstrap.live_email]`
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";

export const ORCHESTRATOR_INTAKE_POST_BOOTSTRAP_LIVE_EMAIL_LOG_TAG =
  "[orchestrator.intake.post_bootstrap.live_email]";

export type IntakePostBootstrapLiveEmailFanoutSource = "intake_post_bootstrap_live_email";

export type IntakeLivePostBootstrapEmailCorrelationFields = {
  intakeLiveCorrelationId: string;
  intakeLiveFanoutSource: IntakePostBootstrapLiveEmailFanoutSource;
};

export type IntakeLiveOutcomeBucket =
  | "draft_created"
  | "escalation_artifact"
  | "neither_draft_nor_escalation";

export type IntakeLivePostBootstrapOrchestratorObservationRecord = {
  compare_kind: "orchestrator.intake.post_bootstrap_live_email.v1";
  /** Live path — not observation-only parity. */
  intakePostBootstrapLiveEmail: true;
  intakeLiveCorrelationId: string;
  intakeLiveFanoutSource: IntakePostBootstrapLiveEmailFanoutSource;
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email";
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

export function parseIntakeLivePostBootstrapEmailFromEventData(data: {
  intakeLiveCorrelationId?: string;
  intakeLiveFanoutSource?: string;
}): IntakeLivePostBootstrapEmailCorrelationFields | null {
  const id = data.intakeLiveCorrelationId;
  const src = data.intakeLiveFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "intake_post_bootstrap_live_email") {
    return null;
  }
  return {
    intakeLiveCorrelationId: id.trim(),
    intakeLiveFanoutSource: src,
  };
}

function outcomeBucket(result: ClientOrchestratorV1CoreResult): IntakeLiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}

export function buildIntakeLivePostBootstrapOrchestratorObservationRecord(
  correlation: IntakeLivePostBootstrapEmailCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  ctx: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email";
    requestedExecutionMode: string;
    verifierPassed: boolean;
  },
): IntakeLivePostBootstrapOrchestratorObservationRecord {
  const cc = result.chosenCandidate;
  const bucket = outcomeBucket(result);
  const draftOnlyNoVisible =
    ctx.requestedExecutionMode === "draft_only" &&
    !result.draftCreated &&
    !result.escalationArtifactCreated;

  return {
    compare_kind: "orchestrator.intake.post_bootstrap_live_email.v1",
    intakePostBootstrapLiveEmail: true,
    intakeLiveCorrelationId: correlation.intakeLiveCorrelationId,
    intakeLiveFanoutSource: correlation.intakeLiveFanoutSource,
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

export function logIntakeLivePostBootstrapOrchestratorObservationRecord(
  record: IntakeLivePostBootstrapOrchestratorObservationRecord,
): void {
  console.log(ORCHESTRATOR_INTAKE_POST_BOOTSTRAP_LIVE_EMAIL_LOG_TAG, JSON.stringify(record));
}
