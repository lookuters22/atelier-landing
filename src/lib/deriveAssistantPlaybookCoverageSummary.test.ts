import { describe, expect, it } from "vitest";
import type { EffectivePlaybookRule } from "../types/decisionContext.types.ts";
import {
  deriveAssistantPlaybookCoverageSummary,
  EMPTY_ASSISTANT_PLAYBOOK_COVERAGE_SUMMARY,
} from "./deriveAssistantPlaybookCoverageSummary.ts";

const baseRule: Omit<EffectivePlaybookRule, "action_key" | "topic" | "instruction" | "id"> = {
  decision_mode: "draft_only",
  scope: "global",
  channel: "email",
  source_type: "operator",
  confidence_label: "high",
  is_active: true,
  effectiveDecisionSource: "playbook",
  appliedAuthorizedExceptionId: null,
};

describe("deriveAssistantPlaybookCoverageSummary", () => {
  it("empty rules yields empty coverage", () => {
    expect(deriveAssistantPlaybookCoverageSummary([])).toEqual(EMPTY_ASSISTANT_PLAYBOOK_COVERAGE_SUMMARY);
  });

  it("aggregates topics, keys, action-key tokens, and instruction keywords", () => {
    const rules: EffectivePlaybookRule[] = [
      {
        ...baseRule,
        id: "a",
        action_key: "wedding_pricing",
        topic: "Wedding",
        instruction: "We cover local weddings; destination weddings have travel fees.",
      },
      {
        ...baseRule,
        id: "b",
        action_key: "wedding_pricing",
        topic: "Wedding",
        instruction: "Repeat topic row for per-topic count.",
      },
    ];
    const s = deriveAssistantPlaybookCoverageSummary(rules);
    expect(s.totalActiveRules).toBe(2);
    expect(s.topicCounts).toEqual([{ topic: "Wedding", count: 2 }]);
    expect(s.uniqueActionKeys).toEqual(["wedding_pricing"]);
    expect(s.actionKeyTokenHints).toContain("wedding");
    expect(s.actionKeyTokenHints).toContain("pricing");
    expect(s.coverageKeywordHints).toContain("weddings");
    expect(s.coverageKeywordHints).toContain("destination");
  });

  it("counts case-exception overlays", () => {
    const rules: EffectivePlaybookRule[] = [
      {
        ...baseRule,
        id: "x",
        action_key: "a",
        topic: "A",
        instruction: "x",
        effectiveDecisionSource: "authorized_exception",
        appliedAuthorizedExceptionId: "ex-1",
      },
    ];
    const s = deriveAssistantPlaybookCoverageSummary(rules);
    expect(s.rulesWithCaseException).toBe(1);
  });
});
