import { describe, expect, it } from "vitest";
import {
  bodyHasOutputAuditorRestoredMarker,
  bodyLooksLikeOrchestratorStub,
  classifyInquiryWritingQaDraft,
  summarizeInstructionHistory,
} from "./inquiryWritingHostedQaClassification.ts";

const PENDING_PLACEHOLDER =
  "Reply draft pending — generated text will replace this when the writer runs successfully.";

describe("inquiryWritingHostedQaClassification", () => {
  it("classifies runtime_failure when no draft", () => {
    const r = classifyInquiryWritingQaDraft({
      draftFound: false,
      body: "",
      instructionHistory: [],
      settleTimedOut: true,
    });
    expect(r.finalState).toBe("runtime_failure");
  });

  it("classifies auditor_rejected when history has v3_output_auditor with passed false", () => {
    const r = classifyInquiryWritingQaDraft({
      draftFound: true,
      body: "[Orchestrator draft — clientOrchestratorV1 QA path]\n\n[V3 output auditor] stub restored.",
      instructionHistory: [
        { step: "client_orchestrator_v1" },
        {
          step: "persona_writer_after_client_orchestrator_v1",
          committed_terms: { x: 1 },
        },
        {
          step: "v3_output_auditor_commercial_terms",
          passed: false,
          violations: ["invented price"],
        },
      ],
      settleTimedOut: false,
    });
    expect(r.finalState).toBe("auditor_rejected");
    expect(r.evidence.auditorRejectedByHistory).toBe(true);
    expect(r.evidence.personaCommittedTerms).toEqual({ x: 1 });
  });

  it("classifies auditor_rejected from body marker even if history omitted (defensive)", () => {
    const r = classifyInquiryWritingQaDraft({
      draftFound: true,
      body: "something\n\n[V3 output auditor] Persona draft rejected",
      instructionHistory: [{ step: "client_orchestrator_v1" }],
      settleTimedOut: false,
    });
    expect(r.finalState).toBe("auditor_rejected");
    expect(r.evidence.outputAuditorMarkerInBody).toBe(true);
  });

  it("does not classify persona_final when only pricing guardrail step is present (substring trap)", () => {
    const r = classifyInquiryWritingQaDraft({
      draftFound: true,
      body: "[Orchestrator draft — clientOrchestratorV1 QA path]\nstub\n\n[V3 pricing guardrail] blocked",
      instructionHistory: [
        { step: "client_orchestrator_v1" },
        { step: "v3_pricing_data_guardrail_missing_verified_minimum", code: "MISSING_PRICING_DATA" },
        {
          step: "v3_output_auditor_commercial_terms",
          passed: false,
          violations: ["MISSING_PRICING_DATA: skipped persona"],
        },
      ],
      settleTimedOut: false,
    });
    expect(r.finalState).toBe("auditor_rejected");
  });

  it("classifies persona_final when persona_writer and auditors passed", () => {
    const r = classifyInquiryWritingQaDraft({
      draftFound: true,
      body: "Hi,\n\nAna",
      instructionHistory: [
        { step: "client_orchestrator_v1" },
        { step: "persona_writer_after_client_orchestrator_v1", committed_terms: {} },
        { step: "v3_output_auditor_commercial_terms", passed: true },
        { step: "v3_output_auditor_planner_private_leakage", passed: true },
      ],
      settleTimedOut: false,
    });
    expect(r.finalState).toBe("persona_final");
  });

  it("classifies stub_fallback when only orchestrator step", () => {
    const r = classifyInquiryWritingQaDraft({
      draftFound: true,
      body: PENDING_PLACEHOLDER,
      instructionHistory: [{ step: "client_orchestrator_v1" }],
      settleTimedOut: true,
    });
    expect(r.finalState).toBe("stub_fallback");
    expect(r.evidence.bodyLooksLikeStub).toBe(true);
  });

  it("summarizeInstructionHistory collects auditor violations", () => {
    const s = summarizeInstructionHistory([
      { step: "v3_output_auditor_planner_private_leakage", passed: false, violations: ["a", "b"] },
    ]);
    expect(s.auditorRejection.rejected).toBe(true);
    expect(s.auditorRejection.violations).toEqual(["a", "b"]);
  });

  it("summarizeInstructionHistory: exact persona step only — guardrail settles without persona_writer", () => {
    const s = summarizeInstructionHistory([
      { step: "client_orchestrator_v1" },
      { step: "v3_pricing_data_guardrail_missing_verified_minimum" },
    ]);
    expect(s.personaWriterPresent).toBe(false);
    expect(s.pricingDataGuardrailPresent).toBe(true);
    expect(s.orchestratorDraftRewriteSettled).toBe(true);
  });

  it("bodyLooksLikeOrchestratorStub matches pending placeholder and legacy A2 header", () => {
    expect(bodyLooksLikeOrchestratorStub(PENDING_PLACEHOLDER)).toBe(true);
    expect(bodyLooksLikeOrchestratorStub("[Orchestrator draft — clientOrchestratorV1 QA path]\n")).toBe(true);
    expect(bodyHasOutputAuditorRestoredMarker("x [V3 output auditor] y")).toBe(true);
  });
});
