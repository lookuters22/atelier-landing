import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AssistantContext } from "../../../../src/types/assistantContext.types.ts";
import { handleOperatorStudioAssistantPost } from "./handleOperatorStudioAssistantPost.ts";
import { OperatorStudioAssistantValidationError } from "./operatorStudioAssistantHttp.ts";

vi.mock("../context/buildAssistantContext.ts", () => ({
  buildAssistantContext: vi.fn(),
}));

vi.mock("./completeOperatorStudioAssistantLlm.ts", () => ({
  completeOperatorStudioAssistantLlm: vi.fn(),
}));

import { buildAssistantContext } from "../context/buildAssistantContext.ts";
import { completeOperatorStudioAssistantLlm } from "./completeOperatorStudioAssistantLlm.ts";

function fakeCtx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    clientFacingForbidden: true,
    photographerId: "photo-1",
    queryText: "hello",
    focusedWeddingId: null,
    focusedPersonId: null,
    playbookRules: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    crmDigest: { recentWeddings: [], recentPeople: [] },
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    retrievalLog: {
      mode: "assistant_query",
      queryDigest: { charLength: 5, fingerprint: "abcd1234" },
      scopesQueried: ["studio_memory", "playbook"],
      focus: {
        weddingIdRequested: null,
        weddingIdEffective: null,
        personIdRequested: null,
        personIdEffective: null,
      },
      queryTextScopeExpansion: "none",
      memoryHeaderCount: 0,
      selectedMemoryIds: ["m1"],
      globalKnowledgeRowCount: 0,
    },
    ...overrides,
  };
}

describe("handleOperatorStudioAssistantPost", () => {
  beforeEach(() => {
    vi.mocked(buildAssistantContext).mockReset();
    vi.mocked(completeOperatorStudioAssistantLlm).mockReset();
  });

  it("builds AssistantContext then LLM reply", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue("Operator answer");

    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "What is our turnaround?",
      focusedWeddingId: "11111111-1111-1111-1111-111111111111",
      focusedPersonId: null,
    });

    expect(buildAssistantContext).toHaveBeenCalledWith({} as never, "photo-1", {
      queryText: "What is our turnaround?",
      focusedWeddingId: "11111111-1111-1111-1111-111111111111",
      focusedPersonId: null,
    });
    expect(completeOperatorStudioAssistantLlm).toHaveBeenCalledTimes(1);
    expect(out.reply).toBe("Operator answer");
    expect(out.clientFacingForbidden).toBe(true);
    expect(out.retrievalLog.selectedMemoryIds).toEqual(["m1"]);
  });

  it("returns fallback reply when LLM fails", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockRejectedValue(new Error("openai_down"));

    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "test",
    });

    expect(out.clientFacingForbidden).toBe(true);
    expect(out.reply).toContain("retrieval succeeded");
    expect(out.reply).toContain("openai_down");
    expect(out.reply).toContain("m1");
  });

  it("rejects empty queryText", async () => {
    await expect(
      handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "  " }),
    ).rejects.toThrow(OperatorStudioAssistantValidationError);
    await expect(
      handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "  " }),
    ).rejects.toMatchObject({ message: "queryText is required" });
  });
});
