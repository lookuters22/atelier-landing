import { describe, expect, it } from "vitest";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import {
  applyCustomerLeadProjectPromotionUpgrade,
  evaluateNonWeddingBusinessInquiryPolicy,
  NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
  nonWeddingInquiryActionKeyForIntent,
  resolveNonWeddingBusinessInquiryPolicyWithProfile,
  resolveSenderRoleLeadingGate,
} from "./nonWeddingBusinessInquiryPolicy.ts";

function rule(over: Partial<PlaybookRuleContextRow>): PlaybookRuleContextRow {
  return {
    id: "rule-default",
    action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
    topic: "non_wedding_inquiry",
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction: "Reply politely explaining we only cover weddings.",
    source_type: "manual",
    confidence_label: "explicit",
    is_active: true,
    ...over,
  };
}

describe("evaluateNonWeddingBusinessInquiryPolicy", () => {
  it("returns unclear_operator_review when no matching rule exists (no profile row → ambiguous fit)", () => {
    const out = evaluateNonWeddingBusinessInquiryPolicy([], "commercial", "email");
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PROFILE_AMBIGUOUS_NO_PLAYBOOK_ESCALATE");
    expect(out.matchedRule).toBeNull();
    expect(out.decisionSource).toBe("profile_ambiguous_escalate");
  });

  it("uses the intent-specific rule over the baseline when both exist", () => {
    const rules = [
      rule({
        id: "baseline",
        action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
        decision_mode: "forbidden",
      }),
      rule({
        id: "commercial-specific",
        action_key: nonWeddingInquiryActionKeyForIntent("commercial"),
        decision_mode: "draft_only",
        instruction: "Offer portrait pricing sheet.",
      }),
    ];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "commercial", "email");
    expect(out.decision).toBe("allowed_draft");
    expect(out.matchedRule?.id).toBe("commercial-specific");
    expect(out.matchedActionKey).toBe("non_wedding_inquiry_commercial");
    expect(out.instruction).toBe("Offer portrait pricing sheet.");
  });

  it("falls back to baseline when no intent-specific rule is present (no profile → ambiguous; auto downgrades to draft)", () => {
    const rules = [
      rule({
        id: "baseline",
        action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
        decision_mode: "auto",
      }),
    ];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "logistics", "email");
    expect(out.decision).toBe("allowed_draft");
    expect(out.matchedActionKey).toBe(NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE);
    expect(out.reasonCode).toBe("PROFILE_AMBIGUOUS_PLAYBOOK_AUTO_DOWNGRADED_TO_DRAFT");
    expect(out.decisionSource).toBe("profile_ambiguous_playbook_auto_downgraded");
  });

  it("maps decision_mode=forbidden to disallowed_decline", () => {
    const rules = [rule({ decision_mode: "forbidden" })];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "commercial", "email");
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PLAYBOOK_FORBIDDEN_DECLINE");
  });

  it("maps decision_mode=ask_first to unclear_operator_review", () => {
    const rules = [rule({ decision_mode: "ask_first" })];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "commercial", "email");
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PLAYBOOK_ASK_FIRST_ESCALATE");
    expect(out.matchedRule).not.toBeNull();
  });

  it("ignores inactive rules", () => {
    const rules = [rule({ decision_mode: "auto", is_active: false })];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "commercial", "email");
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PROFILE_AMBIGUOUS_NO_PLAYBOOK_ESCALATE");
  });

  it("channel-scoped rule for the current channel beats a global rule with the same action_key", () => {
    const rules = [
      rule({
        id: "global",
        action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
        scope: "global",
        channel: null,
        decision_mode: "forbidden",
      }),
      rule({
        id: "email-specific",
        action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
        scope: "channel",
        channel: "email",
        decision_mode: "draft_only",
        instruction: "Email-specific: reply briefly.",
      }),
    ];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "commercial", "email");
    expect(out.matchedRule?.id).toBe("email-specific");
    expect(out.decision).toBe("allowed_draft");
  });

  it("ignores a channel-scoped rule whose channel does not match, falls back to global", () => {
    const rules = [
      rule({
        id: "global",
        action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
        scope: "global",
        channel: null,
        decision_mode: "forbidden",
      }),
      rule({
        id: "web-specific",
        action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
        scope: "channel",
        channel: "web",
        decision_mode: "auto",
      }),
    ];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "commercial", "email");
    expect(out.matchedRule?.id).toBe("global");
    expect(out.decision).toBe("disallowed_decline");
  });

  it("intent-specific global rule beats a baseline channel-scoped rule (intent > baseline); no profile → auto downgrades", () => {
    const rules = [
      rule({
        id: "baseline-email",
        action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
        scope: "channel",
        channel: "email",
        decision_mode: "forbidden",
      }),
      rule({
        id: "commercial-global",
        action_key: nonWeddingInquiryActionKeyForIntent("commercial"),
        scope: "global",
        channel: null,
        decision_mode: "auto",
      }),
    ];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "commercial", "email");
    expect(out.matchedRule?.id).toBe("commercial-global");
    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PROFILE_AMBIGUOUS_PLAYBOOK_AUTO_DOWNGRADED_TO_DRAFT");
  });

  it("clear profile fit + playbook auto preserves allowed_auto", () => {
    const rules = [
      rule({
        id: "commercial-global",
        action_key: nonWeddingInquiryActionKeyForIntent("commercial"),
        scope: "global",
        channel: null,
        decision_mode: "auto",
        instruction: "Auto blurb.",
      }),
    ];
    const fitCommercial = {
      ...profileFitNonWedding,
      core_services: ["photo", "content_creation"],
      service_types: ["weddings"],
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      rules,
      fitCommercial,
      "commercial",
      "email",
    );
    expect(out.decision).toBe("allowed_auto");
    expect(out.reasonCode).toBe("PLAYBOOK_AUTO_REPLY");
  });
});

const leadDeclineBoth = {
  schema_version: 2,
  when_service_not_offered: "decline_politely" as const,
  when_geography_not_in_scope: "decline_politely" as const,
};

const profileWeddingOnly = {
  core_services: ["photo"],
  service_types: ["weddings", "elopements"],
  geographic_scope: { schema_version: 2, mode: "domestic" },
  travel_policy: { schema_version: 2, mode: "travels_freely" },
  lead_acceptance_rules: leadDeclineBoth,
};

const profileFitNonWedding = {
  core_services: ["photo"],
  service_types: ["weddings", "portraiture"],
  geographic_scope: { schema_version: 2, mode: "domestic" },
  travel_policy: { schema_version: 2, mode: "travels_freely" },
  lead_acceptance_rules: leadDeclineBoth,
};

/** Portraiture-capacity + local/no-travel geo unfit; used with varying geo lead rules. */
const profileGeoUnfitPortraiture = {
  core_services: ["photo"],
  service_types: ["portraiture"],
  geographic_scope: { schema_version: 2, mode: "local_only" },
  travel_policy: { schema_version: 2, mode: "no_travel" },
  lead_acceptance_rules: leadDeclineBoth,
};

describe("resolveNonWeddingBusinessInquiryPolicyWithProfile", () => {
  it("profile unfit + no playbook rule → decline", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileWeddingOnly,
      "concierge",
      "email",
    );
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PROFILE_UNFIT_DECLINE");
    expect(out.decisionSource).toBe("profile_unfit");
  });

  it("profile unfit + stale auto playbook → profile overrides", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "auto", instruction: "Send brochure." })],
      profileWeddingOnly,
      "concierge",
      "email",
    );
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PROFILE_UNFIT_OVERRIDES_PLAYBOOK");
    expect(out.decisionSource).toBe("profile_unfit_overrides_playbook");
  });

  it("profile fit + no playbook rule → allowed_draft fallback (never auto)", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileFitNonWedding,
      "concierge",
      "email",
    );
    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PROFILE_FIT_FALLBACK_DRAFT");
    expect(out.decisionSource).toBe("profile_derived_fallback");
    expect(out.matchedActionKey).toBe("non_wedding_inquiry_reply");
  });

  it("profile fit + no playbook rule + commercial dispatch → operator review (no profile fallback draft)", () => {
    const profileCommercialClearFit = {
      ...profileFitNonWedding,
      core_services: ["photo", "content_creation"],
      service_types: ["weddings"],
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileCommercialClearFit,
      "commercial",
      "email",
    );
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("COMMERCIAL_UNLINKED_REQUIRES_OPERATOR_DISAMBIGUATION");
    expect(out.decisionSource).toBe("commercial_unlinked_operator_review");
    expect(out.matchedRule).toBeNull();
    expect(out.matchedActionKey).toBeNull();
    expect(out.instruction).toBe("");
  });

  it("profile fit + draft_only rule → playbook wins", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "draft_only", instruction: "Use studio tone." })],
      profileFitNonWedding,
      "commercial",
      "email",
    );
    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PLAYBOOK_DRAFT_FOR_REVIEW");
    expect(out.instruction).toBe("Use studio tone.");
  });

  it("profile fit + forbidden rule → playbook wins decline", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "forbidden", instruction: "No brand work." })],
      profileFitNonWedding,
      "commercial",
      "email",
    );
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PLAYBOOK_FORBIDDEN_DECLINE");
  });

  it("profile ambiguous + no rule → escalate", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      null,
      "studio",
      "email",
    );
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PROFILE_AMBIGUOUS_NO_PLAYBOOK_ESCALATE");
  });

  it("profile ambiguous + auto rule → downgrades to allowed_draft", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "auto", instruction: "Quick reply." })],
      null,
      "commercial",
      "email",
    );
    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PROFILE_AMBIGUOUS_PLAYBOOK_AUTO_DOWNGRADED_TO_DRAFT");
    expect(out.decisionSource).toBe("profile_ambiguous_playbook_auto_downgraded");
  });

  it("playbook onboarding_default source is tagged", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [
        rule({
          source_type: "onboarding_briefing_v1",
          decision_mode: "draft_only",
        }),
      ],
      profileFitNonWedding,
      "concierge",
      "email",
    );
    expect(out.decisionSource).toBe("playbook_onboarding_default");
  });

  it("service OOS + route_to_operator + no playbook → operator review, not decline", () => {
    const profile = {
      ...profileWeddingOnly,
      lead_acceptance_rules: {
        schema_version: 2,
        when_service_not_offered: "route_to_operator",
        when_geography_not_in_scope: "decline_politely",
      },
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile([], profile, "concierge", "email");
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PROFILE_OOS_LEAD_ACCEPTANCE_OPERATOR_REVIEW");
    expect(out.decisionSource).toBe("profile_oos_lead_operator_review");
    expect(out.profileFit).toBe("operator_review");
  });

  it("geo OOS + decline + no playbook → decline", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileGeoUnfitPortraiture,
      "concierge",
      "email",
    );
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PROFILE_UNFIT_DECLINE");
  });

  it("geo OOS + escalate + no playbook → operator review", () => {
    const profile = {
      ...profileGeoUnfitPortraiture,
      lead_acceptance_rules: {
        schema_version: 2,
        when_service_not_offered: "decline_politely",
        when_geography_not_in_scope: "escalate",
      },
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile([], profile, "concierge", "email");
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PROFILE_OOS_LEAD_ACCEPTANCE_OPERATOR_REVIEW");
  });

  it("service OOS + decline + stale auto playbook → still decline", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "auto", instruction: "Send brochure." })],
      profileWeddingOnly,
      "concierge",
      "email",
    );
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PROFILE_UNFIT_OVERRIDES_PLAYBOOK");
  });

  it("service OOS + route_to_operator + stale auto playbook → operator review (no auto)", () => {
    const profile = {
      ...profileWeddingOnly,
      lead_acceptance_rules: {
        schema_version: 2,
        when_service_not_offered: "route_to_operator",
        when_geography_not_in_scope: "decline_politely",
      },
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "auto", instruction: "Send brochure." })],
      profile,
      "concierge",
      "email",
    );
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PROFILE_OOS_LEAD_ACCEPTANCE_OPERATOR_REVIEW");
  });

  it("operator_review + forbidden playbook → playbook decline wins", () => {
    const profile = {
      ...profileWeddingOnly,
      lead_acceptance_rules: {
        schema_version: 2,
        when_service_not_offered: "route_to_operator",
        when_geography_not_in_scope: "decline_politely",
      },
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "forbidden", instruction: "Hard no." })],
      profile,
      "concierge",
      "email",
    );
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PLAYBOOK_FORBIDDEN_DECLINE");
  });

  it("sender-role gate: vendor_solicitation + commercial + fit + no rule → vendor operator review (not commercial disambiguation)", () => {
    const profileCommercialClearFit = {
      ...profileFitNonWedding,
      core_services: ["photo", "content_creation"],
      service_types: ["weddings"],
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileCommercialClearFit,
      "commercial",
      "email",
      { role: "vendor_solicitation", confidence: "high", reason: "Cold pitch" },
    );
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("SENDER_ROLE_VENDOR_SOLICITATION_OPERATOR_REVIEW");
    expect(out.decisionSource).toBe("sender_role_vendor_operator_review");
  });

  it("sender-role gate: billing_or_account_followup + medium → billing operator review", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileFitNonWedding,
      "concierge",
      "email",
      { role: "billing_or_account_followup", confidence: "medium" },
    );
    expect(out.reasonCode).toBe("SENDER_ROLE_BILLING_FOLLOWUP_LINK_WEDDING");
    expect(out.decisionSource).toBe("sender_role_billing_operator_review");
  });

  it("customer_lead + concierge + fit + no rule → existing profile fallback draft", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileFitNonWedding,
      "concierge",
      "email",
      { role: "customer_lead", confidence: "high" },
    );
    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PROFILE_FIT_FALLBACK_DRAFT");
  });

  it("customer_lead + commercial + fit + no rule → commercial disambiguation still applies", () => {
    const profileCommercialClearFit = {
      ...profileFitNonWedding,
      core_services: ["photo", "content_creation"],
      service_types: ["weddings"],
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileCommercialClearFit,
      "commercial",
      "email",
      { role: "customer_lead", confidence: "high" },
    );
    expect(out.reasonCode).toBe("COMMERCIAL_UNLINKED_REQUIRES_OPERATOR_DISAMBIGUATION");
    expect(out.decisionSource).toBe("commercial_unlinked_operator_review");
  });

  it("unclear sender-role → existing logic unchanged", () => {
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileFitNonWedding,
      "concierge",
      "email",
      { role: "unclear", confidence: "low" },
    );
    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PROFILE_FIT_FALLBACK_DRAFT");
  });

  it("low-confidence vendor → falls through like unclear (no gate)", () => {
    const profileCommercialClearFit = {
      ...profileFitNonWedding,
      core_services: ["photo", "content_creation"],
      service_types: ["weddings"],
    };
    const out = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileCommercialClearFit,
      "commercial",
      "email",
      { role: "vendor_solicitation", confidence: "low" },
    );
    expect(out.reasonCode).toBe("COMMERCIAL_UNLINKED_REQUIRES_OPERATOR_DISAMBIGUATION");
  });
});

describe("applyCustomerLeadProjectPromotionUpgrade", () => {
  it("upgrades allowed_draft when sender is a confident customer lead and profile fit", () => {
    const base = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "draft_only" })],
      profileFitNonWedding,
      "concierge",
      "email",
      null,
    );
    expect(base.decision).toBe("allowed_draft");
    const out = applyCustomerLeadProjectPromotionUpgrade(base, {
      role: "customer_lead",
      confidence: "high",
    });
    expect(out.decision).toBe("allowed_promote_to_project");
    expect(out.reasonCode).toBe("CUSTOMER_LEAD_PROMOTE_TO_PROJECT");
    expect(out.decisionSource).toBe("customer_lead_promote_to_project");
  });

  it("does not upgrade commercial unlinked operator review", () => {
    const profileCommercialClearFit = {
      ...profileFitNonWedding,
      core_services: ["photo", "content_creation"],
      service_types: ["weddings"],
    };
    const base = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [],
      profileCommercialClearFit,
      "commercial",
      "email",
      { role: "customer_lead", confidence: "high" },
    );
    expect(base.decision).toBe("unclear_operator_review");
    const out = applyCustomerLeadProjectPromotionUpgrade(base, {
      role: "customer_lead",
      confidence: "high",
    });
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("COMMERCIAL_UNLINKED_REQUIRES_OPERATOR_DISAMBIGUATION");
  });

  it("does not upgrade unclear_operator_review (e.g. ask_first)", () => {
    const base = resolveNonWeddingBusinessInquiryPolicyWithProfile(
      [rule({ decision_mode: "ask_first" })],
      profileFitNonWedding,
      "concierge",
      "email",
      null,
    );
    expect(base.decision).toBe("unclear_operator_review");
    const out = applyCustomerLeadProjectPromotionUpgrade(base, {
      role: "customer_lead",
      confidence: "high",
    });
    expect(out.decision).toBe("unclear_operator_review");
  });
});

describe("resolveSenderRoleLeadingGate", () => {
  it("returns null for customer_lead", () => {
    expect(resolveSenderRoleLeadingGate({ role: "customer_lead", confidence: "high" })).toBeNull();
  });
  it("returns null for low-confidence vendor", () => {
    expect(
      resolveSenderRoleLeadingGate({ role: "vendor_solicitation", confidence: "low" }),
    ).toBeNull();
  });
});
