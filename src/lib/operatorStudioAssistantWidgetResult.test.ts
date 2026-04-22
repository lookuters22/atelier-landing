import { describe, expect, it } from "vitest";
import {
  OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE,
  buildOperatorStudioAssistantAssistantDisplay,
} from "./operatorStudioAssistantWidgetResult.ts";

describe("buildOperatorStudioAssistantAssistantDisplay", () => {
  it("fails closed when clientFacingForbidden is missing", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay({ reply: "secret" }, { devMode: false });
    expect(d.kind).toBe("contract_violation");
    if (d.kind === "contract_violation") {
      expect(d.mainText).toBe(OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE);
    }
  });

  it("fails closed when clientFacingForbidden is false", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      { reply: "secret", clientFacingForbidden: false },
      { devMode: false },
    );
    expect(d.kind).toBe("contract_violation");
  });

  it("returns answer with ribbon when contract holds", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      { reply: "  ok  ", clientFacingForbidden: true },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.mainText).toBe("ok");
      expect(d.operatorRibbon).toContain("Internal assistant");
      expect(d.devRetrieval).toBeNull();
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
    }
  });

  it("includes devRetrieval in dev when retrievalLog is present", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        retrievalLog: { scopesQueried: ["a"], selectedMemoryIds: ["m1"] },
      },
      { devMode: true },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.devRetrieval).toEqual({ scopes: ["a"], memoryIds: ["m1"] });
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
    }
  });

  it("hides devRetrieval in production mode even if retrievalLog exists", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        retrievalLog: { scopesQueried: ["a"], selectedMemoryIds: [] },
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.devRetrieval).toBeNull();
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
    }
  });

  it("Slice 6: surfaces playbook rule proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can add that as a rule candidate.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "playbook_rule_candidate",
            proposedActionKey: "no_flash",
            topic: "On-camera flash",
            proposedInstruction: "Never use on-camera flash during ceremonies.",
            proposedDecisionMode: "forbidden",
            proposedScope: "global",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.playbookRuleProposals).toHaveLength(1);
      expect(d.playbookRuleProposals[0]!.proposedActionKey).toBe("no_flash");
      expect(d.taskProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
    }
  });

  it("Slice 7: surfaces task proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I'll add a follow-up task.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "task",
            title: "Call the venue",
            dueDate: "2026-05-01",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.taskProposals).toHaveLength(1);
      expect(d.taskProposals[0]!.title).toBe("Call the venue");
      expect(d.taskProposals[0]!.dueDate).toBe("2026-05-01");
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
    }
  });

  it("Slice 8: surfaces memory_note proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can save that as studio memory.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "No flash in church",
            summary: "We do not use flash during church ceremonies.",
            fullContent: "We do not use flash during church ceremonies.",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(1);
      expect(d.memoryNoteProposals[0]!.memoryScope).toBe("studio");
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
    }
  });

  it("Slice 11: surfaces authorized_case_exception proposals (case-scoped only)", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can add a one-off case exception for this project.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "travel_fee",
            overridePayload: { decision_mode: "ask_first" },
            weddingId: "11111111-1111-1111-1111-111111111111",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.authorizedCaseExceptionProposals).toHaveLength(1);
      expect(d.authorizedCaseExceptionProposals[0]!.overridesActionKey).toBe("travel_fee");
      expect(d.authorizedCaseExceptionProposals[0]!.weddingId).toBe("11111111-1111-1111-1111-111111111111");
      expect(d.playbookRuleProposals).toEqual([]);
    }
  });
});
