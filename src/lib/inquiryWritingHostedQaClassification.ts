/**
 * Hosted inquiry-writing QA: classify final `drafts` rows without conflating
 * Ana voice quality with stub fallback, persona-disabled runs, or V3 output-auditor rejections.
 *
 * Mirrors instruction_history shapes written by `maybeRewriteOrchestratorDraftWithPersona.ts`.
 */

export type InquiryWritingQaFinalState =
  | "persona_final"
  | "stub_fallback"
  | "auditor_rejected"
  | "runtime_failure";

export type InstructionHistoryEntry = Record<string, unknown>;

/** Legacy A2 diagnostic drafts — older rows only; must match historical `attemptOrchestratorDraft` copy. */
const ORCHESTRATOR_STUB_MARKER = "[Orchestrator draft — clientOrchestratorV1 QA path]";

/**
 * Current pending-draft placeholder (client-safe). Must match
 * `ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER` in `supabase/functions/_shared/orchestrator/attemptOrchestratorDraft.ts`.
 */
const ORCHESTRATOR_PENDING_DRAFT_PLACEHOLDER =
  "Reply draft pending — generated text will replace this when the writer runs successfully.";

const OUTPUT_AUDITOR_BODY_MARKER = "[V3 output auditor]";

/** Must match `V3_PRICING_DATA_GUARDRAIL_STEP` in `budgetStatementInjection.ts` (instruction_history). */
const PRICING_DATA_GUARDRAIL_STEP = "v3_pricing_data_guardrail_missing_verified_minimum";
const PERSONA_WRITER_SUCCESS_STEP = "persona_writer_after_client_orchestrator_v1";

/** True when body is the safe pending placeholder or a legacy diagnostic stub (hosted QA / parity). */
export function bodyLooksLikeOrchestratorStub(body: string): boolean {
  const t = body.trim();
  return t.includes(ORCHESTRATOR_PENDING_DRAFT_PLACEHOLDER) || t.includes(ORCHESTRATOR_STUB_MARKER);
}

export function bodyHasOutputAuditorRestoredMarker(body: string): boolean {
  return body.includes(OUTPUT_AUDITOR_BODY_MARKER);
}

export function parseInstructionHistoryEntries(instructionHistory: unknown): InstructionHistoryEntry[] {
  return Array.isArray(instructionHistory) ? (instructionHistory as InstructionHistoryEntry[]) : [];
}

function stepName(e: InstructionHistoryEntry): string | null {
  const s = e.step;
  return typeof s === "string" ? s : null;
}

/**
 * Returns ordered step names plus flags used for hosted QA classification.
 */
export function summarizeInstructionHistory(instructionHistory: unknown): {
  stepNames: string[];
  /** True only for the successful Claude persona draft step — not guardrails or other steps containing the substring `persona_writer`. */
  personaWriterPresent: boolean;
  /** True when budget-fit pricing was blocked for missing verified playbook minimums (persona skipped). */
  pricingDataGuardrailPresent: boolean;
  /** Either persona draft completed or pricing guardrail finished — hosted QA polling can stop. */
  orchestratorDraftRewriteSettled: boolean;
  auditorRejection: {
    rejected: boolean;
    steps: string[];
    violations: string[];
  };
  personaCommittedTerms: unknown | null;
} {
  const entries = parseInstructionHistoryEntries(instructionHistory);
  const stepNames = entries.map((e) => stepName(e)).filter((s): s is string => s !== null);

  const personaEntry = entries.find((e) => stepName(e) === PERSONA_WRITER_SUCCESS_STEP);
  const pricingDataGuardrailPresent = entries.some((e) => stepName(e) === PRICING_DATA_GUARDRAIL_STEP);
  const personaCommittedTerms =
    personaEntry && "committed_terms" in personaEntry ? personaEntry.committed_terms : null;

  const auditorSteps: string[] = [];
  const violations: string[] = [];
  for (const e of entries) {
    const n = stepName(e);
    if (!n || !n.startsWith("v3_output_auditor")) continue;
    const passed = e.passed;
    if (passed === false) {
      auditorSteps.push(n);
      const v = e.violations;
      if (Array.isArray(v)) {
        for (const x of v) {
          if (typeof x === "string") violations.push(x);
        }
      }
    }
  }

  return {
    stepNames,
    personaWriterPresent: personaEntry !== undefined,
    pricingDataGuardrailPresent,
    orchestratorDraftRewriteSettled: personaEntry !== undefined || pricingDataGuardrailPresent,
    auditorRejection: {
      rejected: auditorSteps.length > 0,
      steps: auditorSteps,
      violations,
    },
    personaCommittedTerms,
  };
}

export type ClassifyInquiryWritingQaDraftInput = {
  /** False when no draft row was linked to the scenario. */
  draftFound: boolean;
  body: string;
  instructionHistory: unknown;
  /** True when polling stopped without seeing a persona_writer step (may still be stub-only). */
  settleTimedOut: boolean;
};

export type ClassifyInquiryWritingQaDraftResult = {
  finalState: InquiryWritingQaFinalState;
  /** Human-readable — not a voice score. */
  classificationNotes: string;
  evidence: {
    stepNames: string[];
    personaWriterInHistory: boolean;
    auditorRejectedByHistory: boolean;
    auditorStepNames: string[];
    auditorViolations: string[];
    outputAuditorMarkerInBody: boolean;
    bodyLooksLikeStub: boolean;
    settleTimedOut: boolean;
    personaCommittedTerms: unknown | null;
  };
};

/**
 * Deterministic classification for hosted inquiry QA reports.
 *
 * Precedence: runtime failure → auditor rejection (history or body marker) → persona success chain → stub fallback.
 */
export function classifyInquiryWritingQaDraft(input: ClassifyInquiryWritingQaDraftInput): ClassifyInquiryWritingQaDraftResult {
  if (!input.draftFound) {
    return {
      finalState: "runtime_failure",
      classificationNotes: "No draft row was found for this scenario (orchestrator did not persist A2 draft in time).",
      evidence: {
        stepNames: [],
        personaWriterInHistory: false,
        auditorRejectedByHistory: false,
        auditorStepNames: [],
        auditorViolations: [],
        outputAuditorMarkerInBody: false,
        bodyLooksLikeStub: false,
        settleTimedOut: input.settleTimedOut,
        personaCommittedTerms: null,
      },
    };
  }

  const summary = summarizeInstructionHistory(input.instructionHistory);
  const outputAuditorMarkerInBody = bodyHasOutputAuditorRestoredMarker(input.body);
  const bodyLooksLikeStub = bodyLooksLikeOrchestratorStub(input.body);

  const auditorRejectedByHistory = summary.auditorRejection.rejected;
  const auditorRejected = auditorRejectedByHistory || outputAuditorMarkerInBody;

  if (auditorRejected) {
    const notes =
      "Persona wrote a draft but the V3 output auditor rejected it; body was restored to the orchestrator stub plus an operator-facing marker. " +
      "This is a grounding/policy/commercial-safety outcome — not an Ana tone regression.";
    return {
      finalState: "auditor_rejected",
      classificationNotes: notes,
      evidence: {
        stepNames: summary.stepNames,
        personaWriterInHistory: summary.personaWriterPresent,
        auditorRejectedByHistory,
        auditorStepNames: summary.auditorRejection.steps,
        auditorViolations: summary.auditorRejection.violations,
        outputAuditorMarkerInBody,
        bodyLooksLikeStub,
        settleTimedOut: input.settleTimedOut,
        personaCommittedTerms: summary.personaCommittedTerms,
      },
    };
  }

  if (summary.personaWriterPresent) {
    return {
      finalState: "persona_final",
      classificationNotes:
        "Instruction history shows persona_writer_after_client_orchestrator_v1 with no failed v3_output_auditor step — " +
        "this body is the post-audit client-facing persona draft (valid for voice review when the scenario is voice-oriented).",
      evidence: {
        stepNames: summary.stepNames,
        personaWriterInHistory: true,
        auditorRejectedByHistory: false,
        auditorStepNames: [],
        auditorViolations: [],
        outputAuditorMarkerInBody: false,
        bodyLooksLikeStub,
        settleTimedOut: input.settleTimedOut,
        personaCommittedTerms: summary.personaCommittedTerms,
      },
    };
  }

  const stubNotes =
    input.settleTimedOut
      ? "Settle wait ended before a persona_writer step appeared — either persona rewrite is disabled on the worker (no API key / env), failed before logging, or the run exceeded the QA settle budget."
      : "Instruction history never recorded persona_writer — orchestrator stub only, or persona rewrite did not apply.";

  return {
    finalState: "stub_fallback",
    classificationNotes: stubNotes,
    evidence: {
      stepNames: summary.stepNames,
      personaWriterInHistory: false,
      auditorRejectedByHistory: false,
      auditorStepNames: [],
      auditorViolations: [],
      outputAuditorMarkerInBody: false,
      bodyLooksLikeStub,
      settleTimedOut: input.settleTimedOut,
      personaCommittedTerms: null,
    },
  };
}
