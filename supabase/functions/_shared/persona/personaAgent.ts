import type { AgentContext } from "../../../../src/types/agent.types.ts";
import { buildPersonaAntiBrochureConstraintsSection } from "../prompts/personaAntiBrochureConstraints.ts";
import {
  buildConsultationFirstInquiryUserHintBlock,
  buildSoftCallInquiryUserHintBlock,
  PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER,
  PERSONA_SOFT_CALL_REALIZATION_SECTION_MARKER,
} from "../prompts/personaConsultationFirstRealization.ts";
import {
  buildNoCallPushEmailFirstUserHintBlock,
  PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER,
} from "../prompts/personaNoCallPushRealization.ts";
import {
  buildWeakAvailabilityInquiryUserHintBlock,
  PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER,
} from "../prompts/personaWeakAvailabilityRealization.ts";
import { BUDGET_STATEMENT_PLACEHOLDER } from "../orchestrator/budgetStatementInjection.ts";
import {
  INQUIRY_REPLY_BOOKING_PROCESS_FORBIDDEN_MARKER,
  INQUIRY_REPLY_CONSULTATION_FIRST_CALL_MARKER,
  INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER,
  INQUIRY_REPLY_SOFT_CALL_CTA_MARKER,
  INQUIRY_REPLY_STRATEGY_SECTION_TITLE,
  INQUIRY_REPLY_WEAK_AVAILABILITY_ONLY_MARKER,
} from "../orchestrator/deriveInquiryReplyPlan.ts";
import { buildPersonaStyleExamplesPromptSection } from "../prompts/personaStudioVoiceExamples.ts";
import { PERSONA_STRICT_STUDIO_BUSINESS_RULES } from "../prompts/personaStudioRules.ts";
import {
  anthropicMessagesHeadersWithPromptCaching,
  cachedEphemeralSystemBlocks,
} from "./anthropicPromptCache.ts";
import { logModelInvocation } from "../telemetry/modelInvocationLog.ts";
import { truncatePersonaOrchestratorFactsForModel } from "./personaAgentA5Budget.ts";
import { fetchWithTimeout } from "../http/fetchWithTimeout.ts";

/**
 * Reinforces first-pass compliance when **BUDGET STATEMENT SLOT** is active (same token as injector contract).
 * Exported for prompt-building tests.
 */
export const PERSONA_BUDGET_CRITICAL_FORMATTING_USER_HINT_LINE =
  `[CRITICAL FORMATTING]: You MUST output the exact token ${BUDGET_STATEMENT_PLACEHOLDER} immediately following your opening hospitality sentence. Do not write any transition words before it.`;

/**
 * execute_v3 Phase 6.5 Step 6.5C — writer/persona **input boundary** (what may reach the model).
 *
 * Upstream may pass a full `AgentContext` for routing; this module sends:
 * - **orchestratorFacts user block** — approved assembly from `maybeRewriteOrchestratorDraftWithPersona` (Authoritative CRM,
 *   compact continuity, optional `briefing_voice_v1` excerpt from `globalKnowledge`, client inbound, playbook excerpts). Not raw `AgentContext` dumps.
 * - **narrow personalization** — CRM mirror for tone (aligns with CRM snapshot on context)
 * - **limited continuity memory** — memory *headers* only, capped (not `selectedMemories` / full `globalKnowledge`)
 *
 * `rawMessage`, full `recentMessages`, and `threadSummary` are not passed separately—they are embedded in
 * orchestratorFacts when the rewrite path runs. `selectedMemories` and unexcerpted `globalKnowledge` stay excluded.
 */

/** Max memory header rows for continuity hints — not a substitute for verified facts. */
const PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4;

/** execute_v3 Step 6.5F — cap header summary length so writer prompts do not embed unbounded PII text. */
const PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200;

function truncateWriterHint(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

export type PersonaNarrowPersonalization = {
  coupleNames: string | null;
  location: string | null;
  weddingDate: string | null;
};

export type PersonaWriterInputBoundary = {
  narrowPersonalization: PersonaNarrowPersonalization;
  /** Memory header scan only — capped; summaries are hints, not verified facts. */
  limitedContinuityMemoryHeaders: Array<{ title: string; summary: string }>;
};

function extractPersonaWriterBoundary(ctx: AgentContext): PersonaWriterInputBoundary {
  const snap = ctx.crmSnapshot;
  const couple =
    typeof snap.couple_names === "string" && snap.couple_names.trim().length > 0
      ? snap.couple_names.trim()
      : null;
  const location =
    typeof snap.location === "string" && snap.location.trim().length > 0 ? snap.location.trim() : null;
  const weddingDate =
    typeof snap.wedding_date === "string" && snap.wedding_date.trim().length > 0
      ? snap.wedding_date.trim()
      : null;

  const limitedContinuityMemoryHeaders = ctx.memoryHeaders
    .slice(0, PERSONA_LIMITED_CONTINUITY_HEADER_MAX)
    .map((m) => ({
      title: m.title,
      summary: truncateWriterHint(m.summary, PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT),
    }));

  return {
    narrowPersonalization: { coupleNames: couple, location, weddingDate: weddingDate },
    limitedContinuityMemoryHeaders,
  };
}

/**
 * Persona drafting: **raw `fetch` to Messages API only**.
 * Do not use the Anthropic SDK or `/v1/complete` — Claude 3.x models 404 on Completions.
 */
const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  /** Already parsed object — not model-authored JSON text (transport-safe). */
  input: Record<string, unknown>;
};
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | { type: string; [key: string]: unknown };

type AnthropicMessagesResponse = {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
};

function extractAssistantText(response: AnthropicMessagesResponse): string {
  const blocks = response.content ?? [];
  return blocks
    .filter((b): b is AnthropicTextBlock => b.type === "text" && typeof (b as AnthropicTextBlock).text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Anthropic Messages `submit_persona_draft` tool — primary structured output path (no JSON.parse on model text). */
export const SUBMIT_PERSONA_DRAFT_TOOL_NAME = "submit_persona_draft";

const SUBMIT_PERSONA_DRAFT_TOOL = {
  name: SUBMIT_PERSONA_DRAFT_TOOL_NAME,
  description:
    "Submit the client-facing email and the deterministic committed_terms audit contract. " +
    "Use **one string per paragraph** in email_draft_lines. The runtime joins array elements with **blank lines**—so to get a real-email look, you **must** use **multiple elements** when the greeting, intro, and body are separate paragraphs. " +
    "**First-touch default:** element 0 = greeting line only (e.g. \"Hi Elena & Marco,\"); element 1 = Ana intro (e.g. \"My name is Ana, and I'm the client manager at …\"); then short body paragraphs—**never** put \"Hi …, My name is Ana\" in a single element. " +
    "Newlines inside one element are collapsed to spaces—do not rely on line breaks inside a string for layout.",
  input_schema: {
    type: "object",
    properties: {
      email_draft_lines: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        description:
          "Each string is one email paragraph. For first-touch: [0] greeting line alone, [1] intro line(s), then substance—do not merge greeting + intro into one string.",
      },
      committed_terms: {
        type: "object",
        description: "Honest audit contract for downstream deterministic verification.",
        properties: {
          package_names: {
            type: "array",
            items: { type: "string" },
            description: "Studio package/collection names treated as confirmed facts; empty if hedged only.",
          },
          deposit_percentage: {
            description: "Deposit/retainer percent 0–100, or null if none committed.",
            type: ["number", "null"],
          },
          travel_miles_included: {
            description: "Included travel radius in miles, or null if none committed.",
            type: ["number", "null"],
          },
        },
        required: ["package_names", "deposit_percentage", "travel_miles_included"],
      },
    },
    required: ["email_draft_lines", "committed_terms"],
  },
};

/**
 * Full system prompt for persona Messages calls (orchestrator + legacy paths).
 * Includes Ana style examples (non-factual) plus anti-brochure constraints; exported for tests to verify wiring.
 */
export function buildPersonaSystemPrompt(boundary: PersonaWriterInputBoundary): string {
  const { narrowPersonalization: np, limitedContinuityMemoryHeaders } = boundary;

  const memoryLines = limitedContinuityMemoryHeaders.map((m) => `- ${m.title}: ${m.summary}`);

  const toneContext = [
    np.coupleNames ? `Couple: ${np.coupleNames}` : null,
    np.location ? `Location: ${np.location}` : null,
    np.weddingDate ? `Wedding date: ${np.weddingDate}` : null,
    memoryLines.length > 0
      ? `Continuity memory (header summaries only, max ${PERSONA_LIMITED_CONTINUITY_HEADER_MAX}):\n${memoryLines.join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    PERSONA_STRICT_STUDIO_BUSINESS_RULES,
    "",
    "You are Ana — the studio’s **client manager** on email: simple, direct, lightly warm, **operational** (scheduling, files, payments, clear answers). Sound like the real human who runs the inbox—not a chatbot, abstract luxury brand voice, or generic CRM assistant. Factual and policy constraints below always govern what you may claim.",
    "**Anti-mirroring:** Do **not** chain the client’s own aesthetic descriptors (elegant, natural, editorial…) into a polished summary, or restate their \"vibe\" in back-to-back sentences. Acknowledge briefly, then give substance, a constraint, or **one** practical question—not a reflective echo of their wording.",
    "**Voice precedence:** (1) Grounding / verified truth in the user message. (2) **CRITICAL STYLE CONSTRAINTS**—bans abstract luxury and generic-AI filler; keeps unverified-offering discipline. (3) **Style examples** next—real operator cadence (see `docs/v3/ANA_OPERATOR_VOICE_PRECEDENCE.md`). (4) If the user message includes a **briefing_voice_v1** excerpt, use it only when it **fits** (2) and (3); never let onboarding wording override real operator tone or facts.",
    "",
    buildPersonaStyleExamplesPromptSection().trimEnd(),
    "",
    buildPersonaAntiBrochureConstraintsSection().trimEnd(),
    "",
    `No-call-push inquiry: when the approved facts include ${INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER}, follow ${PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER} in the user message—email-first; do not steer to a call or “conversation” as the best next move unless the client already asked to talk live.`,
    "",
    `Consultation / call CTA inquiry: when the approved facts include a soft-call marker, follow ${PERSONA_SOFT_CALL_REALIZATION_SECTION_MARKER} in the user message (call as optional only). When they include ${PERSONA_CONSULTATION_FIRST_REALIZATION_SECTION_MARKER} (direct call CTA), that block tightens prose—human invitation, not stacked booking template; do not quote the [INQUIRY_ONBOARDING] example verbatim.`,
    "",
    `Weak availability inquiry: when the approved user message contains ${PERSONA_WEAK_AVAILABILITY_REALIZATION_SECTION_MARKER} (weak playbook support for booking detail), that block is mandatory—availability confirmation only, no retainer/deposit/contract/%/calendar funnel; keep committed_terms empty/null as instructed.`,
    "",
    "The user message is orchestrator-approved. When it includes **=== Authoritative CRM (verified tenant record) ===**, treat couple_names, wedding_date, location, stage, and contract_value there as verified CRM facts.",
    "Those CRM fields take priority over conflicting implications in the **Client inbound** section (for example: do not invent or substitute a different calendar month, day, or region than wedding_date/location in Authoritative CRM).",
    "Continuity sections are for thread context only—they do not override Authoritative CRM or playbook policy.",
    "Deposit/retainer/payment percentages for all outbound drafts are governed by the **GLOBAL FINANCIAL GROUNDING** block in the anti-brochure constraints above (verified CRM/playbook digits only).",
    "If the user message includes **NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT** or **UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT** under Explicit unknown / do-not-assert signals, you must not output any specific retainer/deposit/booking percentage—use deferral or contract-verification language with **no percentage digits** (reinforces the same rule when those flags are present).",
    "Never treat a distance (miles/km) as a percent: if **UNKNOWN_POLICY_TRAVEL_RADIUS** or the no-playbook snapshot applies, do not invent mileage figures or confuse them with percentages.",
    "**Package & product guardrail:** Do not invent, confirm, or restate collection/package/product names as real studio offerings unless they appear in **Authoritative CRM** (e.g. package_name) or **Verified policy: playbook_rules** in the user message. If the client names an unverified product (e.g. a tier or \"Elite collection\"), do not mirror that label as fact—use neutral phrasing (\"the option you're considering\") and describe only verified offerings; avoid reinforcing the client's name as an official SKU.",
    "NEVER invent pricing, availability, or policy details missing from the user message. If something is not in CRM or playbook, hedge or defer.",
    "**Claim permission contract (inquiry replies):** When the user message includes **=== Claim permissions (authoritative for this turn) ===**, that block is a **hard contract**. You are **realizing** those permission levels—not deciding what is true from thread vibe. Rules: do **not** upgrade `explore` into settled studio fact; do **not** turn `defer` into a concrete claim; with `soft_confirm`, use cautious fit language only (no brochure certainty); direct factual assertions belong only in domains marked `confirm`. **Voice** (warmth, cadence, Ana tone) affects **how** you phrase **within** a level, **never** the permission level itself.",
    "**Deterministic post-audit:** After you write, the orchestrator runs **code auditors** on the final email (commercial terms, **inquiry claim permissions**, **unsupported business / availability** heuristics, etc.). Over-permission prose is **rejected** and the draft reverts to a safe placeholder—do not try to slip claims through with synonyms.",
    "",
    "Narrow personalization + memory headers below support tone; if they conflict with Authoritative CRM in the user message, prefer the user message.",
    toneContext || "(No extra tone context—still avoid inventing specifics.)",
  ].join("\n\n");
}

/** Exported for prompt-assembly regression tests. */
export function buildPersonaUserMessage(approvedFactualOutput: string): string {
  return [
    "Approved factual output — orchestrator-approved assembly (Authoritative CRM, continuity, client inbound, playbook, and orchestrator grounding guardrails as included below).",
    "Do not contradict verified sections or invent facts beyond them. Client-suggested package/collection names are not verified unless they appear in Authoritative CRM or Verified policy.",
    "When the assembly includes **Studio voice (onboarding briefing_voice_v1)**, use it for optional phrasing hints only—it does **not** authorize factual claims. If it conflicts with the system prompt’s real operator examples or anti–luxury-AI rules, **ignore the excerpt** for tone.",
    "When the assembly includes **=== Claim permissions (authoritative for this turn) ===**, that section **outranks** continuity and stylistic impulses for what you may assert—follow it exactly.",
    "",
    approvedFactualOutput.trim(),
  ].join("\n");
}

/** Appended to persona user message; exported for formatting-regression tests. */
export const PERSONA_STRUCTURED_OUTPUT_FORMAT_SUFFIX = [
  "",
  "=== OUTPUT FORMAT (mandatory) ===",
  `Call the tool \`${SUBMIT_PERSONA_DRAFT_TOOL_NAME}\` exactly once with your draft.`,
  "Do **not** rely on writing a raw JSON object in freeform assistant text — that path is brittle (illegal control characters break JSON.parse). The tool passes structured input safely.",
  "**Paragraph layout:** Each `email_draft_lines` entry is one paragraph; the runtime joins entries with a blank line. For a normal first-touch reply use **at least 3–4 entries**: (1) `Hi [Names],` **only** — same string must not also contain \"My name is Ana\"; (2) one short intro paragraph (Ana + role + studio); (3–4) one or two short body paragraphs (thanks + answer in plain words); optional last line `Ana`.",
  "Do **not** cram greeting + intro + thanks + aesthetic commentary into one paragraph string—that reads like AI polish and hides the blank line after the greeting.",
  "Do **not** fill the body with **adjective-stacking** mirrors of the inbound (lists of their style words, \"aligned with what you told us:\" + a recap of their descriptors). Prefer short acknowledgment → useful content → at most one plain follow-up question.",
  "committed_terms must honestly reflect the audit contract: package_names, deposit_percentage (0–100 or null), travel_miles_included (miles or null).",
].join("\n");

/** Legacy text-JSON fallback only — assistant prefill so a continuation can complete `{...}`. */
const ASSISTANT_JSON_OBJECT_PREFILL = "{";

export type PersonaWriterCommittedTerms = {
  package_names: string[];
  deposit_percentage: number | null;
  travel_miles_included: number | null;
};

export type PersonaWriterStructuredOutput = {
  /** Joined client-facing body (paragraphs separated by \\n\\n). */
  email_draft: string;
  committed_terms: PersonaWriterCommittedTerms;
};

function normalizeParagraphLine(s: string): string {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCommittedTermsObject(ct: unknown): PersonaWriterCommittedTerms {
  if (!ct || typeof ct !== "object") {
    throw new Error("personaAgent: missing committed_terms");
  }
  const ctr = ct as Record<string, unknown>;
  const package_names = Array.isArray(ctr.package_names)
    ? ctr.package_names.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  let deposit_percentage: number | null = null;
  if (ctr.deposit_percentage !== null && ctr.deposit_percentage !== undefined) {
    const n = Number(ctr.deposit_percentage);
    if (Number.isFinite(n)) deposit_percentage = n;
  }
  let travel_miles_included: number | null = null;
  if (ctr.travel_miles_included !== null && ctr.travel_miles_included !== undefined) {
    const n = Number(ctr.travel_miles_included);
    if (Number.isFinite(n)) travel_miles_included = n;
  }
  return { package_names, deposit_percentage, travel_miles_included };
}

/**
 * Validates tool input or parsed JSON object — **primary shape logic** for persona structured output.
 * Does not call JSON.parse on freeform model text (use {@link parsePersonaStructuredOutput} only for legacy fallback).
 */
export function buildPersonaWriterStructuredFromRecord(rec: Record<string, unknown>): PersonaWriterStructuredOutput {
  const ct = parseCommittedTermsObject(rec.committed_terms);

  const linesRaw = rec.email_draft_lines;
  if (Array.isArray(linesRaw) && linesRaw.length > 0) {
    const lines = linesRaw
      .map((x) => normalizeParagraphLine(String(x ?? "")))
      .filter((x) => x.length > 0);
    if (lines.length === 0) {
      throw new Error("personaAgent: email_draft_lines parsed to empty after normalization");
    }
    return {
      email_draft: lines.join("\n\n"),
      committed_terms: ct,
    };
  }

  /** Narrow legacy: single string field (valid only inside successfully parsed JSON). */
  if (typeof rec.email_draft === "string" && rec.email_draft.trim().length > 0) {
    return {
      email_draft: rec.email_draft.trim(),
      committed_terms: ct,
    };
  }

  throw new Error("personaAgent: missing email_draft_lines (non-empty string array) or legacy email_draft");
}

/**
 * Prefer `tool_use` with {@link SUBMIT_PERSONA_DRAFT_TOOL_NAME} — **no JSON.parse of assistant-authored JSON text**.
 * Exported for unit tests.
 */
export function extractPersonaStructuredFromAnthropicResponse(
  response: AnthropicMessagesResponse,
): PersonaWriterStructuredOutput {
  const blocks = response.content ?? [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as Record<string, unknown>;
    if (block.type !== "tool_use") continue;
    if (block.name !== SUBMIT_PERSONA_DRAFT_TOOL_NAME) continue;
    const input = block.input;
    if (!input || typeof input !== "object") {
      throw new Error("personaAgent: submit_persona_draft tool_use missing input");
    }
    return buildPersonaWriterStructuredFromRecord(input as Record<string, unknown>);
  }
  throw new Error("personaAgent: expected submit_persona_draft tool_use in Anthropic response");
}

/**
 * **Legacy / debug-only:** parses persona JSON from assistant text (fragile — bad control chars in strings break JSON.parse).
 * Prefer {@link extractPersonaStructuredFromAnthropicResponse}. Exported for regression tests.
 */
export function parsePersonaStructuredOutput(rawAssistantText: string): PersonaWriterStructuredOutput {
  let t = rawAssistantText.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/m.exec(t);
  if (fence) t = fence[1]!.trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first < 0 || last <= first) {
    throw new Error("personaAgent: structured response missing JSON object");
  }
  t = t.slice(first, last + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(t) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`personaAgent: invalid structured JSON (${msg})`);
  }

  if (!parsed || typeof parsed !== "object") throw new Error("personaAgent: structured JSON not an object");
  return buildPersonaWriterStructuredFromRecord(parsed as Record<string, unknown>);
}

function combinePrefixedAssistantJson(prefill: string, continuation: string): string {
  const tail = continuation.trim();
  if (!tail) return prefill;
  if (tail.startsWith("{")) return tail;
  return `${prefill}${tail}`;
}

/**
 * Persona layer: Anthropic Messages API (`POST /v1/messages`) via native `fetch` only.
 *
 * `agentContext` may be a full graph; only {@link extractPersonaWriterBoundary} fields are sent to the model
 * besides `orchestratorFacts` (approved factual output).
 */
type RunPersonaAnthropicMessagesOptions = {
  /** Legacy text-JSON path only — conflicts with tools; ignored when `tools` is set. */
  assistantJsonPrefill?: string | null;
  /** Anthropic tool definitions (structured output). */
  tools?: ReadonlyArray<{ name: string; description: string; input_schema: Record<string, unknown> }>;
  /** Forces a specific tool (default: forced {@link SUBMIT_PERSONA_DRAFT_TOOL_NAME} when tools provided). */
  toolChoice?: { type: "tool"; name: string };
};

async function runPersonaAnthropicMessages(
  apiKey: string,
  system: string,
  userText: string,
  maxTokens: number,
  opts?: RunPersonaAnthropicMessagesOptions,
): Promise<AnthropicMessagesResponse> {
  const useTools = Boolean(opts?.tools && opts.tools.length > 0);

  logModelInvocation({
    source: "client_orchestrator_persona",
    model: "claude-haiku-4-5",
    phase: useTools ? "anthropic_messages_tool" : "anthropic_messages",
  });

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [{ role: "user", content: userText }];
  const pre = opts?.assistantJsonPrefill;
  if (!useTools && pre != null && pre.length > 0) {
    messages.push({ role: "assistant", content: pre });
  }

  const body: Record<string, unknown> = {
    model: "claude-haiku-4-5",
    max_tokens: maxTokens,
    temperature: 0.7,
    system: cachedEphemeralSystemBlocks(system),
    messages,
  };
  if (useTools) {
    body.tools = [...opts!.tools!];
    body.tool_choice = opts?.toolChoice ?? { type: "tool", name: SUBMIT_PERSONA_DRAFT_TOOL_NAME };
  }

  const res = await fetchWithTimeout(MESSAGES_URL, {
    method: "POST",
    headers: anthropicMessagesHeadersWithPromptCaching(apiKey, ANTHROPIC_VERSION),
    body: JSON.stringify(body),
    timeoutMs: 120_000,
  });

  const rawBody = await res.text();

  if (!res.ok) {
    throw new Error(`draftPersonaResponse: Anthropic API failed (${res.status}): ${rawBody}`);
  }

  let data: AnthropicMessagesResponse;
  try {
    data = JSON.parse(rawBody) as AnthropicMessagesResponse;
  } catch {
    throw new Error(`draftPersonaResponse: Invalid JSON from Anthropic: ${rawBody.slice(0, 500)}`);
  }

  console.log(JSON.stringify({ type: "persona_metrics", usage: data.usage }));
  return data;
}

/**
 * Orchestrator / clientOrchestratorV1 path: **Anthropic tool** `submit_persona_draft` → `email_draft_lines` joined to `email_draft` + `committed_terms` for deterministic audit.
 * Legacy assistant-text JSON is fallback only.
 */
export async function draftPersonaStructuredResponse(
  agentContext: AgentContext,
  orchestratorFacts: string,
): Promise<PersonaWriterStructuredOutput> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("draftPersonaStructuredResponse: Missing ANTHROPIC_API_KEY");
  }

  const writerBoundary = extractPersonaWriterBoundary(agentContext);
  const system = buildPersonaSystemPrompt(writerBoundary);
  const budgetSlotHint = orchestratorFacts.includes("BUDGET STATEMENT SLOT")
    ? [
        "",
        `If the approved facts above include **BUDGET STATEMENT SLOT**, one paragraph in email_draft_lines must contain the literal token ${BUDGET_STATEMENT_PLACEHOLDER} exactly once (the joined email body must include it). Omitting it fails automated verification.`,
        PERSONA_BUDGET_CRITICAL_FORMATTING_USER_HINT_LINE,
      ].join("\n")
    : "";
  const inquiryStrategyHint = orchestratorFacts.includes(INQUIRY_REPLY_STRATEGY_SECTION_TITLE)
    ? [
        "",
        "When the approved facts include **Approved inquiry reply strategy (authoritative)**, follow that motion and CTA as authoritative strategy (not for factual claims—facts remain only in verified CRM/playbook sections).",
      ].join("\n")
    : "";
  const availabilityBookingRestrictionHint = orchestratorFacts.includes(INQUIRY_REPLY_WEAK_AVAILABILITY_ONLY_MARKER)
    ? buildWeakAvailabilityInquiryUserHintBlock()
    : orchestratorFacts.includes(INQUIRY_REPLY_BOOKING_PROCESS_FORBIDDEN_MARKER)
      ? [
          "",
          "This turn is **availability-only** per strategy: **booking_process_words: forbidden** — do not write retainer/deposit/contract-sequence/%/payment-milestone language or a heavy consultation-plus-booking funnel; confirm availability in plain language and use at most one light generic next step.",
        ].join("\n")
      : "";
  const noCallPushVoiceHint = orchestratorFacts.includes(INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER)
    ? buildNoCallPushEmailFirstUserHintBlock()
    : "";
  const consultationFirstVoiceHint =
    orchestratorFacts.includes(INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER)
      ? ""
      : orchestratorFacts.includes(INQUIRY_REPLY_SOFT_CALL_CTA_MARKER)
        ? buildSoftCallInquiryUserHintBlock()
        : orchestratorFacts.includes(INQUIRY_REPLY_CONSULTATION_FIRST_CALL_MARKER)
          ? buildConsultationFirstInquiryUserHintBlock()
          : "";
  const factsForModel = truncatePersonaOrchestratorFactsForModel(orchestratorFacts);
  const userText =
    buildPersonaUserMessage(factsForModel) +
    budgetSlotHint +
    inquiryStrategyHint +
    availabilityBookingRestrictionHint +
    noCallPushVoiceHint +
    consultationFirstVoiceHint +
    PERSONA_STRUCTURED_OUTPUT_FORMAT_SUFFIX;

  const data = await runPersonaAnthropicMessages(apiKey, system, userText, 2048, {
    tools: [SUBMIT_PERSONA_DRAFT_TOOL],
    toolChoice: { type: "tool", name: SUBMIT_PERSONA_DRAFT_TOOL_NAME },
  });

  try {
    return extractPersonaStructuredFromAnthropicResponse(data);
  } catch (primaryErr) {
    console.warn(
      "[personaAgent] submit_persona_draft tool path failed; attempting legacy assistant-text JSON fallback:",
      primaryErr,
    );
    const tail = extractAssistantText(data);
    if (!tail) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      throw new Error(`draftPersonaStructuredResponse: ${msg} (no assistant text for fallback)`);
    }
    try {
      const combined = combinePrefixedAssistantJson(ASSISTANT_JSON_OBJECT_PREFILL, tail);
      return parsePersonaStructuredOutput(combined);
    } catch (fallbackErr) {
      const a = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const b = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(`draftPersonaStructuredResponse: tool path failed (${a}); legacy JSON failed (${b})`);
    }
  }
}

export async function draftPersonaResponse(
  agentContext: AgentContext,
  orchestratorFacts: string,
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("draftPersonaResponse: Missing ANTHROPIC_API_KEY");
  }

  const writerBoundary = extractPersonaWriterBoundary(agentContext);
  const system = buildPersonaSystemPrompt(writerBoundary);
  const factsForModel = truncatePersonaOrchestratorFactsForModel(orchestratorFacts);
  const userText = buildPersonaUserMessage(factsForModel);

  const data = await runPersonaAnthropicMessages(apiKey, system, userText, 1024);
  const text = extractAssistantText(data);
  if (!text) {
    throw new Error("draftPersonaResponse: Anthropic returned no text content");
  }

  return text;
}
