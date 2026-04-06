/**
 * Phase 2 Slice B2 — high-level legacy-vs-orchestrator parity labels for QA replay (observability only).
 *
 * Does not invoke legacy workers or compare prose; encodes conservative expectations for execution class
 * (auto / draft / ask / block) and draft/escalation presence flags aligned with roadmap B2.
 */
import type { ClientOrchestratorV1CoreResult } from "./clientOrchestratorV1Core.ts";

export type OrchestratorOutcomeClass = "auto" | "draft" | "ask" | "block";

export type OrchestratorParityStatus = "parity_pass" | "parity_gap" | "skipped";

/** Machine-readable gap codes (stable strings for logs/CI parsing). */
export const PARITY_GAP_OUTCOME_CLASS_MISMATCH = "parity_gap:outcome_class_mismatch";
export const PARITY_GAP_DRAFT_ONLY_NO_DRAFT_ROW = "parity_gap:draft_only_without_draft_row";
export const PARITY_GAP_MISSING_ESCALATION_ARTIFACT = "parity_gap:missing_escalation_artifact";
export const PARITY_GAP_UNEXPECTED_ESCALATION_ARTIFACT = "parity_gap:unexpected_escalation_artifact";
export const PARITY_GAP_MISSING_RESULT = "parity_gap:missing_result";

/** Maps B1 harness row flags to legacy coarse expectations (same fields as scenario table). */
export function legacyParityExpectationFromHarnessScenario(args: {
  expectedOutcome: OrchestratorOutcomeClass;
  warnDraftOutcomeWithoutDraft: boolean;
  requireEscalationArtifact: boolean;
}): LegacyParityExpectation {
  return {
    expectedOutcomeClass: args.expectedOutcome,
    expectDraftRowWhenDraftOutcome: args.warnDraftOutcomeWithoutDraft,
    expectEscalationArtifact: args.requireEscalationArtifact,
  };
}

export type LegacyParityExpectation = {
  /** Expected orchestrator outcome class (same coarse bucket legacy routing would target for this scenario). */
  expectedOutcomeClass: OrchestratorOutcomeClass;
  /**
   * When execution mode is draft_only, legacy path expects a reviewable draft when a client reply is proposed.
   * If orchestrator outcome is draft but A2 did not insert, report gap (tenant may lack send_message candidate).
   */
  expectDraftRowWhenDraftOutcome: boolean;
  /** ask_first / block paths: legacy expects human gate — mirrored by A3 escalation artifact. */
  expectEscalationArtifact: boolean;
};

export type LegacyParityEvaluation = {
  parityStatus: OrchestratorParityStatus;
  /** Non-empty only when parity_gap */
  parityGapCodes: string[];
  /** Human-readable detail lines */
  parityGapDetails: string[];
  /** Flat key/value for JSON logs */
  paritySignals: Record<string, string | boolean | number>;
};

function pushGap(
  codes: string[],
  details: string[],
  code: string,
  detail: string,
): void {
  codes.push(code);
  details.push(detail);
}

/**
 * @param skipReason — when non-null, scenario was not executed (fixtures).
 */
export function evaluateOrchestratorLegacyParity(args: {
  scenarioId: string;
  skipReason: string | null;
  result: ClientOrchestratorV1CoreResult | null;
  legacy: LegacyParityExpectation;
}): LegacyParityEvaluation {
  const { scenarioId, skipReason, result, legacy } = args;

  if (skipReason !== null) {
    return {
      parityStatus: "skipped",
      parityGapCodes: [],
      parityGapDetails: [],
      paritySignals: {
        scenario_id: scenarioId,
        parity_status: "skipped",
        skip_reason: skipReason,
      },
    };
  }

  if (result === null) {
    return {
      parityStatus: "parity_gap",
      parityGapCodes: [PARITY_GAP_MISSING_RESULT],
      parityGapDetails: ["Internal: skipReason was null but result was null"],
      paritySignals: { scenario_id: scenarioId, parity_status: "parity_gap" },
    };
  }

  const codes: string[] = [];
  const details: string[] = [];
  const oc = result.orchestratorOutcome;

  if (oc !== legacy.expectedOutcomeClass) {
    pushGap(
      codes,
      details,
      PARITY_GAP_OUTCOME_CLASS_MISMATCH,
      `expected outcome class ${legacy.expectedOutcomeClass}, got ${oc}`,
    );
  }

  if (legacy.expectDraftRowWhenDraftOutcome && oc === "draft" && !result.draftCreated) {
    pushGap(
      codes,
      details,
      PARITY_GAP_DRAFT_ONLY_NO_DRAFT_ROW,
      `draft_only path expected a draft row when outcome is draft; skipReason=${
        result.draftAttempt.skipReason ?? "unknown"
      }`,
    );
  }

  if (legacy.expectEscalationArtifact && !result.escalationArtifactCreated) {
    pushGap(
      codes,
      details,
      PARITY_GAP_MISSING_ESCALATION_ARTIFACT,
      `expected escalation artifact for gated path; skipReason=${
        result.escalationAttempt.skipReason ?? result.escalationAttempt.toolEscalateError ?? "unknown"
      }`,
    );
  }

  if (!legacy.expectEscalationArtifact && result.escalationArtifactCreated) {
    pushGap(
      codes,
      details,
      PARITY_GAP_UNEXPECTED_ESCALATION_ARTIFACT,
      "legacy expectation: no escalation artifact for this scenario",
    );
  }

  const parityStatus: OrchestratorParityStatus = codes.length === 0 ? "parity_pass" : "parity_gap";

  return {
    parityStatus,
    parityGapCodes: codes,
    parityGapDetails: details,
    paritySignals: {
      scenario_id: scenarioId,
      parity_status: parityStatus,
      orchestrator_outcome: oc,
      expected_outcome_class: legacy.expectedOutcomeClass,
      draft_created: result.draftCreated,
      escalation_artifact_created: result.escalationArtifactCreated,
      parity_gap_count: codes.length,
    },
  };
}
