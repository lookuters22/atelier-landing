/**
 * Slice 2: system prompt shape + OpenAI request wiring (mocked; no live API).
 */
/* Edge functions use `Deno.env`; Vitest runs in Node — mirror `process.env` for env reads. */
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/** Partial mock: avoid real Supabase in two-phase tool tests; keeps real tool schemas. */
const lookupExecuteMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(JSON.stringify({ tool: "operator_lookup_projects", result: { mocked: true } })),
);

vi.mock("./tools/operatorAssistantReadOnlyLookupTools.ts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./tools/operatorAssistantReadOnlyLookupTools.ts")>();
  return { ...mod, executeOperatorReadOnlyLookupTool: lookupExecuteMock };
});

import type {
  AssistantContext,
  AssistantFocusedProjectFacts,
  AssistantOperatorStateSummary,
} from "../../../../src/types/assistantContext.types.ts";
import {
  IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
  IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
  IDLE_ASSISTANT_STUDIO_PROFILE,
} from "../../../../src/types/assistantContext.types.ts";
import { getAssistantAppCatalogForContext } from "../../../../src/lib/operatorAssistantAppCatalog.ts";
import { shouldIncludeAppCatalogInOperatorPrompt } from "../../../../src/lib/operatorAssistantAppHelpIntent.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_BODIES } from "../context/fetchAssistantThreadMessageBodies.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../context/fetchAssistantOperatorCalendarSnapshot.ts";
import { IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY } from "../context/fetchAssistantOperatorStateSummary.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { IDLE_OPERATOR_ANA_TRIAGE } from "../../../../src/lib/operatorAnaTriage.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../context/resolveOperatorQueryEntitiesFromIndex.ts";
import type { OperatorAnaCarryForwardForLlm } from "../../../../src/types/operatorAnaCarryForward.types.ts";
import {
  inferLlmHandlerUsingPointerHeuristic,
} from "./operatorAssistantCarryForward.ts";

const EMPTY_OPERATOR_STATE: AssistantOperatorStateSummary = {
  ...IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY,
  fetchedAt: "2020-01-01T00:00:00.000Z",
  sourcesNote: "",
};
import {
  completeOperatorStudioAssistantLlm,
  completeOperatorStudioAssistantLlmStreaming,
  offerBuilderSpecialistModeSystemAddendum,
  invoiceSetupSpecialistModeSystemAddendum,
  investigationModeSystemAddendum,
  playbookAuditModeSystemAddendum,
  bulkTriageModeSystemAddendum,
  OPERATOR_STUDIO_ASSISTANT_RECENT_SESSION_ADDENDUM,
  OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT,
} from "./completeOperatorStudioAssistantLlm.ts";
import { parseOperatorStudioAssistantLlmResponse } from "./parseOperatorStudioAssistantLlmResponse.ts";

/** Placeholder client; lookup execution is mocked via `lookupExecuteMock`. */
const fakeSupabase = {} as never;

function minimalAssistantContext(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const base: Omit<AssistantContext, "includeAppCatalogInOperatorPrompt" | "playbookCoverageSummary"> = {
    clientFacingForbidden: true,
    photographerId: "p1",
    queryText: "Hi, how are you?",
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
    operatorTriage: IDLE_OPERATOR_ANA_TRIAGE,
    escalationResolverFocus: null,
    offerBuilderSpecialistFocus: null,
    invoiceSetupSpecialistFocus: null,
    investigationSpecialistFocus: null,
    playbookAuditSpecialistFocus: null,
    bulkTriageSpecialistFocus: null,
    ...overrides,
  };
  const cov = deriveAssistantPlaybookCoverageSummary(base.playbookRules);
  return {
    ...base,
    carryForward: overrides.carryForward !== undefined ? overrides.carryForward : null,
    includeAppCatalogInOperatorPrompt:
      overrides.includeAppCatalogInOperatorPrompt ?? shouldIncludeAppCatalogInOperatorPrompt(base.queryText),
    operatorThreadMessageLookup:
      base.operatorThreadMessageLookup ?? IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
    operatorThreadMessageBodies:
      base.operatorThreadMessageBodies ?? IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
    operatorInquiryCountSnapshot:
      base.operatorInquiryCountSnapshot ?? IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: base.operatorCalendarSnapshot ?? IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
    playbookCoverageSummary: cov,
    retrievalLog: {
      ...base.retrievalLog,
      playbookCoverage: {
        totalActiveRules: cov.totalActiveRules,
        uniqueTopicCount: cov.uniqueTopics.length,
        uniqueActionKeyCount: cov.uniqueActionKeys.length,
      },
    },
  };
}

/**
 * Slice 5 reply-layer: fail if a mocked (or real) `reply` reuses wedding-only wording when
 * the operator’s own question did not already use that wording (avoids false positives on
 * operator-supplied phrasing).
 */
const WEDDING_BLEED_PATTERNS: Array<{ name: string; inText: (s: string) => boolean }> = [
  { name: "couple", inText: (s) => /\bcouple\b/i.test(s) },
  { name: "wedding day", inText: (s) => /wedding\s+day/i.test(s) },
  { name: "ceremony", inText: (s) => /\bceremony\b/i.test(s) },
  { name: "bride", inText: (s) => /\bbride\b/i.test(s) },
  { name: "groom", inText: (s) => /\bgroom\b/i.test(s) },
];

function expectReplyNoWeddingBleedUnlessInOperatorQuery(reply: string, operatorQuery: string) {
  for (const { name, inText } of WEDDING_BLEED_PATTERNS) {
    if (inText(operatorQuery)) continue;
    if (inText(reply)) {
      throw new Error(
        `Slice 5 anti-bleed: reply contained “${name}” but operator query did not — reply preview: ${reply.slice(0, 240)}`,
      );
    }
  }
}

describe("OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT (Slice 2)", () => {
  it("allows short natural handling of greetings / small talk without terminal-style refusal", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/[Ww]ho you are|\*\*Who you are:\*\*/);
    expect(p).toMatch(/greetings|light chat|small talk|thanks/i);
    expect(p).toMatch(/one or two sentences|real human reply/i);
    expect(p).toMatch(/not applicable in this context/);
    expect(p).toMatch(/trusted studio manager|teammate/i);
  });

  it("preserves no client-facing drafting and no false send claims", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/[Nn]ever.*(send to a client|client email|inbox from this tool)/i);
    expect(p).toMatch(/[Nn]ever.*(sent, posted, or completed|unless the context \*\*explicitly\*\*)/i);
    // Regression: "write me an email to the client" must stay out of scope for this widget
    expect(p).toContain("send to a client");
    expect(p).toContain("Hi [Name]");
  });

  it("reinforces playbook over memory and honest missing context", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/[Pp]laybook.*[Aa]uthoritative/);
    expect(p).toContain("supporting");
    expect(p).toContain("context does not contain");
    expect(p).toContain("missing");
  });

  it("studio profile grounding v1 — capability boundary vs playbook authority", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toContain("**Studio profile vs playbook (read-only capability boundary):**");
    expect(p).toContain("**studio_business_profiles**");
    expect(p).toContain("**photographers.settings**");
    expect(p).toMatch(/do not invent/i);
    expect(p).toMatch(/Playbook.*governs how you should behave/i);
  });

  it("includes out-of-scope redirect and keeps studio orientation", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/(poems|creative)/i);
    expect(p).toMatch(/(studio|CRM|pipeline|inbox|workflow).*(help|question)/i);
  });

  it("forwards change requests as prose, not as done (updated planned-changes contract)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/playbook rule|task|memory note|case exception/i);
    expect(p).toMatch(/do not claim it is already done/);
    expect(p).toMatch(/Do not ask them \*whether\* they want it/);
  });

  it("answer-first + anti-deflection: lead with fact, never hedge phrases", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toContain("**Lead with the fact.**");
    expect(p).toContain("Answer first, detail second");
    expect(p).toMatch(/Never hedge when the answer is present/);
    expect(p).toMatch(/you might want to check/);
    expect(p).toMatch(/Do not list three places/);
  });

  it("multiple possible matches section lists 2–3 candidates with distinguishing detail", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toContain("**Multiple possible matches:**");
    expect(p).toMatch(/top 2–3 candidates/);
    expect(p).toMatch(/Romano & Bianchi|Nocera inquiry/);
  });

  it("Slice 5 — B9 / app help: in-repo catalog, quote paths, no invented UI; redirect generic software", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/[Aa]pp help|in-repo catalog/i);
    expect(p).toMatch(/grounding completion/i);
    expect(p).toMatch(/(JSON|in-repo|catalog).*(quote|path|label|verbatim)/i);
    expect(p).toMatch(/single best-matching|best-matching/i);
    expect(p).toMatch(/[Dd]o not invent|not invent|fabricat/i);
    expect(p).toMatch(/[Gg]it|[Bb]rowser|generic software/i);
    expect(p).toMatch(/[Oo]nboarding|Settings/i);
    expect(p).toMatch(/catalog does not define|omitted/i);
  });

  it("Slice 9 — Open-Meteo block only; no web search; honest about forecast window", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/Open-Meteo/);
    expect(p).toMatch(/16|short.*window|window.*16/i);
    expect(p).toMatch(/(do not|not).*web search|web search/i);
  });

  it("Slice 12 — studio analysis: ground in snapshot, no invented numbers, small-sample honesty, not market coaching", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/Studio analysis \(Slice 12/);
    expect(p).toMatch(/Do not invent/i);
    expect(p).toMatch(/small|tentative/i);
    expect(p).toMatch(/competitor|industry|market/i);
    expect(p).toMatch(/observations|coaching/i);
    expect(p).toContain("### Grounding (read before JSON)");
    expect(p).toContain("studio_analysis");
  });

  it("Slice 6–8 — JSON response + playbook, task, and memory_note proposals (no claim of save)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/Response format \(Slice 6/);
    expect(p).toContain("proposedActions");
    expect(p).toContain("playbook_rule_candidate");
    expect(p).toContain('**"task"**');
    expect(p).toContain("**dueDate**");
    expect(p).toMatch(/optional.*dueDate|dueDate.*optional/i);
    expect(p).toContain('**"memory_note"**');
    expect(p).toContain("**memoryScope**");
    expect(p).toMatch(
      /[Nn]ever claim a rule, task, memory, exception, profile field, offer document, invoice template, or calendar row|proposes what they can confirm/,
    );
  });

  it("safe task write promotion — manager phrasing + confirm-before-save in system prompt", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Tasks \(manager/);
    expect(p).toMatch(/remind me|follow up|to-do|Create task/i);
    expect(p).toMatch(/nothing is saved until|Create task under your message/i);
  });

  it("safe memory write promotion — manager phrasing + memory_note + confirm-before-save in system prompt", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Memories \(manager/);
    expect(p).toMatch(/remember that|Save memory|memory_note/i);
    expect(p).toMatch(/nothing is written to memories until|Save memory on the proposal card/i);
    expect(p).toMatch(/\*\*personId\*\*/);
  });

  it("safe case exception write promotion — manager phrasing + confirm + project scope in system prompt", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Case exceptions \(manager/);
    expect(p).toMatch(/one-off|split the deposit|pay later|authorized_case_exception/i);
    expect(p).toMatch(/Save case exception \(confirm\)|authorized_case_exceptions/i);
    expect(p).toMatch(/weddingId|Focused project/);
  });

  it("Slice 11 — authorized_case_exception in JSON response format (case-scoped, not a global rule)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/Response format \(Slice 6/);
    expect(p).toContain("authorized_case_exception");
    expect(p).toContain("overridesActionKey");
    expect(p).toContain("overridePayload");
    expect(p).toMatch(/one-off|one booking|this-project|not.*global|case/i);
  });

  it("Offer builder — offer_builder_change_proposal bounded metadata in system prompt (enqueue, no live apply)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Offer builder — document label \/ title/);
    expect(p).toContain("offer_builder_change_proposal");
    expect(p).toMatch(/metadata_patch|name.*root_title|root_title/);
    expect(p).toMatch(/Offer projects \(grounded\)|Offer projects/);
  });

  it("Invoice setup — invoice_setup_change_proposal bounded template_patch in system prompt (enqueue, no live apply)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Invoice setup — PDF template/);
    expect(p).toContain("invoice_setup_change_proposal");
    expect(p).toMatch(/template_patch|legalName|invoicePrefix/);
    expect(p).toMatch(/logoDataUrl|never.*logo|no.*logo/i);
  });

  it("Recovery slice — read-only lookup tools named in prompt (bounded second pass)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toContain("operator_lookup_projects");
    expect(p).toContain("operator_lookup_project_details");
    expect(p).toContain("operator_lookup_threads");
    expect(p).toContain("operator_lookup_thread_messages");
    expect(p).toContain("operator_lookup_inquiry_counts");
    expect(p).toContain("operator_lookup_draft");
    expect(p).toContain("operator_lookup_thread_queue");
    expect(p).toContain("operator_lookup_escalation");
    expect(p).toContain("operator_lookup_offer_builder");
    expect(p).toContain("operator_lookup_invoice_setup");
    expect(p).toMatch(/read-only lookup tools|Read-only lookup tools/i);
    expect(p).toMatch(/Project CRM|resolver vs detail|Slice 3/);
    expect(p).toMatch(/never more than three|more than three/i);
  });

  it("Slice 3 — project domain: resolver (text) vs detail (UUID); focused summary is pointer, not deep source", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/Project CRM.*Slice 3|Slice 3.*Project CRM/);
    expect(p).toMatch(/operator_lookup_projects.*resolver|resolver.*operator_lookup_projects/i);
    expect(p).toMatch(/operator_lookup_project_details|detail/);
    expect(p).toMatch(/natural language|name.*couple|venue|location|vague|ambiguous/i);
    expect(p).toMatch(/query.*string|never a UUID|not.*UUID/i);
    expect(p).toMatch(/Focused project \(summary\)|pointer|Do not infer|not.*infer.*summary|summary.*alone/i);
    expect(p).toMatch(/Beaumont|beaumont/);
    expect(p).toMatch(/venue\?|What.*venue|venue.*\?/i);
  });

  it("Slice 4 — CRM digest list not in operator Context; project truth via tools, not a digest (prompt contract)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/Slice 4/);
    expect(p).toMatch(/CRM digest.*not.*included|not.*included.*CRM digest|digest.*not.*in.*prompt|not.*in.*Context/i);
  });

  it("Slice 5 — project type discipline: wedding vs commercial / video / other vocabulary", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/Project type discipline \(Slice 5\)/);
    expect(p).toMatch(/projectType.*wedding.*commercial.*video|commercial.*video.*other/i);
    expect(p).toMatch(/the couple|wedding day|bride|groom/i);
    expect(p).toMatch(/client.*brand|video project|production|neutral/);
  });

  it("Slice 6 — single canonical carry-forward / follow-up resolution paragraph (no duplicate)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toContain("**Triage (v1 hint — Slice A2):**");
    const n = p.match(/\*\*Follow-up resolution \(Slice 6 — carry-forward pointer\):\*\*/g)?.length;
    expect(n).toBe(1);
  });

  it("Calendar — system prompt stresses DB window evidence (no “free day” inference)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Calendar \(database calendar_events — reads \+ staged writes\):\*\*/);
    expect(p).toContain("lookup mode");
    expect(p).toContain("UTC time window");
    expect(p).toMatch(/no rows|free/i);
  });

  it("thread / email honesty: bounded bodies + title is not a substitute when excerpts absent", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Thread & email \(Context — honesty \+ bounded bodies\):\*\*/);
    expect(p).toMatch(/Thread message excerpts/);
    expect(p).toMatch(/operator_lookup_thread_messages/);
    expect(p).toMatch(/thread title is never a substitute|title is never a substitute/i);
    expect(p).toMatch(/900|8 recent/);
  });

  it("Slice 3 refinement — operator queue / Today snapshot contract", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Operator queue \/ Today \(read-only — Slice 3 refinement \+ F5 urgency framing\):\*\*/);
    expect(p).toContain("operator_queue");
    expect(p).toMatch(/Snapshot-derived|Zen tab totals/i);
    expect(p).toMatch(/blocking \/ decision|triage \/ volume|overdue tasks/i);
  });

  it("draft inspection — operator_lookup_draft + evidence vs inference in system prompt", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Draft inspection \(read-only/);
    expect(p).toContain("operator_lookup_draft");
    expect(p).toMatch(/instruction_history|provenance/);
    expect(p).toMatch(/Inference|inference/);
    expect(p).toMatch(/source_action_key/);
  });

  it("review queue explanation — operator_lookup_thread_queue + grounded vs derived hints in system prompt", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Review queue explanation \(read-only/);
    expect(p).toContain("operator_lookup_thread_queue");
    expect(p).toContain("derivedInboxBucket");
    expect(p).toContain("zenTabHints");
    expect(p).toMatch(/escalation_requests/);
  });

  it("escalation inspection — operator_lookup_escalation + evidence in system prompt", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    expect(p).toMatch(/\*\*Escalation inspection \(read-only/);
    expect(p).toContain("operator_lookup_escalation");
    expect(p).toMatch(/question_body|decision_justification/);
    expect(p).toMatch(/playbook_rules|playbookRule/);
  });
});

describe("completeOperatorStudioAssistantLlm (mocked OpenAI)", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key-slice2";
    lookupExecuteMock.mockReset();
    lookupExecuteMock.mockResolvedValue(
      JSON.stringify({ tool: "operator_lookup_projects", result: { mocked: true } }),
    );
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("sends the Slice 2 system prompt as the first message and user content as formatted context (Slice 6 JSON reply)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Hello — doing well, thanks. What can I help you with?",
                  proposedActions: [],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ctx = minimalAssistantContext({ queryText: "Where do I find drafts?" });
    const out = await completeOperatorStudioAssistantLlm(ctx);

    expect(out.reply).toBe("Hello — doing well, thanks. What can I help you with?");
    expect(out.proposedActions).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      response_format?: { type: string };
      tools?: unknown[];
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.tools).toBeUndefined();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT,
    });
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain("## Operator question");
    expect(body.messages[1].content).toContain("## App help / navigation (in-repo catalog");
    expect(body.messages[1].content).toContain("```json");
    expect(body.messages[1].content).toContain("Where do I find drafts?");
  });

  it("user Context includes Thread message excerpts when first-pass bodies snapshot ran", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "They’re asking about June 14.",
                  proposedActions: [],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const ctx = minimalAssistantContext({
      queryText: "What did they say in the email?",
      operatorThreadMessageLookup: {
        didRun: true,
        selectionNote: "single",
        threads: [
          {
            threadId: tid,
            title: "Re: Pricing",
            weddingId: null,
            channel: "email",
            kind: "client",
            lastActivityAt: "2025-01-02T00:00:00.000Z",
            lastInboundAt: "2025-01-02T00:00:00.000Z",
            lastOutboundAt: null,
          },
        ],
      },
      operatorThreadMessageBodies: {
        didRun: true,
        selectionNote: "messages_loaded",
        threadId: tid,
        threadTitle: "Re: Pricing",
        truncatedOverall: false,
        messages: [
          {
            messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            direction: "in",
            sender: "client@example.com",
            sentAt: "2025-01-02T00:00:00.000Z",
            bodyExcerpt: "We would love to book June 14.",
            bodyClipped: false,
          },
        ],
      },
    });
    const out = await completeOperatorStudioAssistantLlm(ctx);
    expect(out.reply).toContain("June 14");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> };
    expect(body.messages[1]!.content).toContain("### Thread message excerpts");
    expect(body.messages[1]!.content).toContain("We would love to book June 14.");
  });

  it("Slice 6: parses proposed playbook_rule_candidate actions from the model JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "I'll stage that as a candidate.",
                  proposedActions: [
                    {
                      kind: "playbook_rule_candidate",
                      proposedActionKey: "no_flash_ceremony",
                      topic: "Flash policy",
                      proposedInstruction: "No on-camera flash during the ceremony.",
                      proposedDecisionMode: "forbidden",
                      proposedScope: "global",
                    },
                  ],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(minimalAssistantContext({ queryText: "Add a rule" }));
    expect(out.proposedActions).toHaveLength(1);
    const first = out.proposedActions[0]!;
    expect(first.kind).toBe("playbook_rule_candidate");
    if (first.kind === "playbook_rule_candidate") {
      expect(first.proposedActionKey).toBe("no_flash_ceremony");
    }
  });

  it("Slice 7: parses proposed task actions from the model JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Staged a task you can create.",
                  proposedActions: [
                    {
                      kind: "task",
                      title: "Send gallery preview",
                      dueDate: "2026-04-30",
                    },
                  ],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(minimalAssistantContext({ queryText: "Remind me" }));
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions[0]!.kind).toBe("task");
    if (out.proposedActions[0]!.kind === "task") {
      expect(out.proposedActions[0].title).toBe("Send gallery preview");
      expect(out.proposedActions[0].dueDate).toBe("2026-04-30");
    }
  });

  it("Slice 7+: proposed task without dueDate defaults to today UTC after parse", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-22T10:00:00.000Z"));
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: "Due today unless you change it in Tasks.",
                    proposedActions: [{ kind: "task", title: "Reply to planner" }],
                  }),
                },
              },
            ],
          }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const out = await completeOperatorStudioAssistantLlm(minimalAssistantContext({ queryText: "Remind me to reply" }));
      expect(out.proposedActions).toHaveLength(1);
      if (out.proposedActions[0]!.kind === "task") {
        expect(out.proposedActions[0].dueDate).toBe("2026-04-22");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("Slice 9: weather path prefetches Open-Meteo; user content includes the weather section before OpenAI", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("geocoding-api.open-meteo.com")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ name: "Paris", latitude: 48.85, longitude: 2.35, country: "France" }],
            }),
        };
      }
      if (String(url).includes("api.open-meteo.com")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              daily: {
                time: ["2026-05-10"],
                weathercode: [0],
                temperature_2m_max: [20],
                temperature_2m_min: [10],
                precipitation_probability_max: [5],
              },
            }),
        };
      }
      if (String(url).includes("api.openai.com")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      reply: "Mild, low rain chance; cite Open-Meteo.",
                      proposedActions: [],
                    }),
                  },
                },
              ],
            }),
        };
      }
      throw new Error("unexpected url: " + String(url).slice(0, 200));
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({ queryText: "What is the weather in Paris on 2026-05-10? Forecast please." }),
    );
    expect(out.reply).toContain("Mild");
    const openAiCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("api.openai.com"));
    expect(openAiCalls.length).toBe(1);
    const body = JSON.parse(String((openAiCalls[0]![1] as RequestInit).body)) as {
      messages: { content: string }[];
    };
    const user = body.messages[1]!.content;
    expect(user).toContain("## Weather lookup (external tool — Open-Meteo)");
    expect(user).toContain("Open-Meteo");
    expect(user).toContain("**Source:**");
    vi.useRealTimers();
  });

  it("regression: non-weather questions do not include a weather block in the user content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "Revenue is in the CRM view.",
                  proposedActions: [],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({ queryText: "What’s the balance due for the Smith wedding?" }),
    );
    expect(out.reply).toContain("CRM");
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      messages: { content: string }[];
    };
    expect(body.messages[1]!.content).not.toContain("## Weather lookup");
  });

  it("Slice 8: parses proposed memory_note actions from the model JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "You can save this as studio memory.",
                  proposedActions: [
                    {
                      kind: "memory_note",
                      memoryScope: "studio",
                      title: "Travel policy",
                      summary: "We do not book travel-only outside EU.",
                      fullContent: "We do not book travel-only outside EU.",
                    },
                  ],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(minimalAssistantContext({ queryText: "Remember we don't do X" }));
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions[0]!.kind).toBe("memory_note");
    if (out.proposedActions[0]!.kind === "memory_note") {
      expect(out.proposedActions[0].memoryScope).toBe("studio");
      expect(out.proposedActions[0].title).toBe("Travel policy");
    }
  });

  it("Bounded session: [system+addendum, ...history, user with formatted context only] — history not in context block", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({ reply: "Follow-up answer.", proposedActions: [] }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = minimalAssistantContext({ queryText: "what was it about?" });
    await completeOperatorStudioAssistantLlm(ctx, {
      conversation: [
        { role: "user", content: "what's the last inquiry we got?" },
        { role: "assistant", content: "Inquiry from Jordan about June." },
      ],
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages).toHaveLength(4);
    expect(body.messages[0]!.role).toBe("system");
    expect(body.messages[0]!.content).toContain(OPERATOR_STUDIO_ASSISTANT_RECENT_SESSION_ADDENDUM);
    expect(body.messages[0]!.content).toContain(OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT);
    expect(body.messages[1]!.content).toBe("what's the last inquiry we got?");
    expect(body.messages[2]!.content).toBe("Inquiry from Jordan about June.");
    const lastUser = body.messages[3]!.content;
    expect(lastUser).toContain("## Operator question");
    expect(lastUser).toContain("what was it about?");
    expect(lastUser).not.toContain("what's the last inquiry we got?");
    expect(lastUser).not.toContain("Inquiry from Jordan");
  });

  it("without supabase: never sends tools on the OpenAI request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: JSON.stringify({ reply: "ok", proposedActions: [] }) } }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await completeOperatorStudioAssistantLlm(minimalAssistantContext());
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      tools?: unknown;
      response_format?: unknown;
    };
    expect(body.tools).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("with supabase: first request offers tools and omits json_object; direct JSON reply uses one round-trip", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({ reply: "From context only.", proposedActions: [] }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(minimalAssistantContext(), { supabase: fakeSupabase });
    expect(out.reply).toBe("From context only.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      tools?: unknown[];
      response_format?: unknown;
    };
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools!.length).toBeGreaterThan(0);
    expect(body.response_format).toBeUndefined();
    expect(lookupExecuteMock).not.toHaveBeenCalled();
  });

  it("with supabase: tool_calls then final JSON uses second request with json_object (no tool_choice without tools)", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      const n = fetchMock.mock.calls.length;
      if (n === 1) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_1",
                        type: "function",
                        function: {
                          name: "operator_lookup_projects",
                          arguments: JSON.stringify({ query: "Como" }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({ reply: "Resolved via tool.", proposedActions: [] }),
                },
              },
            ],
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const ctx = minimalAssistantContext({ queryText: "Which project is Como?" });
    const out = await completeOperatorStudioAssistantLlm(ctx, { supabase: fakeSupabase });
    expect(out.reply).toBe("Resolved via tool.");
    expect(out.readOnlyLookupToolTrace).toEqual([{ name: "operator_lookup_projects", ok: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as Record<string, unknown>;
    expect(first.tools).toBeDefined();
    expect(first.response_format).toBeUndefined();

    const second = JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body)) as Record<string, unknown>;
    expect(second.response_format).toEqual({ type: "json_object" });
    expect(second.tools).toBeUndefined();
    expect(second.tool_choice).toBeUndefined();

    expect(lookupExecuteMock).toHaveBeenCalledTimes(1);
    const execArgs = lookupExecuteMock.mock.calls[0]!;
    expect(execArgs[1]).toBe("p1");
    expect(execArgs[3]).toBe("operator_lookup_projects");
  });

  it("Slice 3: with supabase, name-in-text project question can be routed to operator_lookup_projects (mocked model)", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_beaumont",
                        type: "function",
                        function: {
                          name: "operator_lookup_projects",
                          arguments: JSON.stringify({ query: "Beaumont" }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({ reply: "Here is what I found for Beaumont.", proposedActions: [] }),
                },
              },
            ],
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({ queryText: "Tell me about the Beaumont booking" }),
      { supabase: fakeSupabase },
    );
    expect(out.reply).toContain("Beaumont");
    expect(lookupExecuteMock).toHaveBeenCalledTimes(1);
    const execArgs = lookupExecuteMock.mock.calls[0]!;
    expect(execArgs[3]).toBe("operator_lookup_projects");
    const first = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      messages: { role: string; content: string }[];
    };
    expect(first.messages[0]!.content).toMatch(/Beaumont/);
  });

  it("Slice 3: with supabase, focused projectId in scope + deep field question is compatible with operator_lookup_project_details (mocked model)", async () => {
    const wid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_detail",
                        type: "function",
                        function: {
                          name: "operator_lookup_project_details",
                          arguments: JSON.stringify({ projectId: wid }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: "The venue on file is Big Sur Lodge.",
                    proposedActions: [],
                  }),
                },
              },
            ],
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({
        queryText: "What's the venue for this project?",
        focusedWeddingId: wid,
        focusedProjectSummary: {
          projectId: wid,
          projectType: "wedding",
          stage: "booked",
          displayTitle: "A & B",
        },
        focusedProjectRowHints: {
          location: "",
          wedding_date: null,
          event_start_date: null,
          event_end_date: null,
        },
      }),
      { supabase: fakeSupabase },
    );
    expect(out.readOnlyLookupToolTrace).toEqual([{ name: "operator_lookup_project_details", ok: true }]);
    expect(lookupExecuteMock).toHaveBeenCalledTimes(1);
    const execArgs = lookupExecuteMock.mock.calls[0]!;
    expect(execArgs[3]).toBe("operator_lookup_project_details");
    expect(String(execArgs[4])).toContain(wid);
    const first = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      messages: { role: string; content: string }[];
    };
    expect(first.messages[0]!.content).toMatch(/Project CRM.*Slice 3|venue.*summary|operator_lookup_project_details/);
    expect(first.messages[1]!.content).toContain("Focused project (summary");
    expect(first.messages[1]!.content).toContain(wid);
  });

  it("Slice 5: no-supabase path — commercial focused project: discipline cues in messages, safe mock reply passes anti-bleed", async () => {
    const projectId = "a0eebc99-9c0b-4ef8-8bb2-222222222222";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply:
                    "The open balance is not in this context — use **operator_lookup_project_details** for the Nocera commercial record.",
                  proposedActions: [],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryText = "What is the open trade balance for this project?";
    const ctx = minimalAssistantContext({
      queryText,
      focusedWeddingId: projectId,
      focusedProjectSummary: {
        projectId,
        projectType: "commercial",
        stage: "booked",
        displayTitle: "Nocera brand",
      },
      focusedProjectRowHints: {
        location: "Milan",
        wedding_date: null,
        event_start_date: null,
        event_end_date: null,
      },
    });
    const out = await completeOperatorStudioAssistantLlm(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
    const system = body.messages[0]!.content;
    const user = body.messages[1]!.content;
    expect(system).toMatch(/Project type discipline \(Slice 5\)/);
    expect(system).toMatch(/projectType|commercial|wedding|video|other/i);
    expect(user).toContain("**projectType:** commercial");
    expect(user).toContain("Nocera brand");

    expectReplyNoWeddingBleedUnlessInOperatorQuery(out.reply, queryText);
  });

  it("Slice 5: no-supabase path — other with query-resolved project facts, mock reply passes anti-bleed", async () => {
    const projectId = "a0eebc99-9c0b-4ef8-8bb2-333333333333";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply:
                    "Per the resolved facts, this is a small-event (**other**) project in inquiry. Use project details for the full file.",
                  proposedActions: [],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryText = "What stage is the Matera small-event project in?";
    const queryResolvedFacts: AssistantFocusedProjectFacts = {
      weddingId: projectId,
      couple_names: "Garcia family",
      stage: "inquiry",
      project_type: "other",
      wedding_date: null,
      event_start_date: null,
      event_end_date: null,
      location: "Matera",
      package_name: null,
      contract_value: null,
      balance_due: null,
      story_notes: null,
      package_inclusions: [],
      people: [],
      contactPoints: [],
      counts: { openTasks: 0, openEscalations: 0, pendingApprovalDrafts: 0 },
    };
    const ctx = minimalAssistantContext({
      queryText,
      focusedWeddingId: projectId,
      focusedProjectSummary: {
        projectId,
        projectType: "other",
        stage: "inquiry",
        displayTitle: "Matera fam gathering",
      },
      focusedProjectRowHints: {
        location: "Matera",
        wedding_date: null,
        event_start_date: null,
        event_end_date: null,
      },
      operatorQueryEntityResolution: {
        didRun: true,
        weddingSignal: "unique",
        uniqueWeddingId: projectId,
        weddingCandidates: [],
        personMatches: [],
        queryResolvedProjectFacts: queryResolvedFacts,
      },
    });

    const result = await completeOperatorStudioAssistantLlm(ctx);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
    expect(body.messages[0]!.content).toMatch(/Project type discipline \(Slice 5\)/);
    const user = body.messages[1]!.content;
    expect(user).toMatch(/Query-resolved project facts/);
    expect(user).toMatch(/Slice 5/);
    expect(user).toMatch(/\bother\b/i);

    expectReplyNoWeddingBleedUnlessInOperatorQuery(result.reply, queryText);
  });

  it("Slice 5: anti-bleed does not fail when the operator’s query already used a banned term", async () => {
    const projectId = "a0eebc99-9c0b-4ef8-8bb2-222222222222";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "I don’t have whether the couple confirmed from this context alone.",
                  proposedActions: [],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryText = "Did the couple confirm the Milan shoot?";
    const ctx = minimalAssistantContext({
      queryText,
      focusedWeddingId: projectId,
      focusedProjectSummary: {
        projectId,
        projectType: "commercial",
        stage: "booked",
        displayTitle: "Nocera brand",
      },
      focusedProjectRowHints: {
        location: "Milan",
        wedding_date: null,
        event_start_date: null,
        event_end_date: null,
      },
    });
    const out = await completeOperatorStudioAssistantLlm(ctx);
    expect(out.reply).toMatch(/\bcouple\b/i);
    expectReplyNoWeddingBleedUnlessInOperatorQuery(out.reply, queryText);
  });

  const carryForwardForProjectPointer = (projectId: string): OperatorAnaCarryForwardForLlm => ({
    lastDomain: "projects",
    lastFocusedProjectId: projectId,
    lastFocusedProjectType: "wedding",
    lastMentionedPersonId: null,
    lastThreadId: null,
    lastEntityAmbiguous: false,
    ageSeconds: 15,
    advisoryHint: { likelyFollowUp: true, reason: "short_cue_detected", confidence: "medium" },
  });

  it("Slice 7 — two-turn: terse “when is it?” uses project_details with carried projectId (no resolver)", async () => {
    const wid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_cf",
                        type: "function",
                        function: {
                          name: "operator_lookup_project_details",
                          arguments: JSON.stringify({ projectId: wid }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: "The event date in CRM is 2026-08-20.",
                    proposedActions: [],
                  }),
                },
              },
            ],
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({
        queryText: "when is it?",
        carryForward: carryForwardForProjectPointer(wid),
      }),
      { supabase: fakeSupabase },
    );
    expect(out.reply).toMatch(/2026-08-20/);
    expect(out.readOnlyLookupToolTrace).toEqual([{ name: "operator_lookup_project_details", ok: true }]);
    const exec = lookupExecuteMock.mock.calls[0]!;
    expect(exec[3]).toBe("operator_lookup_project_details");
    expect(String(exec[4])).toContain(wid);
    const fa = out.readOnlyLookupToolOutcomes![0]!.functionArguments;
    expect(fa).toBeDefined();
    expect(fa).toContain(wid);
    const first = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      messages: { content: string }[];
    };
    expect(first.messages[1]!.content).toMatch(/## Carry-forward pointer/);
    expect(first.messages[1]!.content).toContain(wid);
    const h = inferLlmHandlerUsingPointerHeuristic(
      carryForwardForProjectPointer(wid),
      out.readOnlyLookupToolOutcomes!,
    );
    expect(h.value).toBe(true);
    expect(h.note).toBe("project_details_arg_matches_pointer_no_resolver");
  });

  it("Slice 7 — “did they email too?”: threads only is compatible (no project resolver; heuristic on)", async () => {
    const wid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_th",
                        type: "function",
                        function: {
                          name: "operator_lookup_threads",
                          arguments: JSON.stringify({ query: "last email" }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: "Here are the recent thread rows (metadata only).",
                    proposedActions: [],
                  }),
                },
              },
            ],
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const cf: OperatorAnaCarryForwardForLlm = {
      lastDomain: "threads",
      lastFocusedProjectId: wid,
      lastFocusedProjectType: "wedding",
      lastMentionedPersonId: null,
      lastThreadId: "c0eebc99-9c0b-4ef8-8bb2-333333333333",
      lastEntityAmbiguous: false,
      ageSeconds: 8,
      advisoryHint: { likelyFollowUp: true, reason: "short_cue_detected", confidence: "medium" },
    };
    const out = await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({ queryText: "did they email too?", carryForward: cf }),
      { supabase: fakeSupabase },
    );
    expect(lookupExecuteMock).toHaveBeenCalledTimes(1);
    const exec = lookupExecuteMock.mock.calls[0]!;
    expect(exec[3]).toBe("operator_lookup_threads");
    expect(out.readOnlyLookupToolTrace).toEqual([{ name: "operator_lookup_threads", ok: true }]);
    expect(lookupExecuteMock.mock.calls.filter((c) => c[3] === "operator_lookup_projects")).toHaveLength(0);
    const h = inferLlmHandlerUsingPointerHeuristic(cf, out.readOnlyLookupToolOutcomes!);
    expect(h.value).toBe(true);
    expect(h.note).toBe("threads_lookup_without_project_resolver_with_pointer_ids");
  });

  it("Slice 7 — prior ambiguity stays visible in the carry-forward user block when still vague (no tool)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reply: "I still need you to pick which project you mean.",
                  proposedActions: [],
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const cf: OperatorAnaCarryForwardForLlm = {
      lastDomain: "projects",
      lastFocusedProjectId: null,
      lastFocusedProjectType: null,
      lastMentionedPersonId: null,
      lastThreadId: null,
      lastEntityAmbiguous: true,
      ageSeconds: 5,
      advisoryHint: { likelyFollowUp: true, reason: "short_cue_detected", confidence: "low" },
    };
    await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({ queryText: "which one?", carryForward: cf }),
      { supabase: fakeSupabase },
    );
    const first = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      messages: { content: string }[];
    };
    const user = first.messages[1]!.content;
    expect(user).toMatch(/## Carry-forward pointer/);
    expect(user).toMatch(/"lastEntityAmbiguous":\s*true/);
  });

  it("Slice 7 — explicit new entity: resolver run counts as fresh resolution, not pointer-reuse (heuristic off)", async () => {
    const oldWid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: "call_res",
                        type: "function",
                        function: {
                          name: "operator_lookup_projects",
                          arguments: JSON.stringify({ query: "Nocera commercial" }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    reply: "Resolved the Nocera commercial record.",
                    proposedActions: [],
                  }),
                },
              },
            ],
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const cf = carryForwardForProjectPointer(oldWid);
    const out = await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({
        queryText: "What about the Nocera commercial job instead?",
        carryForward: cf,
      }),
      { supabase: fakeSupabase },
    );
    expect(out.readOnlyLookupToolTrace).toEqual([{ name: "operator_lookup_projects", ok: true }]);
    const exec = lookupExecuteMock.mock.calls[0]!;
    expect(exec[3]).toBe("operator_lookup_projects");
    expect(String(exec[4])).toContain("Nocera");
    const h = inferLlmHandlerUsingPointerHeuristic(cf, out.readOnlyLookupToolOutcomes!);
    expect(h.value).toBe(false);
    expect(h.note).toBe("no_project_detail_or_thread_pattern_matches");
  });

  it("Slice 7 — project_details after resolver in the same turn does not count as pointer-only (heuristic off)", async () => {
    const wid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      { id: "a", type: "function", function: { name: "operator_lookup_projects", arguments: JSON.stringify({ query: "x" }) } },
                      { id: "b", type: "function", function: { name: "operator_lookup_project_details", arguments: JSON.stringify({ projectId: wid }) } },
                    ],
                  },
                },
              ],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({ reply: "ok", proposedActions: [] }),
                },
              },
            ],
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const cf = carryForwardForProjectPointer(wid);
    const out = await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({ queryText: "and the venue?", carryForward: cf }),
      { supabase: fakeSupabase },
    );
    const h = inferLlmHandlerUsingPointerHeuristic(cf, out.readOnlyLookupToolOutcomes!);
    expect(h.value).toBe(false);
    expect(h.note).toBe("project_details_with_resolver_same_turn");
  });

  it("Slice 7 — first turn: no carry-forward block in user message (regression)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({ reply: "Hello.", proposedActions: [] }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await completeOperatorStudioAssistantLlm(
      minimalAssistantContext({ queryText: "status of the pipeline" }),
      { supabase: fakeSupabase },
    );
    const first = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      messages: { content: string }[];
    };
    expect(first.messages[1]!.content).not.toMatch(/## Carry-forward pointer/);
  });
});

const sseTe = new TextEncoder();
function dataLineFromObj(obj: unknown) {
  return "data: " + JSON.stringify(obj) + "\n";
}
function openAiSseFromLines(
  dataLines: string[],
): Response {
  return new Response(
    new ReadableStream({
      start(c) {
        for (const l of dataLines) {
          c.enqueue(sseTe.encode(l));
        }
        c.enqueue(sseTe.encode("data: [DONE]\n"));
        c.close();
      },
    }),
  );
}
function deltaLine(content: string) {
  return dataLineFromObj({ choices: [{ index: 0, delta: { content } }] });
}
function deltaLineTools(
  tool_calls: Array<{
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>,
) {
  return dataLineFromObj({ choices: [{ index: 0, delta: { tool_calls } }] });
}

describe("completeOperatorStudioAssistantLlmStreaming (mocked OpenAI stream)", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key-slice2";
    lookupExecuteMock.mockReset();
    lookupExecuteMock.mockResolvedValue(
      JSON.stringify({ tool: "operator_lookup_projects", result: { mocked: true } }),
    );
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    vi.restoreAllMocks();
  });
  it("1. no-tools path streams reply deltas; final parse matches", async () => {
    const finalJson = { reply: "Streamed line", proposedActions: [] };
    const full = JSON.stringify(finalJson);
    const mid = Math.max(1, Math.floor(full.length / 2));
    const a = full.slice(0, mid);
    const b = full.slice(mid);
    const fetchMock = vi.fn().mockImplementation(() =>
      openAiSseFromLines([deltaLine(a), deltaLine(b)]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const toks: string[] = [];
    const out = await completeOperatorStudioAssistantLlmStreaming(
      minimalAssistantContext(),
      {},
      (d) => toks.push(d),
    );
    expect(out.reply).toBe("Streamed line");
    expect(toks.length).toBeGreaterThan(0);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as { stream?: boolean };
    expect(body.stream).toBe(true);
  });

  it("2. tool path: no tokens on first pass (tools only), second pass streams", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return openAiSseFromLines([
          deltaLineTools([
            { index: 0, id: "call_1", type: "function", function: { name: "operator_lookup_projects", arguments: "" } },
          ]),
          dataLineFromObj({ choices: [{ index: 0, delta: { content: "ignored" } }] }),
          deltaLineTools([{ index: 0, function: { arguments: JSON.stringify({ query: "C" }) } }]),
        ]);
      }
      return openAiSseFromLines([
        deltaLine(JSON.stringify({ reply: "After tool.", proposedActions: [] }).slice(0, 4)),
        deltaLine(
          JSON.stringify({ reply: "After tool.", proposedActions: [] }).slice(4),
        ),
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const toks: string[] = [];
    const out = await completeOperatorStudioAssistantLlmStreaming(
      minimalAssistantContext({ queryText: "Which project is Como?" }),
      { supabase: fakeSupabase },
      (d) => toks.push(d),
    );
    expect(out.reply).toBe("After tool.");
    expect(lookupExecuteMock).toHaveBeenCalledTimes(1);
    expect(toks.length).toBeGreaterThan(0);
    const joined = toks.join("");
    expect(joined).toMatch(/After tool/);
    expect(joined).not.toContain("ignored");
  });

  it("2b. final json pass: tool_calls with only null parts (placeholders) must not block streaming later content to onToken", async () => {
    const finalJson = { reply: "Recovered from placeholder tool row", proposedActions: [] as unknown[] };
    const full = JSON.stringify(finalJson);
    const mid = Math.max(1, Math.floor(full.length * 0.4));
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return openAiSseFromLines([
          deltaLineTools([
            { index: 0, id: "call_1", type: "function", function: { name: "operator_lookup_projects", arguments: "" } },
          ]),
          deltaLineTools([{ index: 0, function: { arguments: JSON.stringify({ query: "C" }) } }]),
        ]);
      }
      return openAiSseFromLines([
        dataLineFromObj({ choices: [{ index: 0, delta: { tool_calls: [null] } }] }),
        deltaLine(full.slice(0, mid)),
        deltaLine(full.slice(mid)),
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const toks: string[] = [];
    const out = await completeOperatorStudioAssistantLlmStreaming(
      minimalAssistantContext({ queryText: "Which project is Como?" }),
      { supabase: fakeSupabase },
      (d) => toks.push(d),
    );
    expect(out.reply).toBe("Recovered from placeholder tool row");
    expect(lookupExecuteMock).toHaveBeenCalledTimes(1);
    expect(toks.length).toBeGreaterThan(0);
    const joined = toks.join("");
    expect(joined).toContain("Recovered from placeholder");
  });

  it("3. first pass: zero content before tools — no onToken during pass one", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return openAiSseFromLines([
          deltaLineTools([
            { index: 0, id: "c1", type: "function", function: { name: "operator_lookup_projects", arguments: "" } },
          ]),
          deltaLineTools([{ index: 0, function: { arguments: JSON.stringify({ query: "x" }) } }]),
        ]);
      }
      return openAiSseFromLines([deltaLine(JSON.stringify({ reply: "Y", proposedActions: [] }))]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const toks: string[] = [];
    await completeOperatorStudioAssistantLlmStreaming(
      minimalAssistantContext(),
      { supabase: fakeSupabase },
      (d) => toks.push(d),
    );
    expect(toks.join("")).toBe("Y");
  });

  it("3b. first pass: content chunks before tool_calls — no first-pass text reaches onToken; only final pass streams", async () => {
    const preToolLeakA = "SHOULD_NOT_STREAM_A";
    const preToolLeakB = "SHOULD_NOT_STREAM_B";
    const finalReply = "Visible after tools";
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return openAiSseFromLines([
          deltaLine(preToolLeakA),
          deltaLine(preToolLeakB),
          deltaLineTools([
            { index: 0, id: "call_pretool", type: "function", function: { name: "operator_lookup_projects", arguments: "" } },
          ]),
          deltaLineTools([{ index: 0, function: { arguments: JSON.stringify({ query: "q" }) } }]),
        ]);
      }
      return openAiSseFromLines([deltaLine(JSON.stringify({ reply: finalReply, proposedActions: [] }))]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const toks: string[] = [];
    const out = await completeOperatorStudioAssistantLlmStreaming(
      minimalAssistantContext({ queryText: "lookup something" }),
      { supabase: fakeSupabase },
      (d) => toks.push(d),
    );
    const joined = toks.join("");
    expect(joined).not.toContain(preToolLeakA);
    expect(joined).not.toContain(preToolLeakB);
    expect(out.reply).toBe(finalReply);
    expect(joined).toContain(finalReply);
    expect(lookupExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("4. malformed final JSON: same non-JSON fallback as parseOperatorStudioAssistantLlmResponse", async () => {
    const bad = "not valid json {";
    const expected = parseOperatorStudioAssistantLlmResponse(bad);
    const fetchMock = vi.fn().mockImplementation(() => openAiSseFromLines([deltaLine(bad)]));
    vi.stubGlobal("fetch", fetchMock);
    const out = await completeOperatorStudioAssistantLlmStreaming(minimalAssistantContext(), {}, () => {});
    expect(out.reply).toBe(expected.reply);
    expect(out.proposedActions).toEqual(expected.proposedActions);
  });

  it("5. legacy one-shot request does not set stream: true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: JSON.stringify({ reply: "k", proposedActions: [] }) } }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await completeOperatorStudioAssistantLlm(minimalAssistantContext());
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as { stream?: boolean };
    expect(body.stream).toBeUndefined();
  });
});

describe("offerBuilderSpecialistModeSystemAddendum (S2)", () => {
  it("is empty when no specialist focus", () => {
    expect(offerBuilderSpecialistModeSystemAddendum(minimalAssistantContext())).toBe("");
  });

  it("names pinned project id and bounded proposal rules", () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const add = offerBuilderSpecialistModeSystemAddendum(
      minimalAssistantContext({
        offerBuilderSpecialistFocus: {
          pinnedProjectId: pid,
          toolPayload: { selectionNote: "ok", didRun: true },
        },
      }),
    );
    expect(add).toContain("Offer builder specialist mode (S2)");
    expect(add).toContain(pid);
    expect(add).toContain("offer_builder_change_proposal");
    expect(add).toContain("never");
  });
});

describe("investigationModeSystemAddendum (S4)", () => {
  it("is empty when no investigation focus", () => {
    expect(investigationModeSystemAddendum(minimalAssistantContext())).toBe("");
  });

  it("describes evidence-first investigation and tool budget", () => {
    const add = investigationModeSystemAddendum(
      minimalAssistantContext({
        investigationSpecialistFocus: { toolPayload: { mode: "deep_search_investigation_v1" } },
      }),
    );
    expect(add).toContain("Deep search / investigation mode (S4)");
    expect(add).toContain("evidence-first");
    expect(add).toContain("5");
  });
});

describe("playbookAuditModeSystemAddendum (S5)", () => {
  it("is empty when no playbook audit focus", () => {
    expect(playbookAuditModeSystemAddendum(minimalAssistantContext())).toBe("");
  });

  it("describes audit lane and playbook_rule_candidate-only writes", () => {
    const add = playbookAuditModeSystemAddendum(
      minimalAssistantContext({
        playbookAuditSpecialistFocus: { toolPayload: { mode: "rule_authoring_audit_v1" } },
      }),
    );
    expect(add).toContain("Rule authoring / audit mode (S5)");
    expect(add).toContain("playbook_rule_candidate");
    expect(add).toContain("playbook_rules");
  });
});

describe("bulkTriageModeSystemAddendum (S6)", () => {
  it("is empty when no bulk triage focus", () => {
    expect(bulkTriageModeSystemAddendum(minimalAssistantContext())).toBe("");
  });

  it("describes queue triage and one proposal cap", () => {
    const add = bulkTriageModeSystemAddendum(
      minimalAssistantContext({
        bulkTriageSpecialistFocus: { toolPayload: { mode: "bulk_triage_queue_v1" } },
      }),
    );
    expect(add).toContain("Bulk queue triage mode (S6)");
    expect(add).toContain("At most one");
    expect(add).toContain("4");
  });
});

describe("invoiceSetupSpecialistModeSystemAddendum (S3)", () => {
  it("is empty when no invoice specialist focus", () => {
    expect(invoiceSetupSpecialistModeSystemAddendum(minimalAssistantContext())).toBe("");
  });

  it("mentions invoice setup specialist and bounded template proposals", () => {
    const add = invoiceSetupSpecialistModeSystemAddendum(
      minimalAssistantContext({
        invoiceSetupSpecialistFocus: {
          toolPayload: { selectionNote: "ok", didRun: true },
        },
      }),
    );
    expect(add).toContain("Invoice setup specialist mode (S3)");
    expect(add).toContain("invoice_setup_change_proposal");
    expect(add).toContain("logoDataUrl");
  });
});
