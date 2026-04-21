import { describe, expect, it } from "vitest";
import type { AssistantContext } from "../../../../src/types/assistantContext.types.ts";
import { formatAssistantContextForOperatorLlm } from "./formatAssistantContextForOperatorLlm.ts";

function minimalCtx(): AssistantContext {
  return {
    clientFacingForbidden: true,
    photographerId: "p1",
    queryText: "Q?",
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
      queryDigest: { charLength: 2, fingerprint: "ff" },
      scopesQueried: ["studio_memory"],
      focus: {
        weddingIdRequested: null,
        weddingIdEffective: null,
        personIdRequested: null,
        personIdEffective: null,
      },
      queryTextScopeExpansion: "none",
      memoryHeaderCount: 0,
      selectedMemoryIds: [],
      globalKnowledgeRowCount: 0,
    },
  };
}

describe("formatAssistantContextForOperatorLlm", () => {
  it("includes operator question and retrieval debug", () => {
    const s = formatAssistantContextForOperatorLlm(minimalCtx());
    expect(s).toContain("## Operator question");
    expect(s).toContain("Q?");
    expect(s).toContain("## Retrieval debug");
    expect(s).toContain('"fingerprint":"ff"');
  });
});
