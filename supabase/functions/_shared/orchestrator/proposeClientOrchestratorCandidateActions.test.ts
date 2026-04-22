import { describe, expect, it } from "vitest";
import type { DecisionAudienceSnapshot } from "../../../../src/types/decisionContext.types.ts";
import { proposeClientOrchestratorCandidateActions } from "./proposeClientOrchestratorCandidateActions.ts";
import { emptyV3ThreadWorkflowV1 } from "../workflow/v3ThreadWorkflowTypes.ts";
import { mergeV3ThreadWorkflow } from "../workflow/mergeV3ThreadWorkflow.ts";
import { IDENTITY_THREAD_MULTI_WEDDING_BLOCKER } from "../context/threadWeddingIdentityAmbiguous.ts";
import { BANKING_COMPLIANCE_EXCEPTION_BLOCKER } from "./detectBankingComplianceOrchestratorException.ts";
import { VISUAL_ASSET_VERIFICATION_BLOCKER } from "./detectVisualAssetVerificationOrchestratorRequest.ts";
import { VISUAL_ASSET_VERIFICATION_HOLD_RATIONALE } from "./detectVisualAssetVerificationOrchestratorRequest.ts";
import {
  ORCHESTRATOR_AP1_ESCALATION_REASON_CODES,
  ORCHESTRATOR_BC_ESCALATION_REASON_CODES,
  ORCHESTRATOR_IE2_ESCALATION_REASON_CODES,
  ORCHESTRATOR_CCM_ESCALATION_REASON_CODES,
  ORCHESTRATOR_ISR_ESCALATION_REASON_CODES,
  ORCHESTRATOR_VAV_ESCALATION_REASON_CODES,
  ORCHESTRATOR_SPD_ESCALATION_REASON_CODES,
  ORCHESTRATOR_STR_ESCALATION_REASON_CODES,
} from "../../../../src/types/decisionContext.types.ts";
import { NO_BOOKING_CONTEXT_CLIENT_REPLY_BLOCKER } from "./proposeClientOrchestratorCandidateActions.ts";
import { IDENTITY_ENTITY_AMBIGUITY_BLOCKER } from "./detectIdentityEntityRoutingAmbiguity.ts";
import { AUTHORITY_POLICY_BLOCKER } from "./detectAuthorityPolicyRisk.ts";
import { IRREGULAR_SETTLEMENT_BLOCKER } from "./detectIrregularSettlementOrchestratorRequest.ts";
import { HIGH_MAGNITUDE_CLIENT_CONCESSION_BLOCKER } from "./detectHighMagnitudeClientConcessionOrchestratorRequest.ts";
import { SENSITIVE_PERSONAL_DOCUMENT_BLOCKER } from "./detectSensitivePersonalDocumentOrchestratorRequest.ts";
import { STRATEGIC_TRUST_REPAIR_BLOCKER } from "./detectStrategicTrustRepairOrchestratorRequest.ts";

function baseAudience(overrides: Partial<DecisionAudienceSnapshot> = {}): DecisionAudienceSnapshot {
  return {
    threadParticipants: [],
    agencyCcLock: overrides.agencyCcLock ?? false,
    broadcastRisk: overrides.broadcastRisk ?? "low",
    recipientCount: overrides.recipientCount ?? 1,
    visibilityClass: overrides.visibilityClass ?? "client_visible",
    clientVisibleForPrivateCommercialRedaction:
      overrides.clientVisibleForPrivateCommercialRedaction ?? true,
    approvalContactPersonIds: overrides.approvalContactPersonIds ?? [],
    inboundSuppression: overrides.inboundSuppression ?? null,
  };
}

describe("proposeClientOrchestratorCandidateActions — Phase 4.1 NC risk", () => {
  it("operator first and send_message blocked with metadata when artistic_dispute", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "The wedding day colors look fake, my hair looks yellow in the photos, and some crops feel weird.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_family).toBe("operator_notification_routing");
    expect(proposals[0]?.risk_class).toBe("artistic_dispute");
    expect(proposals[0]?.escalation_reason_code).toBe("NC_ARTISTIC_DISPUTE_V1");
    const send = proposals.find((p) => p.action_family === "send_message");
    expect(send?.likely_outcome).toBe("block");
    expect(send?.risk_class).toBe("artistic_dispute");
    expect(send?.blockers_or_missing_facts.some((b) => b.startsWith("non_commercial_high_risk:"))).toBe(
      true,
    );
  });

  it("unchanged ordering when no NC hit", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Thanks — the timeline works for us.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_family).toBe("send_message");
    expect(proposals[0]?.likely_outcome).toBe("draft");
    expect(proposals[0]?.risk_class).toBeUndefined();
  });

  it("needs filing: blocks routine send_message draft when weddingId is missing (unfiled thread)", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: null,
      threadId: "t-unfiled",
      replyChannel: "email",
      rawMessage: "Zoom invite or friend note — not linked to an inquiry yet.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    const primarySend = proposals.find(
      (p) => p.action_family === "send_message" && p.action_key === "send_message",
    );
    expect(primarySend?.likely_outcome).toBe("block");
    expect(primarySend?.blockers_or_missing_facts).toContain(NO_BOOKING_CONTEXT_CLIENT_REPLY_BLOCKER);
    expect(primarySend?.rationale).toMatch(/needs filing|No inquiry\/booking project is linked/i);
    const op = proposals.find((p) => p.action_family === "operator_notification_routing");
    expect(op).toBeTruthy();
  });

  it("needs filing: blocks disambiguation send_message too (draft picker only skips likely_outcome block)", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: null,
      threadId: "t-multi",
      replyChannel: "email",
      rawMessage: "Following up on our dates.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: ["wedding-a", "wedding-b"],
    });
    const disamb = proposals.find((p) => p.action_key === "v3_wedding_identity_disambiguation");
    expect(disamb?.likely_outcome).toBe("block");
    expect(disamb?.blockers_or_missing_facts).toContain(NO_BOOKING_CONTEXT_CLIENT_REPLY_BLOCKER);
  });

  it("needs filing: forces playbook send_message to block when weddingId is missing", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [
        {
          id: "rule-needs-filing-guard",
          topic: "Test",
          action_key: "send_message",
          channel: "email",
          instruction: "Always reply warmly.",
          decision_mode: "draft_only",
          is_active: true,
          // deno-lint-ignore no-explicit-any
        } as any,
      ],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: null,
      threadId: "t-unfiled",
      replyChannel: "email",
      rawMessage: "Hello from an unfiled thread.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    const playbookSend = proposals.find((p) => p.playbook_rule_ids?.includes("rule-needs-filing-guard"));
    expect(playbookSend?.likely_outcome).toBe("block");
    expect(playbookSend?.blockers_or_missing_facts).toContain(NO_BOOKING_CONTEXT_CLIENT_REPLY_BLOCKER);
  });

  it("adds wire chase CRM candidate when workflow has pending chase_due_at", () => {
    const wf = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      payment_wire: {
        promised_at: "2026-01-01T00:00:00.000Z",
        chase_due_at: "2026-01-03T12:00:00.000Z",
      },
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Hello",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      v3ThreadWorkflow: wf,
    });
    const wire = proposals.find((p) => p.action_key === "v3_wire_chase_scheduled");
    expect(wire?.action_family).toBe("update_crm");
    const send = proposals.find((p) => p.action_family === "send_message" && p.id.startsWith("cand-"));
    expect(send?.likely_outcome).toBe("block");
    expect(send?.blockers_or_missing_facts.some((b) => b.startsWith("workflow_payment_wire_chase_due_at:"))).toBe(
      true,
    );
  });

  it("blocks routine send_message when timeline suppressed on another channel (draftability)", () => {
    const wf = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      timeline: { suppressed: true, received_channel: "whatsapp" },
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Following up on the timeline",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      v3ThreadWorkflow: wf,
    });
    const send = proposals.find((p) => p.action_family === "send_message" && p.id.startsWith("cand-"));
    expect(send?.likely_outcome).toBe("block");
    expect(send?.blockers_or_missing_facts.some((b) => b.startsWith("workflow_timeline_suppressed_other_channel:"))).toBe(
      true,
    );
  });

  it("blocks playbook send_message candidates when workflow suppresses routine reply", () => {
    const wf = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      stalled_inquiry: {
        client_marked_at: "2026-01-01T00:00:00.000Z",
        nudge_due_at: "2026-01-05T00:00:00.000Z",
      },
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [
        {
          id: "rule-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          topic: "tone",
          channel: "email",
          instruction: "Be warm",
          action_key: "send_message",
          decision_mode: "draft_only",
          is_active: true,
        },
      ],
      selectedMemoriesCount: 1,
      globalKnowledgeCount: 1,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Hello",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      v3ThreadWorkflow: wf,
    });
    const pbSend = proposals.find((p) => p.playbook_rule_ids?.includes("rule-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
    expect(pbSend?.action_family).toBe("send_message");
    expect(pbSend?.likely_outcome).toBe("block");
  });
});

describe("proposeClientOrchestratorCandidateActions — Phase 1 multi-wedding identity", () => {
  it("preserves normal primary send when at most one candidate wedding on thread", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Quick question about the timeline.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: ["w1"],
    });
    expect(proposals[0]?.action_family).toBe("send_message");
    expect(proposals[0]?.action_key).toBe("send_message");
    expect(proposals[0]?.likely_outcome).toBe("draft");
    expect(proposals[0]?.blockers_or_missing_facts.includes(IDENTITY_THREAD_MULTI_WEDDING_BLOCKER)).toBe(false);
  });

  it("operator first, routine send blocked, stable identity blocker, disambiguation send when multiple thread weddings", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Which invoice applies to Cambodia vs Italy?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: ["w-cambodia", "w-italy"],
      inboundSenderAuthority: {
        bucket: "client_primary",
        personId: "p1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_family).toBe("operator_notification_routing");
    expect(proposals[0]?.action_key).toBe("v3_multithread_wedding_identity");
    expect(proposals[1]?.action_family).toBe("send_message");
    expect(proposals[1]?.action_key).toBe("send_message");
    expect(proposals[1]?.likely_outcome).toBe("block");
    expect(proposals[1]?.blockers_or_missing_facts).toContain(IDENTITY_THREAD_MULTI_WEDDING_BLOCKER);
    const disamb = proposals.find((p) => p.action_key === "v3_wedding_identity_disambiguation");
    expect(disamb?.likely_outcome).toBe("draft");
    expect(disamb?.action_family).toBe("send_message");
  });
});

describe("proposeClientOrchestratorCandidateActions — irregular settlement / tax-avoidance gate", () => {
  it("cash + VAT: operator v3_irregular_settlement_exception first, routine send blocked, ISR metadata", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "Could we receive the commission in cash on the first day to avoid the VAT charge?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("v3_irregular_settlement_exception");
    expect(proposals[0]?.irregular_settlement_reason_code).toBe(
      ORCHESTRATOR_ISR_ESCALATION_REASON_CODES.settlement_or_tax_avoidance_request,
    );
    const routine = proposals.find((p) => p.action_key === "send_message" && p.id.startsWith("cand-"));
    expect(routine?.likely_outcome).toBe("block");
    expect(routine?.blockers_or_missing_facts).toContain(IRREGULAR_SETTLEMENT_BLOCKER);
  });

  it("ISR precedes BC when both patterns appear", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "My bank can't send a wire with this beneficiary. Please provide an IBAN. Could we also pay part in cash to avoid VAT?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("v3_irregular_settlement_exception");
    expect(proposals.some((p) => p.action_key === "v3_banking_compliance_exception")).toBe(false);
  });
});

describe("proposeClientOrchestratorCandidateActions — high-magnitude client concession (CCM)", () => {
  it("client st7-shaped: operator v3_high_magnitude_client_concession first, primary send blocked", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "Please reduce the price to €18,000 all-in. I cannot approve €21,700.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      inboundSenderAuthority: {
        bucket: "client_primary",
        personId: "c1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("v3_high_magnitude_client_concession");
    expect(proposals[0]?.high_magnitude_client_concession_reason_code).toBe(
      ORCHESTRATOR_CCM_ESCALATION_REASON_CODES.high_magnitude_client_concession_request,
    );
    const routine = proposals.find((p) => p.action_key === "send_message" && p.id.startsWith("cand-"));
    expect(routine?.likely_outcome).toBe("block");
    expect(routine?.blockers_or_missing_facts).toContain(HIGH_MAGNITUDE_CLIENT_CONCESSION_BLOCKER);
  });

  it("planner same commercial body: AP1 branch, not CCM", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "Please reduce the price to €18,000 all-in. I cannot approve €21,700.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      inboundSenderAuthority: {
        bucket: "planner",
        personId: "pl1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("v3_authority_policy_risk");
    expect(proposals.some((p) => p.action_key === "v3_high_magnitude_client_concession")).toBe(false);
  });
});

describe("proposeClientOrchestratorCandidateActions — strategic trust-repair (STR)", () => {
  it("fully-booked reversal: operator v3_strategic_trust_repair first, primary blocked, no update_crm keyword", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "I'm confused — last week Ana said you were fully booked and couldn't take our date, but today the email says you'd happily make an exception. Which is accurate?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("v3_strategic_trust_repair");
    expect(proposals[0]?.strategic_trust_repair_reason_code).toBe(
      ORCHESTRATOR_STR_ESCALATION_REASON_CODES.contradiction_or_expectation_repair_request,
    );
    const routine = proposals.find((p) => p.action_key === "send_message" && p.id.startsWith("cand-"));
    expect(routine?.likely_outcome).toBe("block");
    expect(routine?.blockers_or_missing_facts).toContain(STRATEGIC_TRUST_REPAIR_BLOCKER);
    expect(proposals.some((p) => p.action_family === "update_crm")).toBe(false);
  });
});

describe("proposeClientOrchestratorCandidateActions — sensitive personal document (SPD)", () => {
  it("planner passport + DOB request: operator v3_sensitive_personal_document_handling first, primary send blocked", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience({ recipientCount: 3 }),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "Daniela here — please send full passport numbers and dates of birth for the entire photo team for the venue security list.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      inboundSenderAuthority: {
        bucket: "planner",
        personId: "pl1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("v3_sensitive_personal_document_handling");
    expect(proposals[0]?.sensitive_personal_document_reason_code).toBe(
      ORCHESTRATOR_SPD_ESCALATION_REASON_CODES.sensitive_identity_document_handling_request,
    );
    const routine = proposals.find((p) => p.action_key === "send_message" && p.id.startsWith("cand-"));
    expect(routine?.likely_outcome).toBe("block");
    expect(routine?.blockers_or_missing_facts).toContain(SENSITIVE_PERSONAL_DOCUMENT_BLOCKER);
  });

  it("does not emit wire-chase side candidate when SPD (identity-document thread)", () => {
    const wf = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      payment_wire: {
        promised_at: "2026-01-01T00:00:00.000Z",
        chase_due_at: "2026-01-03T12:00:00.000Z",
      },
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 1,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Please send passport scans for the venue list by Friday.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      v3ThreadWorkflow: wf,
    });
    expect(proposals.some((p) => p.action_key === "v3_wire_chase_scheduled")).toBe(false);
    expect(proposals.some((p) => p.action_key === "v3_sensitive_personal_document_handling")).toBe(true);
  });
});

describe("proposeClientOrchestratorCandidateActions — banking / compliance exception", () => {
  it("st2-style banking: operator first, routine send blocked, BC metadata", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "My bank will not transfer to Serbia. Can you send a US dollar account instead? Or UK?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("v3_banking_compliance_exception");
    expect(proposals[0]?.banking_compliance_reason_code).toBe(
      ORCHESTRATOR_BC_ESCALATION_REASON_CODES.payment_rail_exception,
    );
    const routine = proposals.find((p) => p.action_key === "send_message" && p.id.startsWith("cand-"));
    expect(routine?.likely_outcome).toBe("block");
    expect(routine?.blockers_or_missing_facts).toContain(BANKING_COMPLIANCE_EXCEPTION_BLOCKER);
  });

  it("st8-style NDA + insurance: compliance_document_request, not NC path", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "Please sign the NDA in DocuSign and send your £10m Public Liability Insurance certificate.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("v3_banking_compliance_exception");
    expect(proposals[0]?.banking_compliance_class).toBe("compliance_document_request");
    expect(proposals[0]?.compliance_asset_library_key).toBeUndefined();
    expect(proposals[0]?.risk_class).toBeUndefined();
    const routine = proposals.find((p) => p.action_key === "send_message" && p.id.startsWith("cand-"));
    expect(routine?.likely_outcome).toBe("block");
  });

  it("insurance certificate only: compliance asset library attach + public_liability_coi metadata", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Please send your certificate of insurance before the event — venue needs it on file.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("v3_compliance_asset_library_attach");
    expect(proposals[0]?.banking_compliance_class).toBe("compliance_document_request");
    expect(proposals[0]?.compliance_asset_library_key).toBe("public_liability_coi");
    const routine = proposals.find((p) => p.action_key === "send_message" && p.id.startsWith("cand-"));
    expect(routine?.compliance_asset_library_key).toBe("public_liability_coi");
    expect(routine?.likely_outcome).toBe("block");
  });

  it("vendor portal + PL certificate: venue_security_compliance_packet + library attach action", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "Upload your £10 million public liability insurance certificate to the vendor portal before load-in.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("v3_compliance_asset_library_attach");
    expect(proposals[0]?.compliance_asset_library_key).toBe("venue_security_compliance_packet");
  });
});

describe("proposeClientOrchestratorCandidateActions — visual / attachment verification", () => {
  it("st6-style mockup: operator v3_visual_asset_verification, routine send blocked, hold is ask-only", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "Attached is the album cover mockup PDF — please confirm the spelling Karissa before we print.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("v3_visual_asset_verification");
    expect(proposals[0]?.visual_asset_verification_reason_code).toBe(
      ORCHESTRATOR_VAV_ESCALATION_REASON_CODES.layout_proof_review,
    );
    const blockedPrimary = proposals.find(
      (p) => p.action_family === "send_message" && p.action_key === "send_message" && p.likely_outcome === "block",
    );
    expect(blockedPrimary?.blockers_or_missing_facts).toContain(VISUAL_ASSET_VERIFICATION_BLOCKER);
    const hold = proposals.find((p) => p.action_key === "v3_visual_asset_verification_hold");
    expect(hold?.likely_outcome).toBe("ask");
    expect(hold?.rationale).toBe(VISUAL_ASSET_VERIFICATION_HOLD_RATIONALE);
    expect(proposals.some((p) => p.risk_class !== undefined)).toBe(false);
  });

  it("NC still applies when visual detector misses", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "The wedding day colors look fake, my hair looks yellow in the photos, and some crops feel weird.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    expect(proposals[0]?.action_key).toBe("operator_notification_routing");
    expect(proposals[0]?.risk_class).toBe("artistic_dispute");
  });
});

describe("proposeClientOrchestratorCandidateActions — identity/entity Phase 2", () => {
  it("B2B indalo: operator ie2 first, routine send blocked, clarification candidate", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "From erin@indalo.travel — Hi Danilo, following up on Dana & Matt safari package PR timelines.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
    });
    expect(proposals[0]?.action_key).toBe("v3_identity_entity_routing_ambiguity");
    expect(proposals[0]?.identity_entity_phase2_reason_code).toBe(
      ORCHESTRATOR_IE2_ESCALATION_REASON_CODES.b2b_corporate_sender,
    );
    const blocked = proposals.find(
      (p) => p.action_family === "send_message" && p.action_key === "send_message" && p.likely_outcome === "block",
    );
    expect(blocked?.blockers_or_missing_facts).toContain(IDENTITY_ENTITY_AMBIGUITY_BLOCKER);
    const clarify = proposals.find((p) => p.action_key === "v3_identity_entity_clarification");
    expect(clarify?.likely_outcome).toBe("draft");
  });

  it("B2B indalo: ingress email metadata only (no From in body) still triggers ie2", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "Hi Danilo, following up on Dana & Matt safari package PR timelines.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      inboundSenderIdentity: {
        email: "erin@indalo.travel",
        displayName: null,
        domain: "indalo.travel",
      },
    });
    expect(proposals[0]?.action_key).toBe("v3_identity_entity_routing_ambiguity");
    expect(proposals[0]?.identity_entity_phase2_reason_code).toBe(
      ORCHESTRATOR_IE2_ESCALATION_REASON_CODES.b2b_corporate_sender,
    );
  });

  it("Phase 1 two thread weddings: no IE2 branch (multi-wedding identity handles)", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage:
        "For our Cambodia wedding in April vs the Italy wedding in June, can you confirm which invoice this deposit applies to?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: ["w-a", "w-b"],
      inboundSenderAuthority: {
        bucket: "client_primary",
        personId: "p-couple",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("v3_multithread_wedding_identity");
    expect(proposals.some((p) => p.action_key === "v3_identity_entity_routing_ambiguity")).toBe(false);
  });
});

describe("proposeClientOrchestratorCandidateActions — authority policy Phase 1", () => {
  it("vendor + bulk discount: operator ap1 first, routine send blocked", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Can we get a bulk discount for 500 extra photos?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      inboundSenderAuthority: {
        bucket: "vendor",
        personId: "v1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("v3_authority_policy_risk");
    expect(proposals[0]?.authority_policy_reason_code).toBe(
      ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.commercial_terms_authority_insufficient,
    );
    const blocked = proposals.find(
      (p) => p.action_family === "send_message" && p.action_key === "send_message" && p.likely_outcome === "block",
    );
    expect(blocked?.blockers_or_missing_facts).toContain(AUTHORITY_POLICY_BLOCKER);
  });
});

describe("proposeClientOrchestratorCandidateActions — authority policy Phase 2", () => {
  const coordinationMsg =
    "Please cc accounting@example.com on this thread for the invoice copy.";

  it("planner + bulk discount: operator ap1 first (same as vendor commitment path)", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Can we get a bulk discount for 500 extra photos?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      inboundSenderAuthority: {
        bucket: "planner",
        personId: "pl1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("v3_authority_policy_risk");
    expect(proposals[0]?.authority_policy_reason_code).toBe(
      ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.commercial_terms_authority_insufficient,
    );
  });

  it("planner + invoice-routing coordination: routine send first, no ap1 commercial blocker", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: coordinationMsg,
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      inboundSenderAuthority: {
        bucket: "planner",
        personId: "pl1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("send_message");
    expect(proposals.some((p) => p.action_key === "v3_authority_policy_risk")).toBe(false);
  });

  it("Belgrade-style booking-progress follow-up: prior discount in snippet does not force AP1 clarification", () => {
    const inbound1 =
      "Hi — we're looking at Sept 12 or Sept 19 next year at Belgrade Fortress. We want a package with online gallery, second photographer, high-res downloads, and cinematic film / sound design. Could you send a brochure?";
    const studioReply =
      "Thanks for reaching out — we offer photography only (no videography). We can share trusted videographer partners when you book.";
    const inbound2 =
      "Could you share the trusted partner list? We've locked Sept 12. What are the next steps to officially book you? Are 24h sneak peeks included or extra? Is there a destination fee for Belgrade Fortress locally? Could we do a brief call Thursday?";
    const threadContextSnippet = `${inbound1}\n\n${studioReply}\n\n(Older thread line — not current turn) Can we get a bulk discount for 500 extra photos?`;

    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: inbound2,
      threadContextSnippet,
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      inboundSenderAuthority: {
        bucket: "planner",
        personId: "pl1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });

    expect(proposals[0]?.action_key).toBe("send_message");
    expect(proposals.some((p) => p.action_key === "v3_authority_policy_clarification")).toBe(false);
    expect(proposals.some((p) => p.action_key === "v3_authority_policy_risk")).toBe(false);
  });
});

describe("proposeClientOrchestratorCandidateActions — authority policy Phase 3 binding", () => {
  const bindingMsg = "On behalf of the couple, please proceed with the deposit.";

  it("planner + binding on-behalf proceed: ap1 ambiguous first", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: bindingMsg,
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      inboundSenderAuthority: {
        bucket: "planner",
        personId: "pl1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("v3_authority_policy_risk");
    expect(proposals[0]?.authority_policy_reason_code).toBe(
      ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.ambiguous_approval_authority,
    );
  });

  it("payer + same binding message: routine send first, no ap1", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: bindingMsg,
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      inboundSenderAuthority: {
        bucket: "payer",
        personId: "p1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals[0]?.action_key).toBe("send_message");
    expect(proposals.some((p) => p.action_key === "v3_authority_policy_risk")).toBe(false);
  });
});

describe("proposeClientOrchestratorCandidateActions — AP1 workflow and playbook gating", () => {
  it("does not emit wire-chase side candidate when AP1 commercial authority risk", () => {
    const wf = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      payment_wire: {
        promised_at: "2026-01-01T00:00:00.000Z",
        chase_due_at: "2026-01-03T12:00:00.000Z",
      },
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Can we get a bulk discount for 500 extra photos?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      v3ThreadWorkflow: wf,
      inboundSenderAuthority: {
        bucket: "vendor",
        personId: "v1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals.some((p) => p.action_key === "v3_authority_policy_risk")).toBe(true);
    expect(proposals.some((p) => p.action_key === "v3_wire_chase_scheduled")).toBe(false);
  });

  it("does not emit wire-chase side candidate when CCM (client high-magnitude concession)", () => {
    const wf = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      payment_wire: {
        promised_at: "2026-01-01T00:00:00.000Z",
        chase_due_at: "2026-01-03T12:00:00.000Z",
      },
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Please reduce the price to €10,000 — I cannot approve €12,000.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      v3ThreadWorkflow: wf,
      inboundSenderAuthority: {
        bucket: "client_primary",
        personId: "c1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals.some((p) => p.action_key === "v3_high_magnitude_client_concession")).toBe(true);
    expect(proposals.some((p) => p.action_key === "v3_wire_chase_scheduled")).toBe(false);
  });

  it("blocks playbook send_message when AP1 authority risk (align with BC/VAC pattern)", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [
        {
          id: "rule-ap1-gate",
          topic: "tone",
          channel: "email",
          instruction: "Be warm",
          action_key: "send_message",
          decision_mode: "draft_only",
          is_active: true,
        },
      ],
      selectedMemoriesCount: 1,
      globalKnowledgeCount: 1,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Can we get a bulk discount for 500 extra photos?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      candidateWeddingIds: [],
      inboundSenderAuthority: {
        bucket: "vendor",
        personId: "v1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    const pb = proposals.find((p) => p.playbook_rule_ids?.includes("rule-ap1-gate"));
    expect(pb?.action_family).toBe("send_message");
    expect(pb?.likely_outcome).toBe("block");
    expect(pb?.blockers_or_missing_facts).toContain(AUTHORITY_POLICY_BLOCKER);
  });

  it("does not emit stalled-inquiry nudge when AP1 commercial authority risk", () => {
    const wf = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      stalled_inquiry: {
        client_marked_at: "2026-01-01T00:00:00.000Z",
        nudge_due_at: "2026-01-05T00:00:00.000Z",
      },
    });
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience(),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Can we get a bulk discount for 500 extra photos?",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
      v3ThreadWorkflow: wf,
      inboundSenderAuthority: {
        bucket: "vendor",
        personId: "v1",
        isApprovalContact: false,
        source: "thread_sender",
      },
    });
    expect(proposals.some((p) => p.action_key === "v3_authority_policy_risk")).toBe(true);
    expect(proposals.some((p) => p.action_key === "v3_stalled_inquiry_nudge_scheduled")).toBe(false);
  });
});

describe("proposeClientOrchestratorCandidateActions \u2014 inbound suppression guard", () => {
  it("blocks send_message and surfaces operator routing when inbound is promotional", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience({
        broadcastRisk: "high",
        inboundSuppression: {
          verdict: "promotional_or_marketing",
          suppressed: true,
          reasons: [
            "sender_domain_ota_or_marketplace",
            "body_ota_promo_copy",
            "body_unsubscribe_language",
          ],
          confidence: "high",
          normalizedSenderEmail: "email.campaign@sg.booking.com",
          normalizedSenderDomain: "sg.booking.com",
        },
      }),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "30% off selected stays — book your next getaway now.",
      requestedExecutionMode: "auto",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });

    const send = proposals.find(
      (p) => p.action_family === "send_message" && p.action_key === "send_message",
    );
    expect(send?.likely_outcome).toBe("block");
    expect(
      send?.blockers_or_missing_facts.some((b) =>
        b.startsWith("inbound_suppressed_non_client:promotional_or_marketing"),
      ),
    ).toBe(true);
    expect(
      proposals.some((p) => p.action_family === "operator_notification_routing"),
    ).toBe(true);
  });

  it("does not block send_message when inboundSuppression is absent or not suppressed", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience({
        inboundSuppression: {
          verdict: "human_client_or_lead",
          suppressed: false,
          reasons: [],
          confidence: "medium",
          normalizedSenderEmail: "sarah@gmail.com",
          normalizedSenderDomain: "gmail.com",
        },
      }),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Hi, checking availability for our October wedding.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });

    const send = proposals.find(
      (p) => p.action_family === "send_message" && p.action_key === "send_message",
    );
    expect(send?.likely_outcome).toBe("draft");
    expect(
      send?.blockers_or_missing_facts.some((b) =>
        b.startsWith("inbound_suppressed_non_client"),
      ),
    ).toBe(false);
  });

  it("still blocks send_message in draft_only mode when suppression fires", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience({
        broadcastRisk: "high",
        inboundSuppression: {
          verdict: "system_or_notification",
          suppressed: true,
          reasons: ["sender_local_system_token", "body_do_not_reply_language"],
          confidence: "high",
          normalizedSenderEmail: "noreply@notifications.example.com",
          normalizedSenderDomain: "notifications.example.com",
        },
      }),
      playbookRules: [],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Your weekly report is ready. Do not reply to this email.",
      requestedExecutionMode: "draft_only",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });

    const send = proposals.find(
      (p) => p.action_family === "send_message" && p.action_key === "send_message",
    );
    expect(send?.likely_outcome).toBe("block");
    expect(
      send?.blockers_or_missing_facts.some((b) =>
        b.startsWith("inbound_suppressed_non_client:system_or_notification"),
      ),
    ).toBe(true);
  });

  /**
   * Issue #4 from the Booking.com follow-up review: even after the generic
   * `send_message` proposal began honoring inbound suppression, a tenant
   * playbook rule with `action_key: send_message` could still emit a
   * draftable proposal — the playbook branch did not include the
   * `inboundSuppressed` gate. These tests lock that closed.
   */
  it("forces playbook send_message proposals to block when inbound suppression fires", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience({
        broadcastRisk: "high",
        inboundSuppression: {
          verdict: "promotional_or_marketing",
          suppressed: true,
          reasons: ["sender_domain_ota_or_marketplace", "body_unsubscribe_language"],
          confidence: "high",
          normalizedSenderEmail: "email.campaign@sg.booking.com",
          normalizedSenderDomain: "sg.booking.com",
        },
      }),
      playbookRules: [
        {
          id: "rule-promo-still-replies-1234",
          topic: "general_followup",
          channel: "email",
          action_key: "send_message",
          decision_mode: "draft_only",
          instruction: "Send a short polite follow-up if the inbound mentions getaway or stay.",
          is_active: true,
          // deno-lint-ignore no-explicit-any
        } as any,
      ],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "30% off selected stays — book your next getaway now.",
      requestedExecutionMode: "auto",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });

    const playbookProposals = proposals.filter((p) => p.id.startsWith("cand-") && p.id.includes("-pb-"));
    const playbookSend = playbookProposals.find((p) => p.action_family === "send_message");
    expect(playbookSend).toBeTruthy();
    expect(playbookSend?.likely_outcome).toBe("block");
    expect(
      playbookSend?.blockers_or_missing_facts.some((b) =>
        b.startsWith("inbound_suppressed_non_client:promotional_or_marketing"),
      ),
    ).toBe(true);
  });

  it("does NOT force playbook send_message to block when no suppression fires", () => {
    const proposals = proposeClientOrchestratorCandidateActions({
      audience: baseAudience({}),
      playbookRules: [
        {
          id: "rule-clean-followup-1234",
          topic: "general_followup",
          channel: "email",
          action_key: "send_message",
          decision_mode: "draft_only",
          instruction: "Send a short polite follow-up.",
          is_active: true,
          // deno-lint-ignore no-explicit-any
        } as any,
      ],
      selectedMemoriesCount: 0,
      globalKnowledgeCount: 0,
      escalationOpenCount: 0,
      weddingId: "w1",
      threadId: "t1",
      replyChannel: "email",
      rawMessage: "Thanks — looking forward to it.",
      requestedExecutionMode: "auto",
      threadDraftsSummary: null,
      weddingCrmParityHints: null,
    });
    const playbookProposals = proposals.filter((p) => p.id.startsWith("cand-") && p.id.includes("-pb-"));
    const playbookSend = playbookProposals.find((p) => p.action_family === "send_message");
    expect(playbookSend?.likely_outcome).not.toBe("block");
    expect(
      playbookSend?.blockers_or_missing_facts.some((b) =>
        b.startsWith("inbound_suppressed_non_client"),
      ) ?? false,
    ).toBe(false);
  });
});
