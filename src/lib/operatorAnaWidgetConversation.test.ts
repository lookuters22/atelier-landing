import { describe, expect, it } from "vitest";
import { buildOperatorAnaWidgetConversation, extractOperatorAnaWidgetCompletedTurns } from "./operatorAnaWidgetConversation.ts";
import {
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_ASSISTANT_CHARS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TOTAL_CHARS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TURN_PAIRS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_USER_CHARS,
} from "./operatorAnaWidgetConversationBounds.ts";
import type { OperatorStudioAssistantAssistantDisplay } from "./operatorStudioAssistantWidgetResult.ts";

function answerDisplay(mainText: string): OperatorStudioAssistantAssistantDisplay {
  return {
    kind: "answer",
    mainText,
    operatorRibbon: "",
    devRetrieval: null,
    playbookRuleProposals: [],
    taskProposals: [],
    memoryNoteProposals: [],
    authorizedCaseExceptionProposals: [],
  };
}

const f = (w: string | null) => ({ weddingId: w, personId: null as string | null });

describe("extractOperatorAnaWidgetCompletedTurns", () => {
  it("extracts one pair and ignores trailing user-only", () => {
    const lines = [
      { role: "user" as const, text: "Q1", focusSnapshot: f("w1") },
      { role: "assistant" as const, display: answerDisplay("A1"), focusSnapshot: f("w1") },
      { role: "user" as const, text: "Q2", focusSnapshot: f("w1") },
    ];
    const t = extractOperatorAnaWidgetCompletedTurns(lines);
    expect(t).toEqual([{ userText: "Q1", assistantText: "A1", focus: f("w1") }]);
  });

  it("ignores a user line followed by an in-flight assistant line (not a completed turn)", () => {
    const lines = [
      { role: "user" as const, text: "Q1", focusSnapshot: f("w1") },
      { role: "assistant" as const, kind: "in_flight" as const, streamingText: "partial", focusSnapshot: f("w1") },
    ];
    expect(extractOperatorAnaWidgetCompletedTurns(lines)).toEqual([]);
  });
});

describe("buildOperatorAnaWidgetConversation", () => {
  it("keeps at most max turn pairs", () => {
    const prior = Array.from({ length: 5 }, (_, i) => ({
      userText: `u${i}`,
      assistantText: `a${i}`,
      focus: f("w1"),
    }));
    const out = buildOperatorAnaWidgetConversation(prior, f("w1"));
    expect(out).toHaveLength(OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TURN_PAIRS * 2);
    const lastU = out[out.length - 2]!.content;
    expect(lastU).toBe(`u${4}`);
  });

  it("drops turns when focus (wedding) no longer matches", () => {
    const prior = [
      { userText: "q0", assistantText: "a0", focus: f("w-old") },
      { userText: "q1", assistantText: "a1", focus: f("w-new") },
    ];
    const out = buildOperatorAnaWidgetConversation(prior, f("w-new"));
    const flat = out.map((m) => m.content).join("|");
    expect(flat).toContain("q1");
    expect(flat).not.toContain("q0");
  });

  it("truncates per-turn content", () => {
    const longU = "x".repeat(OPERATOR_ANA_WIDGET_CONVERSATION_MAX_USER_CHARS + 50);
    const longA = "y".repeat(OPERATOR_ANA_WIDGET_CONVERSATION_MAX_ASSISTANT_CHARS + 50);
    const out = buildOperatorAnaWidgetConversation(
      [{ userText: longU, assistantText: longA, focus: f(null) }],
      f(null),
    );
    expect(out[0]!.content.length).toBeLessThanOrEqual(OPERATOR_ANA_WIDGET_CONVERSATION_MAX_USER_CHARS);
    expect(out[1]!.content.length).toBeLessThanOrEqual(OPERATOR_ANA_WIDGET_CONVERSATION_MAX_ASSISTANT_CHARS);
  });

  it("follow-up regression: two turns with same focus produce user/assistant history for the third send", () => {
    const prior = [
      { userText: "what's the last inquiry we got?", assistantText: "Inquiry A from J.", focus: f(null) },
      { userText: "what was it about?", assistantText: "It was about pricing.", focus: f(null) },
    ];
    const out = buildOperatorAnaWidgetConversation(prior, f(null));
    expect(out[0]!.content).toContain("inquiry");
    expect(out[2]!.content).toContain("what was it about");
  });

  it("drops oldest pairs when total char cap would be exceeded", () => {
    const chunk = "z".repeat(Math.floor(OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TOTAL_CHARS / 4) + 100);
    const prior = [
      { userText: chunk, assistantText: chunk, focus: f("w1") },
      { userText: "keep", assistantText: "me", focus: f("w1") },
    ];
    const out = buildOperatorAnaWidgetConversation(prior, f("w1"));
    const total = out.reduce((n, m) => n + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TOTAL_CHARS);
    const flat = out.map((m) => m.content).join("");
    expect(flat).toContain("keep");
  });
});