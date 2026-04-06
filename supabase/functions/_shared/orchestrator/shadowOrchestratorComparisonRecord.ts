/**
 * Phase 2 Slice B3 — machine-readable shadow vs legacy comparison signals (observability only).
 *
 * Grep-friendly log line: `[orchestrator.shadow.compare]` + JSON (stable prefix).
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";

export const ORCHESTRATOR_SHADOW_COMPARE_LOG_TAG = "[orchestrator.shadow.compare]";

export type ShadowOrchestratorFanoutSource = "triage_main" | "triage_web_widget";

/** Optional fields on `ai/orchestrator.client.v1` when emitted from triage shadow fanout. */
export type OrchestratorShadowCorrelationFields = {
  shadowCorrelationId: string;
  /** Legacy specialist bucket triage routed for this turn (`ai/intent.*` worker name). */
  legacyTriageIntent: string;
  shadowFanoutSource: ShadowOrchestratorFanoutSource;
};

export type ShadowOrchestratorReadinessRecord = {
  compare_kind: "orchestrator.shadow.v1";
  shadowCorrelationId: string;
  legacyTriageIntent: string;
  shadowFanoutSource: ShadowOrchestratorFanoutSource;
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

export function parseShadowCorrelationFromEventData(data: {
  shadowCorrelationId?: string;
  legacyTriageIntent?: string;
  shadowFanoutSource?: string;
}): OrchestratorShadowCorrelationFields | null {
  const id = data.shadowCorrelationId;
  const intent = data.legacyTriageIntent;
  const src = data.shadowFanoutSource;
  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    typeof intent !== "string" ||
    intent.trim().length === 0 ||
    (src !== "triage_main" && src !== "triage_web_widget")
  ) {
    return null;
  }
  return {
    shadowCorrelationId: id.trim(),
    legacyTriageIntent: intent.trim(),
    shadowFanoutSource: src,
  };
}

export function buildShadowOrchestratorReadinessRecord(
  correlation: OrchestratorShadowCorrelationFields,
  result: ClientOrchestratorV1CoreResult,
  routing: {
    weddingId: string | null;
    threadId: string | null;
    replyChannel: "email" | "web";
    requestedExecutionMode: string;
  },
): ShadowOrchestratorReadinessRecord {
  const cc = result.chosenCandidate;
  return {
    compare_kind: "orchestrator.shadow.v1",
    shadowCorrelationId: correlation.shadowCorrelationId,
    legacyTriageIntent: correlation.legacyTriageIntent,
    shadowFanoutSource: correlation.shadowFanoutSource,
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

export function logShadowOrchestratorReadinessRecord(record: ShadowOrchestratorReadinessRecord): void {
  console.log(ORCHESTRATOR_SHADOW_COMPARE_LOG_TAG, JSON.stringify(record));
}
