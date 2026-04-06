/**
 * Intake post-bootstrap parity — observation-only `ai/orchestrator.client.v1` after `applyIntakeLeadCreation`.
 *
 * Distinct from triage B3 shadow (`triage_main` / `triage_web_widget`) and CUT2–CUT8 live fanout sources.
 *
 * Grep: `[orchestrator.intake.post_bootstrap.parity]`
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";

export const ORCHESTRATOR_INTAKE_POST_BOOTSTRAP_PARITY_LOG_TAG =
  "[orchestrator.intake.post_bootstrap.parity]";

export type IntakePostBootstrapParityFanoutSource = "intake_post_bootstrap_parity";

export type IntakePostBootstrapParityCorrelationFields = {
  intakeParityCorrelationId: string;
  intakeParityFanoutSource: IntakePostBootstrapParityFanoutSource;
};

export type IntakePostBootstrapParityObservationRecord = {
  compare_kind: "orchestrator.intake.post_bootstrap_parity.v1";
  /** Orchestrator did not insert drafts or escalation artifacts for this run. */
  dbSideEffectsSuppressed: true;
  intakeParityCorrelationId: string;
  intakeParityFanoutSource: IntakePostBootstrapParityFanoutSource;
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web";
  requestedExecutionMode: string;
  orchestratorOutcome: ClientOrchestratorV1CoreResult["orchestratorOutcome"];
  draftCreated: boolean;
  escalationArtifactCreated: boolean;
  draftSkipReason: string | null;
  escalationSkipReason: string | null;
  neitherDraftNorEscalationReason: string | null;
  proposalCount: number;
  chosenCandidateActionFamily: string | null;
  chosenCandidateActionKey: string | null;
};

export function parseIntakePostBootstrapParityFromEventData(data: {
  intakeParityCorrelationId?: string;
  intakeParityFanoutSource?: string;
}): IntakePostBootstrapParityCorrelationFields | null {
  const id = data.intakeParityCorrelationId;
  const src = data.intakeParityFanoutSource;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  if (src !== "intake_post_bootstrap_parity") {
    return null;
  }
  return {
    intakeParityCorrelationId: id.trim(),
    intakeParityFanoutSource: src,
  };
}

export function buildIntakePostBootstrapParityObservationRecord(
  correlation: IntakePostBootstrapParityCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  routing: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email" | "web";
    requestedExecutionMode: string;
  },
): IntakePostBootstrapParityObservationRecord {
  const cc = result.chosenCandidate;
  return {
    compare_kind: "orchestrator.intake.post_bootstrap_parity.v1",
    dbSideEffectsSuppressed: true,
    intakeParityCorrelationId: correlation.intakeParityCorrelationId,
    intakeParityFanoutSource: correlation.intakeParityFanoutSource,
    photographerId: result.photographerId,
    weddingId: routing.weddingId,
    threadId: routing.threadId,
    replyChannel: routing.replyChannel,
    requestedExecutionMode: routing.requestedExecutionMode,
    orchestratorOutcome: result.orchestratorOutcome,
    draftCreated: result.draftCreated,
    escalationArtifactCreated: result.escalationArtifactCreated,
    draftSkipReason: result.draftAttempt.skipReason,
    escalationSkipReason: result.escalationAttempt.skipReason,
    neitherDraftNorEscalationReason: result.neitherDraftNorEscalationReason,
    proposalCount: result.proposalCount,
    chosenCandidateActionFamily: cc?.action_family ?? null,
    chosenCandidateActionKey: cc?.action_key ?? null,
  };
}

export function logIntakePostBootstrapParityObservationRecord(
  record: IntakePostBootstrapParityObservationRecord,
): void {
  console.log(ORCHESTRATOR_INTAKE_POST_BOOTSTRAP_PARITY_LOG_TAG, JSON.stringify(record));
}
