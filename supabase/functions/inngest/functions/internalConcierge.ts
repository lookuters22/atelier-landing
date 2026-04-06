/**
 * Internal Concierge — Boss's Private WhatsApp AI Assistant.
 *
 * Phase 8 Step 8C: Production operator WhatsApp uses `operator/whatsapp.inbound.v1` → `operatorOrchestrator`.
 * This worker remains for legacy triage ingress (`comms/whatsapp.received` or
 * `operator/whatsapp.legacy.received`) → `ai/intent.internal_concierge` only (Phase 0D / Step 8D).
 *
 * Listens for ai/intent.internal_concierge (WhatsApp-only).
 *
 * This is NOT the client-facing email pipeline.
 * The photographer is texting their own AI studio manager.
 * Responses are short, factual, direct SMS — no greetings, no sign-offs.
 *
 * Flow:
 * 1. Fetch recent conversation history for short-term memory.
 * 2. Run OpenAI with tool-calling to answer the photographer's question.
 * 3. Log both sides of the conversation to the messages table.
 * 4. Send the response back via Twilio WhatsApp immediately — no drafts table.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { sendWhatsAppMessage } from "../../_shared/twilio.ts";

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are an elite, internal AI studio manager talking directly to your boss (the luxury wedding photographer) via SMS/WhatsApp.

RULES:
- Be extremely concise, factual, and direct.
- DO NOT use email formatting.
- DO NOT use greetings like "Hi [Name]" or "Hello".
- DO NOT use sign-offs like "Best," or "Warmly,".
- DO NOT use bullet points or numbered lists unless the boss asks for a list.
- Respond as if you are texting a colleague — short sentences, plain language.
- If the boss asks about a specific wedding, client, or task, use your tools to look it up and report the facts.
- If you cannot find the data, say so in one sentence.
- Keep responses under 300 characters when possible.
- You have CONVERSATION HISTORY below. Use it to resolve pronouns like "it", "them", "that wedding", "their", etc. If the boss says "is it booked?", look at the previous messages to figure out what "it" refers to.

SEARCH STRATEGY (CRITICAL):
- When searching for a wedding or client, extract only the SINGLE most unique first name from the query. For example, if the boss says "what about Sarah and James wedding", search ONLY for "Sarah" — not the full phrase.
- Never pass connector words like "and", "&", "the", "wedding" into a search tool.
- If the first search returns nothing, try the other name.

CRITICAL SEARCH LOGIC — DO NOT OVER-FILTER:
- When the user asks about the status or stage of a project (e.g., "Is it booked?", "What stage is Sarah at?"), DO NOT pass the status/stage as a filter to your search tool. Search ONLY by the couple's name or location to retrieve the full master record.
- Once you have the record, read the "stage" property from the result and report it to the user.
- The stage field is an enum: inquiry, consultation, proposal_sent, contract_out, booked, prep, final_balance, delivered, archived.
- WRONG: query_weddings(search_term: "Sarah", stage: "booked") — this pre-filters and may return nothing.
- RIGHT: query_weddings(search_term: "Sarah") — then read the stage from the result.`;

// ── Tool definitions for OpenAI function calling ────────────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_weddings",
      description: "Search the studio's weddings by name or location keyword. Returns up to 10 matching weddings with couple_names, wedding_date, location, stage, contract_value. Do NOT use the stage parameter to answer 'is it booked?' questions — search by name and read the stage from the result.",
      parameters: {
        type: "object",
        properties: {
          search_term: {
            type: "string",
            description: "A single keyword — one first name (e.g. 'Sarah') or one city (e.g. 'Como'). Do NOT pass full couple names, phrases, or status words.",
          },
          stage: {
            type: "string",
            description: "ONLY use this to list all weddings at a specific stage (e.g. 'show me all booked weddings'). NEVER use this when asking about a specific couple's status.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_clients",
      description: "Search clients by a single first name or email. Returns names, emails, roles, and linked wedding.",
      parameters: {
        type: "object",
        properties: {
          search_term: {
            type: "string",
            description: "A single first name (e.g. 'Sarah') or email fragment. Do NOT pass full names.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_tasks",
      description: "Get open tasks. Returns task titles, due dates, and linked weddings.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status: 'open' or 'completed'. Defaults to 'open'.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_pending_drafts",
      description: "Get AI-generated email drafts awaiting the photographer's approval.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

// ── Tool handlers ───────────────────────────────────────────────

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  photographerId: string,
): Promise<string> {
  switch (name) {
    case "query_weddings": {
      const NOISE = new Set(["and", "&", "the", "wedding", "weddings", "of", "for", "in", "at", "is", "are", "it", "booked", "status", "stage"]);

      let query = supabaseAdmin
        .from("weddings")
        .select("id, couple_names, wedding_date, location, stage, contract_value, package_name")
        .eq("photographer_id", photographerId)
        .order("wedding_date", { ascending: true })
        .limit(10);

      if (args.stage && typeof args.stage === "string") {
        query = query.eq("stage", args.stage);
      }

      if (args.search_term && typeof args.search_term === "string") {
        const keywords = args.search_term
          .split(/[\s,&+]+/)
          .map((w: string) => w.trim().toLowerCase())
          .filter((w: string) => w.length >= 2 && !NOISE.has(w));

        if (keywords.length > 0) {
          const clauses = keywords
            .map((kw: string) => `couple_names.ilike.%${kw}%,location.ilike.%${kw}%`)
            .join(",");
          query = query.or(clauses);
        }
      }

      const { data, error } = await query;
      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return "No weddings found.";
      return JSON.stringify(data);
    }

    case "query_clients": {
      const NOISE = new Set(["and", "&", "the", "client", "clients", "of", "for"]);

      let query = supabaseAdmin
        .from("clients")
        .select("id, name, email, role, wedding_id, weddings!inner(couple_names)")
        .eq("weddings.photographer_id", photographerId)
        .limit(15);

      if (args.search_term && typeof args.search_term === "string") {
        const keywords = args.search_term
          .split(/[\s,&+]+/)
          .map((w: string) => w.trim().toLowerCase())
          .filter((w: string) => w.length >= 2 && !NOISE.has(w));

        if (keywords.length > 0) {
          const clauses = keywords
            .map((kw: string) => `name.ilike.%${kw}%,email.ilike.%${kw}%`)
            .join(",");
          query = query.or(clauses);
        }
      }

      const { data, error } = await query;
      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return "No clients found.";
      return JSON.stringify(data);
    }

    case "query_tasks": {
      const status = (args.status as string) || "open";
      const { data, error } = await supabaseAdmin
        .from("tasks")
        .select("id, title, due_date, status, wedding_id, weddings(couple_names)")
        .eq("photographer_id", photographerId)
        .eq("status", status)
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return `No ${status} tasks.`;
      return JSON.stringify(data);
    }

    case "query_pending_drafts": {
      const { data, error } = await supabaseAdmin
        .from("drafts")
        .select("id, body, status, created_at, threads(title, weddings(couple_names))")
        .eq("photographer_id", photographerId)
        .eq("status", "pending_approval")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return "No pending drafts.";
      return JSON.stringify(data);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ── OpenAI call ─────────────────────────────────────────────────

type OaiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

async function callOpenAI(messages: OaiMessage[]): Promise<{
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 512,
      tools: TOOLS,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.choices[0].message;
}

// ── Inngest function ────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 4;
const MEMORY_DEPTH = 8; // 4 exchanges = 8 messages (user + assistant)

export const internalConciergeFunction = inngest.createFunction(
  { id: "internal-concierge", name: "Internal Concierge — WhatsApp AI Assistant" },
  { event: "ai/intent.internal_concierge" },
  async ({ event, step }) => {
    const { photographer_id, from_number, raw_message } = event.data;

    // ── Resolve reply number + get/create internal thread ─────────
    const setup = await step.run("setup-context", async () => {
      const { data: photographer } = await supabaseAdmin
        .from("photographers")
        .select("settings")
        .eq("id", photographer_id)
        .single();

      const settings = (photographer?.settings ?? {}) as Record<string, unknown>;
      const waNumber = (settings.whatsapp_number as string) ?? null;
      const replyNumber = waNumber || from_number;

      // Find or create a dedicated internal WhatsApp thread for this photographer
      const internalTitle = "WhatsApp — Internal Assistant";
      const { data: existingThread } = await supabaseAdmin
        .from("threads")
        .select("id")
        .eq("photographer_id", photographer_id)
        .is("wedding_id", null)
        .eq("title", internalTitle)
        .eq("kind", "other")
        .limit(1)
        .maybeSingle();

      let threadId: string;

      if (existingThread?.id) {
        threadId = existingThread.id as string;
      } else {
        const { data: newThread, error } = await supabaseAdmin
          .from("threads")
          .insert({
            wedding_id: null,
            photographer_id,
            title: internalTitle,
            kind: "other",
          })
          .select("id")
          .single();

        if (error || !newThread) throw new Error(`Failed to create internal thread: ${error?.message}`);
        threadId = newThread.id as string;
      }

      return { replyNumber, threadId };
    });

    // ── Fetch recent conversation history (short-term memory) ─────
    const history = await step.run("fetch-memory", async () => {
      const { data: recentMessages } = await supabaseAdmin
        .from("messages")
        .select("direction, sender, body, sent_at")
        .eq("thread_id", setup.threadId)
        .eq("photographer_id", photographer_id)
        .eq("direction", "internal")
        .order("sent_at", { ascending: false })
        .limit(MEMORY_DEPTH);

      if (!recentMessages || recentMessages.length === 0) return [];

      return recentMessages.reverse().map((m) => ({
        role: (m.sender === "ai-assistant" ? "assistant" : "user") as "user" | "assistant",
        content: (m.body as string) ?? "",
      }));
    });

    // ── Log the incoming user message ─────────────────────────────
    await step.run("log-inbound-message", async () => {
      await supabaseAdmin.from("messages").insert({
        thread_id: setup.threadId,
        photographer_id,
        direction: "internal",
        sender: from_number || "photographer",
        body: raw_message,
      });
    });

    // ── Agentic tool-calling loop (with memory) ───────────────────
    const response = await step.run("internal-concierge-think", async () => {
      const messages: OaiMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((m) => ({ role: m.role, content: m.content }) as OaiMessage),
        { role: "user", content: raw_message },
      ];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await callOpenAI(messages);

        if (!reply.tool_calls || reply.tool_calls.length === 0) {
          return (reply.content ?? "").trim();
        }

        messages.push({
          role: "assistant",
          content: reply.content,
          tool_calls: reply.tool_calls,
        });

        for (const tc of reply.tool_calls) {
          const args = JSON.parse(tc.function.arguments || "{}");
          const result = await handleToolCall(tc.function.name, args, photographer_id);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
      }

      const final = await callOpenAI(messages);
      return (final.content ?? "Could not process your request.").trim();
    });

    // ── Log the AI response ───────────────────────────────────────
    await step.run("log-outbound-response", async () => {
      await supabaseAdmin.from("messages").insert({
        thread_id: setup.threadId,
        photographer_id,
        direction: "internal",
        sender: "ai-assistant",
        body: response,
      });
    });

    // ── Send WhatsApp reply immediately ───────────────────────────
    const sid = await step.run("send-whatsapp-reply", async () => {
      console.log(`[internal-concierge] Replying to ${setup.replyNumber}: ${response.slice(0, 80)}...`);
      return await sendWhatsAppMessage(setup.replyNumber, response);
    });

    return {
      status: "replied_via_whatsapp",
      photographer_id,
      reply_number: setup.replyNumber,
      response_preview: response.slice(0, 120),
      twilio_sid: sid,
    };
  },
);
