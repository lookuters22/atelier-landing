/**
 * Persona writer boundary — numeric commercial policy guardrails (no-playbook / ungrounded %).
 */
import { describe, expect, it } from "vitest";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import { buildUnknownPolicySignals } from "./commercialPolicySignals.ts";

const commercialHarnessInbound =
  "Thanks, this helps. We're leaning toward the Elite collection — can you confirm the deposit is 30% to hold the date, " +
  "and that travel for the engagement session within 50 miles of Florence is included? We can pay the deposit this week.";

function rule(partial: Partial<PlaybookRuleContextRow> & Pick<PlaybookRuleContextRow, "instruction">): PlaybookRuleContextRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    action_key: "send_message",
    topic: partial.topic ?? "commercial_deposit_retainer",
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction: partial.instruction,
    source_type: "test",
    confidence_label: "explicit",
    is_active: true,
    ...partial,
  };
}

describe("buildUnknownPolicySignals — numeric commercial grounding", () => {
  it("CRM-only / no playbook: emits no-playbook lockdown plus deposit and travel unknowns", () => {
    const sig = buildUnknownPolicySignals([], commercialHarnessInbound);
    expect(sig.some((s) => s.includes("NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT"))).toBe(true);
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT"))).toBe(true);
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_TRAVEL_RADIUS"))).toBe(true);
  });

  it("with verified playbook rows matching harness: does not emit deposit/travel unknowns", () => {
    const rows: PlaybookRuleContextRow[] = [
      rule({
        topic: "commercial_deposit_retainer",
        instruction:
          "Booking retainer: common practice 30% retainer to hold a date when contract specifies — never invent 50% unless verified.",
      }),
      rule({
        topic: "package_elite_collection_verified",
        instruction:
          "Verified — Elite collection: 30% retainer holds date when contract reflects it; engagement travel within 50 miles of Florence included.",
      }),
    ];
    const sig = buildUnknownPolicySignals(rows, commercialHarnessInbound);
    expect(sig.some((s) => s.includes("NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT"))).toBe(false);
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT"))).toBe(false);
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_TRAVEL_RADIUS"))).toBe(false);
  });

  it("playbook without numeric % still triggers deposit unknown when client asks", () => {
    const rows: PlaybookRuleContextRow[] = [
      rule({
        topic: "commercial_deposit_retainer",
        instruction: "Align deposit terms with the signed contract; do not guess.",
      }),
    ];
    const sig = buildUnknownPolicySignals(rows, "What is the deposit to hold our date?");
    expect(sig.some((s) => s.includes("UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT"))).toBe(true);
  });
});
