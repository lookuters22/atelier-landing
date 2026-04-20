/**
 * Grounding + voice facts assembly for the persona writer (Lake Como–style inquiry regression shape).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../inngest.ts", () => ({
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION: 1,
  inngest: { send: vi.fn().mockResolvedValue(undefined), setEnvVars: vi.fn() },
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT: "operator/escalation.pending_delivery.v1",
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION: 1,
}));
import type { DecisionContext, OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import { PERSONA_WRITER_CONTINUITY_RECENT_COUNT } from "../memory/buildPersonaRawFacts.ts";
import {
  buildOrchestratorFactsForPersonaWriter,
  PERSONA_FACTS_UNVERIFIED_CLAIMS_SECTION_TITLE,
} from "./maybeRewriteOrchestratorDraftWithPersona.ts";
import { buildInquiryClaimPermissions, INQUIRY_CLAIM_PERMISSIONS_SECTION_TITLE } from "./buildInquiryClaimPermissions.ts";
import {
  deriveInquiryReplyPlan,
  INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER,
  INQUIRY_REPLY_STRATEGY_SECTION_TITLE,
} from "./deriveInquiryReplyPlan.ts";
import { PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER } from "../prompts/personaNoCallPushRealization.ts";
import type { BudgetStatementInjectionPlan } from "./budgetStatementInjection.ts";

const minimalSendMessageCandidate: OrchestratorProposalCandidate = {
  id: "00000000-0000-0000-0000-000000000099",
  action_family: "send_message",
  action_key: "send_message",
  rationale: "Draft a client-appropriate reply.",
  verifier_gating_required: false,
  likely_outcome: "draft",
  blockers_or_missing_facts: [],
};

function baseDc(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    crmSnapshot: emptyCrmSnapshot(),
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
    inquiryFirstStepStyle: "proactive_call",
    ...overrides,
  } as DecisionContext;
}

describe("buildOrchestratorFactsForPersonaWriter — grounding + continuity + briefing_voice", () => {
  it("includes unverified-claims policy and sparse-playbook marker (no false certainty without CRM/playbook)", () => {
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      "Can you weave analog coverage from the start?",
      [],
      null,
      baseDc(),
      { mode: "none" },
      null,
    );
    expect(facts).toContain(PERSONA_FACTS_UNVERIFIED_CLAIMS_SECTION_TITLE);
    expect(facts).toContain("No false certainty");
    expect(facts).toContain("Thread continuity and the client's own words are **not** enough");
    expect(facts).toContain("=== Verified policy: playbook_rules (none in snapshot) ===");
  });

  it("preserves Lake Como–style thread memory in Continuity without conflating it with verified policy", () => {
    const threadSummary =
      "Couple wants editorial intimate Lake Como destination wedding; discussed film and proposal flow.";
    const recentMessages = [
      { direction: "in", body: "We love an editorial intimate feel — Lake Como, destination." },
      { direction: "out", body: "Thanks — noted the direction and location." },
      {
        direction: "in",
        body:
          "On film: we'd love analog woven in from the start. No instant film / Polaroid — just analog. " +
          "How do you usually shape proposals for something like this?",
      },
    ];
    const lastInbound =
      "On film: we'd love analog woven in from the start. No instant film / Polaroid — just analog. " +
      "How do you usually shape proposals for something like this?";
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      lastInbound,
      [],
      null,
      baseDc({ threadSummary, recentMessages }),
      { mode: "none" },
      null,
    );
    expect(facts).toContain("=== Continuity (thread memory + recent turns — context only) ===");
    expect(facts).toContain("Lake Como");
    expect(facts).toContain("No instant film");
    expect(facts).toContain("analog");
    expect(facts).toMatch(/Recent transcript \(last \d+ message\(s\), oldest → newest\):/);
    const transcriptIdx = facts.indexOf("Recent transcript");
    expect(transcriptIdx).toBeGreaterThan(-1);
    expect(facts.slice(transcriptIdx)).toContain("proposal");
    expect(facts.indexOf("=== Continuity")).toBeLessThan(facts.indexOf("=== Verified policy:"));
    expect(facts).toMatch(new RegExp(`last ${PERSONA_WRITER_CONTINUITY_RECENT_COUNT} message`));
  });

  it("injects briefing_voice_v1 excerpt from globalKnowledge as tone-only (not policy)", () => {
    const dc = baseDc({
      globalKnowledge: [
        {
          document_type: "briefing_voice_v1",
          content: "Warm, direct sentences. Avoid stock luxury filler. Sign as Ana.",
        },
      ],
    });
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      "Hello",
      [],
      null,
      dc,
      { mode: "none" },
      null,
    );
    expect(facts).toContain("=== Studio voice (onboarding briefing_voice_v1 — phrasing & tone only) ===");
    expect(facts).toContain("**Precedence:**");
    expect(facts).toContain("ANA_OPERATOR_VOICE_PRECEDENCE.md");
    expect(facts).toContain("Avoid stock luxury filler");
    expect(facts).toContain("not** verified commercial policy");
  });

  it("includes first studio reply intro hint on cold inquiry when inquiry plan is set", () => {
    const raw =
      "Hi — we're planning a destination wedding in 2027 and love your work. Could we chat about coverage? [c]";
    const inquiryDc = baseDc({
      crmSnapshot: { ...emptyCrmSnapshot(), stage: "inquiry" },
    });
    const plan = deriveInquiryReplyPlan({
      decisionContext: inquiryDc,
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: { mode: "none" } as BudgetStatementInjectionPlan,
    });
    expect(plan).not.toBeNull();
    const dcFirst = baseDc({
      crmSnapshot: { ...emptyCrmSnapshot(), stage: "inquiry" },
      recentMessages: [{ direction: "in", body: raw }],
    });
    const claimPerms = buildInquiryClaimPermissions({
      decisionContext: dcFirst,
      playbookRules: [],
      inquiryReplyPlan: plan!,
      rawMessage: raw,
    });
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      raw,
      [],
      "studio_name: Studio Krushka",
      dcFirst,
      { mode: "none" },
      plan,
      claimPerms,
    );
    expect(facts).toContain("=== First studio reply on this thread (inquiry) ===");
    expect(facts).toContain(INQUIRY_CLAIM_PERMISSIONS_SECTION_TITLE);
    expect(facts).toContain("booking_next_step:");
    expect(facts).toContain("my name is Ana");
    expect(facts).toContain("client manager");
  });

  it("omits first studio intro hint when a prior Studio message exists", () => {
    const raw = "Thanks — are you available for June 2027? [c]";
    const inquiryDc = baseDc({
      crmSnapshot: { ...emptyCrmSnapshot(), stage: "inquiry" },
    });
    const plan = deriveInquiryReplyPlan({
      decisionContext: inquiryDc,
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: { mode: "none" } as BudgetStatementInjectionPlan,
    });
    expect(plan).not.toBeNull();
    const dcLater = baseDc({
      crmSnapshot: { ...emptyCrmSnapshot(), stage: "inquiry" },
      recentMessages: [
        { direction: "in", body: "Hello" },
        { direction: "out", body: "Hi — Ana here, thanks for writing." },
        { direction: "in", body: raw },
      ],
    });
    const claimPerms = buildInquiryClaimPermissions({
      decisionContext: dcLater,
      playbookRules: [],
      inquiryReplyPlan: plan!,
      rawMessage: raw,
    });
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      raw,
      [],
      null,
      dcLater,
      { mode: "none" },
      plan,
      claimPerms,
    );
    expect(facts).not.toContain("=== First studio reply on this thread (inquiry) ===");
    expect(facts).toContain(INQUIRY_CLAIM_PERMISSIONS_SECTION_TITLE);
  });

  it("injects claim permissions alongside Continuity on inquiry threads (memory + contract coexist)", () => {
    const threadSummary =
      "Couple wants editorial Lake Como destination wedding; analog only, no instant film.";
    const recentMessages = [
      { direction: "in", body: "We prefer analog only — no instant film." },
      { direction: "out", body: "Thanks — noted analog only." },
    ];
    const raw = "Following up — still love your portfolio. [c]";
    const dc = baseDc({
      crmSnapshot: { ...emptyCrmSnapshot(), stage: "inquiry" },
      threadSummary,
      recentMessages,
    });
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc,
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: { mode: "none" } as BudgetStatementInjectionPlan,
    })!;
    const claimPerms = buildInquiryClaimPermissions({
      decisionContext: dc,
      playbookRules: [],
      inquiryReplyPlan: plan,
      rawMessage: raw,
    });
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      raw,
      [],
      null,
      dc,
      { mode: "none" },
      plan,
      claimPerms,
    );
    expect(facts).toContain("=== Continuity (thread memory + recent turns — context only) ===");
    expect(facts).toContain("Lake Como");
    expect(facts).toContain(INQUIRY_CLAIM_PERMISSIONS_SECTION_TITLE);
    expect(facts.indexOf(INQUIRY_REPLY_STRATEGY_SECTION_TITLE)).toBeLessThan(
      facts.indexOf(INQUIRY_CLAIM_PERMISSIONS_SECTION_TITLE),
    );
    expect(facts.indexOf(INQUIRY_CLAIM_PERMISSIONS_SECTION_TITLE)).toBeLessThan(facts.indexOf("=== Continuity"));
  });

  it("does not inject Studio voice block when briefing_voice_v1 is absent", () => {
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      "Hello",
      [],
      null,
      baseDc({ globalKnowledge: [] }),
      { mode: "none" },
      null,
    );
    expect(facts).not.toContain("briefing_voice_v1");
  });

  it("first-touch no_call_push surfaces email-first strategy facts (no direct call marker)", () => {
    const raw = "Hi — love your work for our 2027 wedding. [c]";
    const dc = baseDc({
      crmSnapshot: { ...emptyCrmSnapshot(), stage: "inquiry" },
      inquiryFirstStepStyle: "no_call_push",
      recentMessages: [{ direction: "in", body: raw }],
    });
    const plan = deriveInquiryReplyPlan({
      decisionContext: dc,
      rawMessage: raw,
      playbookRules: [],
      budgetPlan: { mode: "none" },
    })!;
    const facts = buildOrchestratorFactsForPersonaWriter(
      minimalSendMessageCandidate,
      raw,
      [],
      null,
      dc,
      { mode: "none" },
      plan,
      buildInquiryClaimPermissions({
        decisionContext: dc,
        playbookRules: [],
        inquiryReplyPlan: plan,
        rawMessage: raw,
      }),
    );
    expect(facts).toContain("cta_intensity: none");
    expect(facts).toContain(INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER);
    expect(facts).toContain(PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER);
    expect(facts).not.toContain("cta_intensity_none — email-first");
    expect(facts).not.toContain("inquiry_turn: consultation_first_cta_call");
  });
});
