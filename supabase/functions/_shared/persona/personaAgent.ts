import type { AgentContext } from "../../../../src/types/agent.types.ts";
import { PERSONA_STRICT_STUDIO_BUSINESS_RULES } from "../prompts/personaStudioRules.ts";
import {
  anthropicMessagesHeadersWithPromptCaching,
  cachedEphemeralSystemBlocks,
} from "./anthropicPromptCache.ts";

/**
 * execute_v3 Phase 6.5 Step 6.5C — writer/persona **input boundary** (what may reach the model).
 *
 * Upstream may pass a full `AgentContext` for routing; this module sends:
 * - **orchestratorFacts user block** — approved assembly from `maybeRewriteOrchestratorDraftWithPersona` (Authoritative CRM,
 *   compact continuity, client inbound, playbook excerpts). Not raw `AgentContext` dumps.
 * - **narrow personalization** — CRM mirror for tone (aligns with CRM snapshot on context)
 * - **limited continuity memory** — memory *headers* only, capped (not `selectedMemories` / `globalKnowledge`)
 *
 * `rawMessage`, full `recentMessages`, and `threadSummary` are not passed separately—they are embedded in
 * orchestratorFacts when the rewrite path runs. `selectedMemories` and `globalKnowledge` stay excluded.
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
type AnthropicContentBlock = AnthropicTextBlock | { type: string; [key: string]: unknown };

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

function buildPersonaSystemPrompt(boundary: PersonaWriterInputBoundary): string {
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
    "You are the voice of a luxury wedding photography studio manager.",
    "Write with warmth, polish, and restraint—premium, never salesy or robotic.",
    "",
    "The user message is orchestrator-approved. When it includes **=== Authoritative CRM (verified tenant record) ===**, treat couple_names, wedding_date, location, stage, and contract_value there as verified CRM facts.",
    "Those CRM fields take priority over conflicting implications in the **Client inbound** section (for example: do not invent or substitute a different calendar month, day, or region than wedding_date/location in Authoritative CRM).",
    "Continuity sections are for thread context only—they do not override Authoritative CRM or playbook policy.",
    "Follow **Verified policy: playbook_rules** in the user message for fees, retainers, insurance, and legal commitments. Do not invent percentages or coverage.",
    "If the user message includes **NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT** or **UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT** under Explicit unknown / do-not-assert signals, you must not output any specific retainer/deposit/booking percentage—use deferral or contract-verification language with **no percentage digits**.",
    "Never treat a distance (miles/km) as a percent: if **UNKNOWN_POLICY_TRAVEL_RADIUS** or the no-playbook snapshot applies, do not invent mileage figures or confuse them with percentages.",
    "**Package & product guardrail:** Do not invent, confirm, or restate collection/package/product names as real studio offerings unless they appear in **Authoritative CRM** (e.g. package_name) or **Verified policy: playbook_rules** in the user message. If the client names an unverified product (e.g. a tier or \"Elite collection\"), do not mirror that label as fact—use neutral phrasing (\"the option you're considering\") and describe only verified offerings; avoid reinforcing the client's name as an official SKU.",
    "NEVER invent pricing, availability, or policy details missing from the user message. If something is not in CRM or playbook, hedge or defer.",
    "",
    "Narrow personalization + memory headers below support tone; if they conflict with Authoritative CRM in the user message, prefer the user message.",
    toneContext || "(No extra tone context—still avoid inventing specifics.)",
  ].join("\n\n");
}

function buildPersonaUserMessage(approvedFactualOutput: string): string {
  return [
    "Approved factual output — orchestrator-approved assembly (Authoritative CRM, continuity, client inbound, playbook, and orchestrator grounding guardrails as included below).",
    "Do not contradict verified sections or invent facts beyond them. Client-suggested package/collection names are not verified unless they appear in Authoritative CRM or Verified policy.",
    "",
    approvedFactualOutput.trim(),
  ].join("\n");
}

const STRUCTURED_OUTPUT_SUFFIX = [
  "",
  "=== OUTPUT FORMAT (mandatory) ===",
  "Return a single JSON object ONLY (no prose before or after the JSON). Shape:",
  '{ "email_draft": "<full client-facing email body as a single JSON string>",',
  '  "committed_terms": {',
  '    "package_names": ["<studio package/collection names you treated as confirmed facts in email_draft — empty if hedged only>"],',
  '    "deposit_percentage": <null | number 0-100 — null if email_draft does not commit to a specific deposit/retainer percent>,',
  '    "travel_miles_included": <null | number — null if email_draft does not commit to a specific included mileage radius>',
  "  }",
  "}",
  "Be honest in committed_terms: it is the contract for downstream deterministic audit.",
].join("\n");

export type PersonaWriterCommittedTerms = {
  package_names: string[];
  deposit_percentage: number | null;
  travel_miles_included: number | null;
};

export type PersonaWriterStructuredOutput = {
  email_draft: string;
  committed_terms: PersonaWriterCommittedTerms;
};

function parsePersonaStructuredJson(text: string): PersonaWriterStructuredOutput {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/m.exec(t);
  if (fence) t = fence[1]!.trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first < 0 || last <= first) {
    throw new Error("personaAgent: structured response missing JSON object");
  }
  t = t.slice(first, last + 1);
  const parsed = JSON.parse(t) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("personaAgent: structured JSON not an object");
  const rec = parsed as Record<string, unknown>;
  const email_draft = typeof rec.email_draft === "string" ? rec.email_draft : "";
  const ct = rec.committed_terms;
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
  if (email_draft.trim().length === 0) {
    throw new Error("personaAgent: empty email_draft");
  }
  return {
    email_draft: email_draft.trim(),
    committed_terms: {
      package_names,
      deposit_percentage,
      travel_miles_included,
    },
  };
}

/**
 * Persona layer: Anthropic Messages API (`POST /v1/messages`) via native `fetch` only.
 *
 * `agentContext` may be a full graph; only {@link extractPersonaWriterBoundary} fields are sent to the model
 * besides `orchestratorFacts` (approved factual output).
 */
async function runPersonaAnthropicMessages(
  apiKey: string,
  system: string,
  userText: string,
  maxTokens: number,
): Promise<AnthropicMessagesResponse> {
  const body = {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: maxTokens,
    temperature: 0.7,
    system: cachedEphemeralSystemBlocks(system),
    messages: [{ role: "user" as const, content: userText }],
  };

  const res = await fetch(MESSAGES_URL, {
    method: "POST",
    headers: anthropicMessagesHeadersWithPromptCaching(apiKey, ANTHROPIC_VERSION),
    body: JSON.stringify(body),
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
 * Orchestrator / clientOrchestratorV1 path: JSON with `email_draft` + `committed_terms` for deterministic audit.
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
  const userText = buildPersonaUserMessage(orchestratorFacts) + STRUCTURED_OUTPUT_SUFFIX;

  const data = await runPersonaAnthropicMessages(apiKey, system, userText, 2048);
  const text = extractAssistantText(data);
  if (!text) {
    throw new Error("draftPersonaStructuredResponse: Anthropic returned no text content");
  }

  return parsePersonaStructuredJson(text);
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
  const userText = buildPersonaUserMessage(orchestratorFacts);

  const data = await runPersonaAnthropicMessages(apiKey, system, userText, 1024);
  const text = extractAssistantText(data);
  if (!text) {
    throw new Error("draftPersonaResponse: Anthropic returned no text content");
  }

  return text;
}
