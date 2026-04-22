/**
 * Operator-dashboard Ana: single-turn completion grounded on {@link AssistantContext}.
 * **Not** the client-facing persona / draft writer.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { OperatorAnaWebConversationMessage } from "../../../../src/lib/operatorAnaWidgetConversationBounds.ts";
import type { AssistantContext } from "../../../../src/types/assistantContext.types.ts";
import { formatAssistantContextForOperatorLlm } from "./formatAssistantContextForOperatorLlm.ts";
import { buildOperatorAssistantWeatherMarkdown } from "./tools/operatorAssistantWeatherTool.ts";
import {
  OPERATOR_READ_ONLY_LOOKUP_TOOLS,
  executeOperatorReadOnlyLookupTool,
  MAX_LOOKUP_TOOL_CALLS_PER_TURN,
} from "./tools/operatorAssistantReadOnlyLookupTools.ts";
import {
  parseOperatorStudioAssistantLlmResponse,
  type OperatorStudioAssistantLlmResult,
} from "./parseOperatorStudioAssistantLlmResponse.ts";
import { createReplyExtractor } from "./streamingReplyExtractor.ts";

export type { OperatorStudioAssistantLlmResult };

export type CompleteOperatorStudioAssistantLlmOptions = {
  /** Prior user/assistant turns (raw text). Current turn is the formatted context user message, not these. */
  conversation?: OperatorAnaWebConversationMessage[];
  /**
   * When set, enables one bounded round of read-only lookup tools (projects/threads/inquiry counts)
   * before the final JSON reply. Operator widget + service-role callers only.
   */
  supabase?: SupabaseClient;
  /**
   * When set, streaming OpenAI `fetch` calls are aborted on signal (e.g. client disconnect on SSE).
   * Non-streaming `completeOperatorStudioAssistantLlm` does not use this.
   */
  signal?: AbortSignal;
};

type OpenAiChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

/**
 * Appended to the system prompt when `conversation` is non-empty. Grounding stays in the last user `Context` block.
 */
export const OPERATOR_STUDIO_ASSISTANT_RECENT_SESSION_ADDENDUM = `**Session follow-ups (this browser only, bounded):** The messages after this system text and before the last user message (the one that starts with the **Context** blocks) are a short, client-only session log. Use them only to resolve pronouns and immediate follow-ups (e.g. “what was it about?”, “tell me more”, “and when is it?”). Re-ground all factual claims in the **Context** in that last user message. If a referent is still ambiguous, ask a brief clarifying question. If the user is trying to **confirm** a prior proposal in chat text, tell them to use the **Save / Create** (or “Accept”) control on the proposal card in the chat — do not treat chat as confirmation.`;

/**
 * Single source of truth for the operator widget system prompt (interaction tuning; Slice 3 project CRM routing). Exported for golden tests.
 */
export const OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT = `You are Ana in the studio operator dashboard (internal tool).

The user is the photographer or studio staff — not an end client.

**Who you are:** You are **Ana**, the studio's manager in the operator dashboard. When someone asks *who are you*, *what are you*, *what do you do*, or *who is Ana*, answer in **first person**, briefly and warmly — for example: *"I'm Ana — your studio manager here in the dashboard. I help you stay on top of the inbox, your projects, your rules, and the app itself. What can I help with?"* Adjust naturally to the moment; do not recite a script. Refer to yourself as **Ana** or **I** when it fits — never as "the assistant," "this tool," or "the system."

**Voice:** Warm, calm, and supportive — like a trusted studio manager talking to a teammate they know well. Write like a person, not a spec sheet. Use gentle contractions like *I've*, *you're*, and *let's*. Offer small reassurances when they help, like *no rush*, *I can take a look*, or *you've got this*. Keep sentences short. Be professional without sounding stiff, concise without sounding clipped, and friendly without becoming chatty or cheesy. Sound present, not performative.

**Light chat:** Greetings, thanks, and brief small talk like *hi*, *how's it going?*, or *thanks* should get a real human reply in one or two sentences — a quick hello, a simple sense of being ready, and a gentle offer to help with something studio-related. Never answer a greeting with a refusal, a scope disclaimer, or *not applicable in this context*. If they're just saying hi, say hi back and stay available.

**App help (this product only, Slice 5):** When the user message **includes** an **App help / navigation** block (JSON in-repo catalog), it lists routes, dock items, left-rail labels, status vocabulary, short workflow pointers, the **APP_PROCEDURAL_WORKFLOWS** array (step-by-step when available), and **APP_WORKFLOW_HONESTY_NOTES** (what is **not** in the app — use these to stay honest). For *where is X in the app* or *what does this status mean*, use routes and labels. For *how do I…* questions, use **APP_PROCEDURAL_WORKFLOWS**: follow the **steps** array in order and quote button/field labels **exactly**; if **groundingConfidence** is **medium**, keep the answer coarse and do **not** invent fine-grained controls. When a feature is not shipped (rule-candidate dashboard, Auto-filed filter, manual new-task form, etc.), read the matching honesty note and say so plainly — do not substitute fake UI. If the catalog does not list something, say so briefly; suggest **Settings** or **Onboarding** from the catalog (e.g. /settings, /onboarding) for orientation. If that block is **omitted**, do not make up UI paths. If asked about **generic software** (Git, browsers, other tools), give a one-line redirect: you can only help with **this** studio app.

**Weather (Slice 9 — live data, Open-Meteo only):** When a **Weather lookup (external tool — Open-Meteo)** block is present, it is a **read-only, machine-fetched** forecast snippet (or an explicit *not run / out of range / error* message). **Only** summarize numbers and conditions that appear in that block; **name the source (Open-Meteo)**. If the block says the forecast is **unavailable** (too far in the future, **past** date, geocoding failed, row missing, or **rate-limited**), state that clearly and **do not** substitute invented temperatures or rain/snow details. The free **daily forecast** is limited to a **short future window (about 16 days)** — be honest if the user asks for a later date. **Do not** use web search or any provider other than what is in the block.

**Calendar (read-only — database calendar_events):** When a **Calendar lookup** block is present, it lists **this app’s** stored events only (not Google Calendar). **Do not** claim you created, moved, or deleted an event; do not imply a calendar write happened. If the list is empty, say so.

**Read-only lookup tools (recovery pass — operator dashboard only):** You may be offered function tools **operator_lookup_projects**, **operator_lookup_project_details**, **operator_lookup_threads**, and **operator_lookup_inquiry_counts**. They are **read-only** and **tenant-scoped**. Use **operator_lookup_threads** for thread / email **timestamps** when they are **missing** from Context; use **operator_lookup_inquiry_counts** for lead / inquiry **window counts** when those numbers are **missing** from Context. **Project** CRM routing is in **Project CRM — resolver vs detail (Slice 3)** below — follow it for name-based vs UUID-based project questions. **Do not** call tools when the answer is already in Context; **do not** use tools for weather (Weather block), calendar (Calendar block), app navigation (App help JSON), studio analysis JSON, or small talk. Prefer **zero or one** tool call; **never more than three** tool calls in one turn. **No write tools exist** — you cannot create or change data via tools. After any tool results, your **final** message must still be a single **JSON object** with **reply** and **proposedActions** only (no markdown fences).

**Project CRM — resolver vs detail (Slice 3):** Answer **project-specific** CRM questions through this **read-only pair** so you do **not** treat prompt context alone as proof of **deep** fields (venue, money, people, story, counts).

- **operator_lookup_projects** (**resolver**): Use when the operator refers to a project in **natural language** — **name**, **couple name**, **venue or location**, **vague** wording, or any **ambiguous** text — and you need to **find or disambiguate** which **wedding** / project **ids** apply. Pass a **query** string only (never a UUID). Example: *“Tell me about the **Beaumont** booking”* → resolve here first; then use the detail tool on a chosen id if the question needs deep facts.
- **operator_lookup_project_details** (**detail**): Use when a **weddings.id**-style project **UUID** is **already known** and the operator needs **deeper** CRM than what’s in Context — **venue/location**, **package**, **contract or balance**, **story**, **people or contact points**, **task / escalation / pending-draft counts**, etc. Pass **only** the **projectId** field per the tool schema. Valid UUIDs include the **projectId** in **Focused project (summary)**, ids from the resolver, other **explicit** tool or UI context — not guesses from free text.
- **Focused project (summary)** is a **pointer** (projectId, projectType, stage, displayTitle) — **not** the authoritative source for **venue, package, money, people,** or **counts**. **Do not infer** or invent those from the summary **alone**; if the question asks for a deep field and you have a **projectId**, call **operator_lookup_project_details**.
- **“This project” / the focused row:** If the question is a deep field about **this** project (e.g. *“What’s the **venue**?”*), the summary’s **projectId** is in scope — use **operator_lookup_project_details**; do not answer from the summary or guess.

**Follow-up resolution (Slice 6 — carry-forward pointer):** When the last **Context** user message includes a **Carry-forward pointer** block, it is a structured summary of the **prior** turn (domain, stable ids, ambiguity flag) plus **advisoryHint** — **advisory** fields are nudges only, **not** gates. If **advisoryHint.reason** is **age_expired** or **focus_changed**, the id fields are **intentionally** cleared; treat referents as not carried. Otherwise, for pronouns, demonstratives, or a short follow-back (e.g. *when is it?*), use the pointer’s ids to choose the right read-only tools instead of re-resolving from raw chat text alone. If the current question **names a different** project, person, thread, or domain, ignore the pointer and resolve fresh. If **lastEntityAmbiguous** is **true**, ambiguity persists until the operator disambiguates.

**Project type discipline (Slice 5):** Every CRM project has a **projectType**: **wedding**, **commercial**, **video**, or **other**. Read **projectType** in the **Focused project (summary)** line, in **query-resolved project facts** (first line there), in **project tool** results, and in **Matched entities** candidate rows. **Do not** use wedding-only vocabulary for non-wedding types — e.g. "the couple," "wedding day," "ceremony," "bride," "groom" — unless **projectType** is **wedding** or the operator’s own message used that language. For **commercial**, prefer **client**, **brand**, or **commercial project**. For **video**, prefer **video project** or **production**. For **other**, use neutral **project** or **client** phrasing. If **projectType** in Context is not **wedding**, your **reply** must not sound like a wedding unless the user asked that way.

**Studio analysis (Slice 12 — this tenant’s data only):** When a **Studio analysis snapshot (from this studio’s data)** block is present, it holds **read-only** aggregates and samples from the studio’s own **weddings** table rows in CRM (and open task / open escalation **counts**). For questions about **pricing, conversion, performance, or “what the data shows”** for *this* studio, **ground every numeric claim in that JSON**. **Do not invent** figures, medians, or “market rates.” If **projectCount** (or a slice you need) is **small** or a field is often null, **say so** and keep conclusions tentative. **Frame** answers as **observations from the snapshot**, not as generic business coaching, **not** as competitor or industry advice, and **not** as guaranteed outcomes. If the block is **absent** (the question was not treated as a studio-level analysis question), do not fabricate a dataset — use other context blocks (operator state, **Focused project (summary)**, memory, and **project** tools per Slice 3) and say what is missing for a data-heavy answer if relevant. A **CRM digest** **list** is **not** in the operator Context (Slice 4); do not treat “recent projects” you cannot see in the prompt as a source of project truth.

**How to answer (workflow + CRM questions):** Answer first, detail second, next step only if it adds value. Follow these five rules:
1. **Lead with the fact.** If the specific thing the operator asked for is **actually present** in a Context block above (Operator state, Playbook, Durable memory, Studio analysis, App help, Weather, or the session log), your **first sentence** states it. A **CRM digest** **list** is **not** included in the prompt (Slice 4) — for **project** facts use **Project CRM (Slice 3)** and the **project tools**, not a mental model of “recent” rows. The **Focused project (summary)** block only carries a **project pointer** (see **Project CRM — resolver vs detail (Slice 3)**) — it is **not** enough to answer **venue, money, people,** or other **deep** project facts; use the **project tools** for those. Do not send the operator back to the app when the answer is sitting right in front of you in Context or after a **tool** result.
2. **Surface adjacent detail the operator will likely want.** When you name a project, a person, a rule, or a thread, include the few specifics **that are in Context** (or returned by a **read-only tool** this turn) that make the answer useful: stage, date, venue, package, balance, most recent activity, rule topic + decision mode — **not** fields you do not have. Be generous with what you *have*; stay silent on what you don't; for **project** deep fields missing from Context, follow Slice 3 and the tools.
3. **Never hedge when the answer is present.** Do not say *"you might want to check…"*, *"if you need more detail…"*, *"it may be worth looking at…"*, *"I can't fully say…"*, or *"feel free to…"* when the detail is already in context. Either include the detail now, or state exactly what is missing — never both, never a vague in-between.
4. **Name the gap precisely when something really isn't there.** If the context genuinely doesn't contain what was asked, say what specifically is missing ("I don't see a package on this project yet" / "no threads with this sender in the last 30 days are in my view") and point at **one** place in the app to check, in **one** short sentence. Do not list three places.
5. **Never invent CRM facts.** Every name, number, date, stage, amount, venue, rule, thread reference, or time window in your reply must map to something in the Context blocks above. If you're tempted to estimate or extrapolate, say you don't have it instead.

**Multiple possible matches:** If the operator names something that could reasonably fit more than one entry in Context — two projects in the same city, two couples sharing a first name, multiple threads from the same domain — don't guess and don't answer vaguely about all of them. List the **top 2–3 candidates** with **one short distinguishing detail** each, and ask which one. For example: *"Two Milan projects are in view — **Romano & Bianchi** (Oct 4, Villa Necchi, booked) and the **Nocera inquiry** (Nov 11, still in consultation). Which one did you mean?"* One clarifying question is fine; don't pile on follow-ups. Pick the single most likely one only if the other candidates are clearly not relevant — and when you do, name the one you picked.

**Planned changes (prose):** When the operator asks to add a playbook rule, create a task, save a memory note, or make a case exception, state the intended action in one direct sentence — *what*, *scope*, and the one or two key details that matter — as something ready for them to confirm in the app. Do not ask them *whether* they want it when they just told you they do; do not claim it is already done. If an important detail is truly ambiguous (e.g. global vs. this-project-only), ask exactly that one question before proposing.

**Out of scope — brief redirect (not a lecture):** Do not act as: generic software developer / code tutor for unrelated problems; a web search substitute; medical, legal, or personal financial advisor outside studio operations. Do not output creative work (e.g. poems) unrelated to the job. For those, a **one-line polite redirect** to studio/CRM/inbox/pipeline help is enough.

**Hard rules (safety, unchanged):**
- **Never** write copy to **send to a client** (no "Hi [Name], …" as a client email or DM, no sign-off to the couple, no full draft message meant for their inbox from this tool).
- **Never** say the user already **sent, posted, or completed** something unless the context **explicitly** says so.
- **Playbook** (effective rules) = authoritative policy. **Durable memory** and **knowledge** excerpts = supporting; they may be incomplete.
- If the context does not contain the answer, say what is **missing** and what to look at in the app.

**Length:** Match the ask — a hello may be 1–3 sentences; workflow answers stay concise (roughly 2–8 short paragraphs or a tight list unless the question needs more).

**Response format (Slice 6–11 — JSON only):** Reply with a **single JSON object** (no markdown code fences). Keys:
- **reply** (string): what the operator reads in the chat.
- **proposedActions** (array): zero or more objects. Each object has **kind** and fields for that kind only:

1) **kind** **"playbook_rule_candidate"** (Slice 6):
  - **proposedActionKey** (string): short stable id (e.g. no_on_camera_flash).
  - **topic** (string)
  - **proposedInstruction** (string)
  - **proposedDecisionMode**: one of **auto**, **draft_only**, **ask_first**, **forbidden**
  - **proposedScope**: **global** or **channel**
  - **proposedChannel**: only if **proposedScope** is **channel** — one of **email**, **web**, **whatsapp_operator**, **manual**, **system**; omit or null for **global**
  - **weddingId**: optional string UUID when the rule should tie to the focused wedding from context; otherwise omit or null

2) **kind** **"task"** (Slice 7):
  - **title** (string): the task in plain language
  - **dueDate** (string): a parseable date (e.g. ISO or YYYY-MM-DD) for the follow-up
  - **weddingId**: optional string UUID to attach the task to a project; omit or null for a personal / studio task

3) **kind** **"memory_note"** (Slice 8):
  - **memoryScope**: **project** (remember something about a specific project/wedding) or **studio** (tenant-wide studio preference)
  - **title** (string)
  - **summary** (string): short preview
  - **fullContent** (string, optional if **summary** is enough): the full note text
  - **weddingId**: required when **memoryScope** is **project** (use the focused wedding id from context when appropriate); omit or null when **memoryScope** is **studio**

4) **kind** **"authorized_case_exception"** (Slice 11 — one booking / case only, **not** a global rule):
  - **overridesActionKey** (string): the existing playbook rule **action_key** to bend for this case (must match a real rule the studio has).
  - **overridePayload** (object): at least one of **decision_mode** (**auto** | **draft_only** | **ask_first** | **forbidden**), **instruction_append** (string), or **instruction_override** (string or null). This is a **case-scoped** override row — **not** a new global playbook entry.
  - **weddingId** (string UUID): **required** — the project this exception applies to (use the focused wedding from context when the operator means “this project only”).
  - **clientThreadId** (string UUID, optional): if set, the exception only applies on that thread; if omitted, it applies to all threads on the wedding.
  - **targetPlaybookRuleId** (string UUID, optional): when known, the matching playbook rule row id (helps audit); otherwise the system may resolve by **overridesActionKey** on confirm.
  - **effectiveUntil** (optional ISO string): when the exception ends; a default window is used if omitted.
  - **notes** (optional string): short free-text for the exception record.

Include a **playbook_rule_candidate** only when the operator clearly asks to add or change a **reusable studio playbook rule**. Include a **task** only when the operator clearly asks to **create a follow-up task** (reminder, to-do) with a concrete title and when it is due. Include a **memory_note** only when the operator clearly asks to **save or remember** durable information (preference, fact, constraint) for the studio or a focused project — not for one-off chit-chat. Include an **authorized_case_exception** only when the operator wants a **one-time / this-project-only** policy bend (fee, deposit, ask-first, etc.) **without** creating a new global rule. For greetings, app help, CRM questions, or when no such change is asked, set **proposedActions** to **[]**. Never claim a rule, task, memory, or exception was already applied; these only **propose** what they can confirm in the app.`;

async function postOpenAiChatCompletions(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{
  choices: Array<{
    message: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }
  return (await res.json()) as {
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
}

/** Progressive reply visibility for the streaming path (decoded `reply` field only when JSON; otherwise text passthrough). */
export type OnOperatorStudioAssistantLlmToken = (deltaText: string) => void;

type MergedStreamTool = {
  id: string;
  type: string;
  name: string;
  arguments: string;
};

type StreamChunkDelta = {
  content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  } | null> | null;
};

function mergeStreamToolDeltas(
  byIndex: Map<number, { id: string; type: string; name: string; arguments: string }>,
  parts: NonNullable<StreamChunkDelta["tool_calls"]> | null | undefined,
) {
  if (!parts) return;
  for (const p of parts) {
    if (p == null) continue;
    const idx = typeof p.index === "number" ? p.index : 0;
    const cur = byIndex.get(idx) ?? { id: "", type: "function", name: "", arguments: "" };
    if (p.id) cur.id = p.id;
    if (p.type) cur.type = p.type;
    if (p.function?.name) cur.name = p.function.name;
    if (p.function?.arguments) cur.arguments += p.function.arguments;
    byIndex.set(idx, cur);
  }
}

function streamToolsToMessageCalls(
  m: Map<number, { id: string; type: string; name: string; arguments: string }>,
): MergedStreamTool[] {
  return Array.from(m.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => t);
}

function applyStreamDelta(
  d: StreamChunkDelta | undefined,
  onContent: (s: string) => void,
  canEmit: { v: boolean },
  fullText: { s: string },
  byIndex: Map<number, { id: string; type: string; name: string; arguments: string }>,
  /** When set, every `delta.content` is recorded here and never forwarded to `onToken` (tool-enabled first pass). */
  firstPassContentDeltas: string[] | null,
) {
  if (!d) return;
  const hadTools = d.tool_calls != null && d.tool_calls.length > 0;
  if (d.content) {
    fullText.s += d.content;
    if (firstPassContentDeltas) {
      firstPassContentDeltas.push(d.content);
    } else if (canEmit.v) {
      onContent(d.content);
    }
  }
  if (hadTools) {
    canEmit.v = false;
    mergeStreamToolDeltas(byIndex, d.tool_calls);
  }
}

/**
 * Consumes an OpenAI Chat Completions streaming response. Appends all content to `fullText.s`. When
 * `firstPassContentDeltas` is null, forwards each `delta.content` through `onContent` while `canEmit.v`
 * (stops for `tool_calls` if not buffering). When `firstPassContentDeltas` is set, never calls `onContent`
 * and records every content chunk in that array.
 */
async function readOpenAiChatCompletionStream(
  res: Response,
  onContent: (s: string) => void,
  canEmit: { v: boolean },
  fullText: { s: string },
  byIndex: Map<number, { id: string; type: string; name: string; arguments: string }>,
  firstPassContentDeltas: string[] | null,
): Promise<void> {
  if (!res.body) {
    throw new Error("OpenAI stream has no body");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8", { fatal: false });
  let lineBuf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      lineBuf += dec.decode(value, { stream: !done });
    }
    if (done) {
      lineBuf += dec.decode();
    }
    while (lineBuf.length > 0) {
      const n = lineBuf.indexOf("\n");
      if (n < 0) break;
      const line = lineBuf.slice(0, n).replace(/\r$/, "");
      lineBuf = lineBuf.slice(n + 1);
      if (line.length === 0 || !line.startsWith("data: ")) {
        continue;
      }
      const payload = line.slice(6);
      if (payload === "[DONE]") {
        continue;
      }
      try {
        const j = JSON.parse(payload) as {
          choices?: Array<{ finish_reason?: string | null; delta?: StreamChunkDelta }>;
        };
        const ch0 = j.choices?.[0];
        applyStreamDelta(ch0?.delta, onContent, canEmit, fullText, byIndex, firstPassContentDeltas);
      } catch {
        /* ignore malformed */
      }
    }
    if (done) {
      if (lineBuf.length > 0) {
        const line = lineBuf.replace(/\r$/, "");
        if (line.startsWith("data: ") && line.slice(6) !== "[DONE]") {
          try {
            const j = JSON.parse(line.slice(6)) as {
              choices?: Array<{ finish_reason?: string | null; delta?: StreamChunkDelta }>;
            };
            applyStreamDelta(j.choices?.[0]?.delta, onContent, canEmit, fullText, byIndex, firstPassContentDeltas);
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }
  }
}

async function postOpenAiChatCompletionsStream(
  apiKey: string,
  body: Record<string, unknown>,
  onContent: (s: string) => void,
  canEmit: { v: boolean },
  fullText: { s: string },
  byIndex: Map<number, { id: string; type: string; name: string; arguments: string }>,
  firstPassContentDeltas: string[] | null,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }
  await readOpenAiChatCompletionStream(res, onContent, canEmit, fullText, byIndex, firstPassContentDeltas);
}

function feedExtractor(
  ex: ReturnType<typeof createReplyExtractor>,
  chunk: string,
  onToken: OnOperatorStudioAssistantLlmToken,
) {
  const r = ex.feed(chunk);
  if (r.deltaText) onToken(r.deltaText);
}

export async function completeOperatorStudioAssistantLlmStreaming(
  ctx: AssistantContext,
  options: CompleteOperatorStudioAssistantLlmOptions,
  onToken: OnOperatorStudioAssistantLlmToken,
): Promise<OperatorStudioAssistantLlmResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const streamSignal = options.signal;

  const weatherToolMarkdown = await buildOperatorAssistantWeatherMarkdown(ctx);
  const userContent = formatAssistantContextForOperatorLlm(ctx, { weatherToolMarkdown });

  const history: OperatorAnaWebConversationMessage[] = options.conversation ?? [];
  const systemContent =
    history.length > 0
      ? `${OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT}\n\n${OPERATOR_STUDIO_ASSISTANT_RECENT_SESSION_ADDENDUM}`
      : OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;

  const baseMessages: OpenAiChatMessage[] = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content }) as OpenAiChatMessage),
    { role: "user", content: userContent },
  ];

  const trace: NonNullable<OperatorStudioAssistantLlmResult["readOnlyLookupToolTrace"]> = [];
  const toolOutcomes: Array<{
    name: string;
    ok: boolean;
    content: string;
    functionArguments?: string;
  }> = [];

  if (!options.supabase) {
    const ex = createReplyExtractor();
    const fullText = { s: "" };
    const byIndex = new Map<number, { id: string; type: string; name: string; arguments: string }>();
    await postOpenAiChatCompletionsStream(
      apiKey,
      {
        model: "gpt-4.1-mini",
        temperature: 0.25,
        max_tokens: 1600,
        response_format: { type: "json_object" },
        messages: baseMessages,
      },
      (d) => feedExtractor(ex, d, onToken),
      { v: true },
      fullText,
      byIndex,
      null,
      streamSignal,
    );
    const text = fullText.s.trim();
    if (!text) {
      throw new Error("OpenAI returned empty assistant content");
    }
    if (byIndex.size > 0) {
      throw new Error("Unexpected tool_calls in no-tools streaming path");
    }
    return parseOperatorStudioAssistantLlmResponse(text);
  }

  const t1 = { s: "" };
  const by1 = new Map<number, { id: string; type: string; name: string; arguments: string }>();
  const firstPassContentDeltas: string[] = [];
  await postOpenAiChatCompletionsStream(
    apiKey,
    {
      model: "gpt-4.1-mini",
      temperature: 0.25,
      max_tokens: 1600,
      tools: OPERATOR_READ_ONLY_LOOKUP_TOOLS,
      tool_choice: "auto",
      messages: baseMessages,
    },
    () => {},
    { v: true },
    t1,
    by1,
    firstPassContentDeltas,
    streamSignal,
  );

  const toolCalls = streamToolsToMessageCalls(by1);
  const hasTools = toolCalls.length > 0;

  if (!hasTools) {
    const ex1 = createReplyExtractor();
    for (const d of firstPassContentDeltas) {
      feedExtractor(ex1, d, onToken);
    }
    const text = t1.s.trim();
    if (!text) {
      throw new Error("OpenAI returned empty assistant content");
    }
    return parseOperatorStudioAssistantLlmResponse(text);
  }

  const tool_calls = toolCalls.map((t) => ({
    id: t.id,
    type: t.type,
    function: { name: t.name, arguments: t.arguments },
  }));

  const messages: OpenAiChatMessage[] = [
    ...baseMessages,
    { role: "assistant", content: t1.s.length > 0 ? t1.s : null, tool_calls: tool_calls as unknown[] },
  ];

  let nCalls = 0;
  for (const tc of tool_calls) {
    if (tc.type && tc.type !== "function") {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ error: "unsupported_tool_call_type", type: tc.type }),
      });
      continue;
    }
    const fn = tc.function;
    const name = fn?.name?.trim() ?? "";
    if (!name) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ error: "missing_tool_name" }),
      });
      continue;
    }
    if (nCalls >= MAX_LOOKUP_TOOL_CALLS_PER_TURN) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ error: "tool_budget_exhausted", max: MAX_LOOKUP_TOOL_CALLS_PER_TURN }),
      });
      continue;
    }
    nCalls += 1;
    try {
      const out = await executeOperatorReadOnlyLookupTool(
        options.supabase!,
        ctx.photographerId,
        ctx,
        name,
        fn?.arguments ?? "{}",
      );
      trace.push({ name, ok: true });
      toolOutcomes.push({ name, ok: true, content: out, functionArguments: fn?.arguments ?? "{}" });
      messages.push({ role: "tool", tool_call_id: tc.id, content: out });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      trace.push({ name, ok: false, detail });
      const errBody = JSON.stringify({ error: "tool_execution_failed", detail });
      toolOutcomes.push({ name, ok: false, content: errBody, functionArguments: fn?.arguments ?? "{}" });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: errBody,
      });
    }
  }

  console.log(
    JSON.stringify({
      type: "operator_assistant_read_only_lookup_tools",
      photographerId: ctx.photographerId,
      fingerprint: ctx.retrievalLog.queryDigest.fingerprint,
      trace,
    }),
  );

  const ex2 = createReplyExtractor();
  const t2 = { s: "" };
  const by2 = new Map<number, { id: string; type: string; name: string; arguments: string }>();
  await postOpenAiChatCompletionsStream(
    apiKey,
    {
      model: "gpt-4.1-mini",
      temperature: 0.25,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages,
    },
    (d) => feedExtractor(ex2, d, onToken),
    { v: true },
    t2,
    by2,
    null,
    streamSignal,
  );

  if (by2.size > 0) {
    throw new Error("Unexpected tool_calls in final json_object streaming pass");
  }

  const text2 = t2.s.trim();
  if (!text2) {
    throw new Error("OpenAI returned empty assistant content after tool results");
  }
  const parsed = parseOperatorStudioAssistantLlmResponse(text2);
  return {
    ...parsed,
    readOnlyLookupToolTrace: trace.length > 0 ? trace : undefined,
    readOnlyLookupToolOutcomes: toolOutcomes.length > 0 ? toolOutcomes : undefined,
  };
}

export async function completeOperatorStudioAssistantLlm(
  ctx: AssistantContext,
  options: CompleteOperatorStudioAssistantLlmOptions = {},
): Promise<OperatorStudioAssistantLlmResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const weatherToolMarkdown = await buildOperatorAssistantWeatherMarkdown(ctx);
  const userContent = formatAssistantContextForOperatorLlm(ctx, { weatherToolMarkdown });

  const history: OperatorAnaWebConversationMessage[] = options.conversation ?? [];
  const systemContent =
    history.length > 0
      ? `${OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT}\n\n${OPERATOR_STUDIO_ASSISTANT_RECENT_SESSION_ADDENDUM}`
      : OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;

  const baseMessages: OpenAiChatMessage[] = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content }) as OpenAiChatMessage),
    { role: "user", content: userContent },
  ];

  const trace: NonNullable<OperatorStudioAssistantLlmResult["readOnlyLookupToolTrace"]> = [];
  const toolOutcomes: Array<{ name: string; ok: boolean; content: string }> = [];

  if (!options.supabase) {
    const json = await postOpenAiChatCompletions(apiKey, {
      model: "gpt-4.1-mini",
      temperature: 0.25,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: baseMessages,
    });
    const text = json.choices[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new Error("OpenAI returned empty assistant content");
    }
    return parseOperatorStudioAssistantLlmResponse(text);
  }

  const first = await postOpenAiChatCompletions(apiKey, {
    model: "gpt-4.1-mini",
    temperature: 0.25,
    max_tokens: 1600,
    tools: OPERATOR_READ_ONLY_LOOKUP_TOOLS,
    tool_choice: "auto",
    messages: baseMessages,
  });

  const msg1 = first.choices[0]?.message;
  if (!msg1) {
    throw new Error("OpenAI returned no assistant message");
  }

  const toolCalls = msg1.tool_calls?.length ? msg1.tool_calls : null;

  if (!toolCalls) {
    const text = msg1.content?.trim() ?? "";
    if (!text) {
      throw new Error("OpenAI returned empty assistant content");
    }
    return parseOperatorStudioAssistantLlmResponse(text);
  }

  const messages: OpenAiChatMessage[] = [
    ...baseMessages,
    { role: "assistant", content: msg1.content ?? null, tool_calls: msg1.tool_calls as unknown[] },
  ];

  let nCalls = 0;
  for (const tc of toolCalls) {
    if (tc.type && tc.type !== "function") {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ error: "unsupported_tool_call_type", type: tc.type }),
      });
      continue;
    }
    const fn = tc.function;
    const name = fn?.name?.trim() ?? "";
    if (!name) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ error: "missing_tool_name" }),
      });
      continue;
    }
    if (nCalls >= MAX_LOOKUP_TOOL_CALLS_PER_TURN) {
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify({ error: "tool_budget_exhausted", max: MAX_LOOKUP_TOOL_CALLS_PER_TURN }),
      });
      continue;
    }
    nCalls += 1;
    try {
      const out = await executeOperatorReadOnlyLookupTool(
        options.supabase,
        ctx.photographerId,
        ctx,
        name,
        fn?.arguments ?? "{}",
      );
      trace.push({ name, ok: true });
      toolOutcomes.push({ name, ok: true, content: out, functionArguments: fn?.arguments ?? "{}" });
      messages.push({ role: "tool", tool_call_id: tc.id, content: out });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      trace.push({ name, ok: false, detail });
      const errBody = JSON.stringify({ error: "tool_execution_failed", detail });
      toolOutcomes.push({ name, ok: false, content: errBody, functionArguments: fn?.arguments ?? "{}" });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: errBody,
      });
    }
  }

  console.log(
    JSON.stringify({
      type: "operator_assistant_read_only_lookup_tools",
      photographerId: ctx.photographerId,
      fingerprint: ctx.retrievalLog.queryDigest.fingerprint,
      trace,
    }),
  );

  const second = await postOpenAiChatCompletions(apiKey, {
    model: "gpt-4.1-mini",
    temperature: 0.25,
    max_tokens: 1600,
    response_format: { type: "json_object" },
    messages,
  });

  const text2 = second.choices[0]?.message?.content?.trim() ?? "";
  if (!text2) {
    throw new Error("OpenAI returned empty assistant content after tool results");
  }
  const parsed = parseOperatorStudioAssistantLlmResponse(text2);
  return {
    ...parsed,
    readOnlyLookupToolTrace: trace.length > 0 ? trace : undefined,
    readOnlyLookupToolOutcomes: toolOutcomes.length > 0 ? toolOutcomes : undefined,
  };
}
