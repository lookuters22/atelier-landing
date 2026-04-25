/**
 * Shared types/helpers for CUT4–CUT8 live orchestrator observation records (email/web main-path gates).
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";

export type OrchestratorLiveOutcomeBucket =
  | "draft_created"
  | "escalation_artifact"
  | "neither_draft_nor_escalation";

/** Fields shared by CUT4–CUT8 `*.live.observe` JSON payloads after correlation/compare_kind. */
export type OrchestratorLiveObservationRecordSharedBody = {
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
  outcome_bucket: OrchestratorLiveOutcomeBucket;
  rollback_suggested_no_visible_outcome: boolean;
  rollback_suggested_verifier_blocked: boolean;
};

export function orchestratorLiveOutcomeBucket(
  result: ClientOrchestratorV1CoreResult,
): OrchestratorLiveOutcomeBucket {
  if (result.draftCreated) return "draft_created";
  if (result.escalationArtifactCreated) return "escalation_artifact";
  return "neither_draft_nor_escalation";
}
