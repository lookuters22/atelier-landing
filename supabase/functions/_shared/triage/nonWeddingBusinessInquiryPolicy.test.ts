import { describe, expect, it } from "vitest";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import {
  evaluateNonWeddingBusinessInquiryPolicy,
  NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
  nonWeddingInquiryActionKeyForIntent,
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
  it("returns unclear_operator_review when no matching rule exists", () => {
    const out = evaluateNonWeddingBusinessInquiryPolicy([], "commercial", "email");
    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PLAYBOOK_NO_RULE_ESCALATE");
    expect(out.matchedRule).toBeNull();
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

  it("falls back to baseline when no intent-specific rule is present", () => {
    const rules = [
      rule({
        id: "baseline",
        action_key: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
        decision_mode: "auto",
      }),
    ];
    const out = evaluateNonWeddingBusinessInquiryPolicy(rules, "logistics", "email");
    expect(out.decision).toBe("allowed_auto");
    expect(out.matchedActionKey).toBe(NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE);
    expect(out.reasonCode).toBe("PLAYBOOK_AUTO_REPLY");
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
    expect(out.reasonCode).toBe("PLAYBOOK_NO_RULE_ESCALATE");
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

  it("intent-specific global rule beats a baseline channel-scoped rule (intent > baseline)", () => {
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
    expect(out.decision).toBe("allowed_auto");
  });
});
