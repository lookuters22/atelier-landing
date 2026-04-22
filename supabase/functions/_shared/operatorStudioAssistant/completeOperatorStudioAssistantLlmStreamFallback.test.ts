/**
 * Isolated: mock the reply extractor so the streaming path has no visible stream deltas, while the
 * assembled assistant `content` is still a valid JSON `reply` string — regression for `done` with 0
 * non-empty `token` events.
 */
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { completeOperatorStudioAssistantLlmStreaming } from "./completeOperatorStudioAssistantLlm.ts";

const lookupExecuteMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(JSON.stringify({ tool: "operator_lookup_projects", result: { mocked: true } })),
);

vi.mock("./tools/operatorAssistantReadOnlyLookupTools.ts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./tools/operatorAssistantReadOnlyLookupTools.ts")>();
  return { ...mod, executeOperatorReadOnlyLookupTool: lookupExecuteMock };
});

vi.mock("./streamingReplyExtractor.ts", () => ({
  createReplyExtractor: () => ({
    feed: () => ({ deltaText: "", finished: false }),
    state: () => "seeking" as const,
  }),
}));

import {
  IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
  IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
  IDLE_ASSISTANT_STUDIO_PROFILE,
  type AssistantContext,
} from "../../../../src/types/assistantContext.types.ts";
import { getAssistantAppCatalogForContext } from "../../../../src/lib/operatorAssistantAppCatalog.ts";
import { shouldIncludeAppCatalogInOperatorPrompt } from "../../../../src/lib/operatorAssistantAppHelpIntent.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_BODIES } from "../context/fetchAssistantThreadMessageBodies.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../context/fetchAssistantOperatorCalendarSnapshot.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { IDLE_OPERATOR_ANA_TRIAGE } from "../../../../src/lib/operatorAnaTriage.ts";
import { IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY } from "../context/fetchAssistantOperatorStateSummary.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../context/resolveOperatorQueryEntitiesFromIndex.ts";

const EMPTY_OPERATOR_STATE = {
  ...IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY,
  fetchedAt: "2020-01-01T00:00:00.000Z",
} as AssistantContext["operatorStateSummary"];

function minimalContext(): AssistantContext {
  const base: Omit<AssistantContext, "includeAppCatalogInOperatorPrompt" | "playbookCoverageSummary"> = {
    clientFacingForbidden: true,
    photographerId: "p1",
    queryText: "Hi",
    focusedWeddingId: null,
    focusedPersonId: null,
    playbookRules: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    crmDigest: { recentWeddings: [], recentPeople: [] },
    focusedProjectFacts: null,
    focusedProjectSummary: null,
    focusedProjectRowHints: null,
    operatorStateSummary: EMPTY_OPERATOR_STATE,
    studioProfile: IDLE_ASSISTANT_STUDIO_PROFILE,
    studioOfferBuilder: IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
    studioInvoiceSetup: IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    appCatalog: getAssistantAppCatalogForContext(),
    studioAnalysisSnapshot: null,
    carryForward: null,
    operatorTriage: IDLE_OPERATOR_ANA_TRIAGE,
    escalationResolverFocus: null,
    offerBuilderSpecialistFocus: null,
    invoiceSetupSpecialistFocus: null,
    investigationSpecialistFocus: null,
    playbookAuditSpecialistFocus: null,
    bulkTriageSpecialistFocus: null,
    retrievalLog: {
      mode: "assistant_query",
      queryDigest: { charLength: 1, fingerprint: "ab" },
      scopesQueried: ["studio_memory", "app_catalog"],
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
      studioAnalysisProjectCount: null,
    },
    operatorQueryEntityResolution: IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION,
    operatorThreadMessageLookup: IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
    operatorThreadMessageBodies: IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
    operatorInquiryCountSnapshot: IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
  };
  return {
    ...base,
    includeAppCatalogInOperatorPrompt: shouldIncludeAppCatalogInOperatorPrompt(base.queryText),
    playbookCoverageSummary: deriveAssistantPlaybookCoverageSummary(base.playbookRules),
  };
}

const te = new TextEncoder();
function dataLineFromObj(obj: unknown) {
  return "data: " + JSON.stringify(obj) + "\n";
}
function openAiSseFromLines(dataLines: string[]): Response {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const l of dataLines) c.enqueue(te.encode(l));
        c.enqueue(te.encode("data: [DONE]\n"));
        c.close();
      },
    }),
  );
}
function deltaLine(content: string) {
  return dataLineFromObj({ choices: [{ index: 0, delta: { content } }] });
}

describe("completeOperatorStudioAssistantLlmStreaming — zero stream fallback (mocked dead extractor)", () => {
  const origKey = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test";
    lookupExecuteMock.mockReset();
    lookupExecuteMock.mockResolvedValue(
      JSON.stringify({ tool: "operator_lookup_projects", result: { mocked: true } }),
    );
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = origKey;
    vi.restoreAllMocks();
  });

  it("injects a single visible token when the extractor would emit nothing but JSON reply is non-empty (no supabase one-shot pass)", async () => {
    const finalJson = { reply: "You should still see this", proposedActions: [] };
    const full = JSON.stringify(finalJson);
    const fetchMock = vi.fn().mockImplementation(() => openAiSseFromLines([deltaLine(full)]));
    vi.stubGlobal("fetch", fetchMock);
    const toks: string[] = [];
    const out = await completeOperatorStudioAssistantLlmStreaming(
      minimalContext(),
      {},
      (d) => toks.push(d),
    );
    expect(out.reply).toBe("You should still see this");
    expect(toks).toEqual(["You should still see this"]);
  });
});
