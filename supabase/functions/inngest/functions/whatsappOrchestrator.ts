import { CLIENT_WHATSAPP_INBOUND_V1_EVENT, inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { buildAgentContext } from "../../_shared/memory/buildAgentContext.ts";
import { sanitizeAgentContextForOrchestratorPrompt } from "../../_shared/memory/sanitizeAgentContextForOrchestratorPrompt.ts";
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import {
  BookCalendarEventSchema,
  CalendarToolInputSchema,
  CrmToolInputSchema,
  TravelToolInputSchema,
} from "../../_shared/tools/schemas.ts";
import { executeCalendarTool, runBookCalendarEvent } from "../../_shared/tools/calendarTool.ts";
import { executeCrmTool } from "../../_shared/tools/crmTool.ts";
import { executeTravelTool } from "../../_shared/tools/travelTool.ts";
import { draftPersonaResponse } from "../../_shared/persona/personaAgent.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const MAX_ORCHESTRATOR_ROUNDS = 3;

/**
 * Native JSON Schema tool definitions aligned with `CalendarToolInputSchema`, `TravelToolInputSchema`,
 * `BookCalendarEventSchema`, `CrmToolInputSchema` (field names + enums). Runtime validation uses Zod `safeParse`.
 */
const OPENAI_TOOLS: Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> = [
  {
    type: "function",
    function: {
      name: "check_calendar_availability",
      description:
        "Check calendar availability for a date range: returns overlapping events on the tenant calendar. Optional weddingId adds a client self-serve booking link in the result.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          rangeStart: { type: "string", description: "ISO 8601 date or datetime (range start)." },
          rangeEnd: { type: "string", description: "ISO 8601 date or datetime (range end)." },
          eventType: {
            type: "string",
            enum: ["about_call", "timeline_call", "gallery_reveal", "other"],
          },
          weddingId: {
            type: "string",
            description: "Optional wedding UUID to include a /book/{wedding_id} link in the result.",
          },
        },
        required: ["rangeStart", "rangeEnd", "eventType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_calendar_event",
      description:
        "Book a calendar event for a wedding on the photographer's calendar (writes calendar_events).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          weddingId: { type: "string", description: "Wedding UUID." },
          title: { type: "string", description: "Event title." },
          eventType: {
            type: "string",
            enum: ["about_call", "timeline_call", "gallery_reveal", "other"],
          },
          startTime: { type: "string", description: "ISO 8601 start time." },
          endTime: { type: "string", description: "ISO 8601 end time." },
        },
        required: ["weddingId", "title", "eventType", "startTime", "endTime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_travel_costs",
      description: "Estimate mocked travel options (flights and hotels) for a destination window.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          origin: { type: "string", description: "Origin city, region, or airport." },
          destination: { type: "string", description: "Destination city or region." },
          startDate: { type: "string", description: "Travel window start (ISO 8601 date)." },
          endDate: { type: "string", description: "Travel window end (ISO 8601 date)." },
        },
        required: ["origin", "destination", "startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_wedding_project_stage",
      description: "Update the wedding's CRM project stage (booked, prep, etc.).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          weddingId: { type: "string", description: "Wedding UUID." },
          projectStage: {
            type: "string",
            enum: [
              "inquiry",
              "consultation",
              "proposal_sent",
              "contract_out",
              "booked",
              "prep",
              "final_balance",
              "delivered",
              "archived",
            ],
          },
        },
        required: ["weddingId", "projectStage"],
      },
    },
  },
];

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
  }>;
};

function buildSystemPrompt(ctx: AgentContext): string {
  const payload = sanitizeAgentContextForOrchestratorPrompt(ctx);
  return [
    "You are the Atelier OS orchestrator. Use the provided tools when you need operational facts.",
    "Prefer calling tools over guessing. When you have enough information, reply with a concise plain-text answer for WhatsApp.",
    "Sanitized agent context (JSON — no raw thread bodies or memory full text; the user's latest message is only in the next user message):",
    JSON.stringify(payload),
  ].join("\n\n");
}

async function openaiChatCompletions(body: unknown): Promise<ChatCompletionResponse> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  return JSON.parse(text) as ChatCompletionResponse;
}

async function dispatchTool(
  name: string,
  rawArgs: string,
  photographerId: string,
  supabase: typeof supabaseAdmin,
): Promise<string> {
  let args: unknown;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return JSON.stringify({
      success: false,
      facts: {},
      confidence: 0,
      error: "Invalid JSON in tool arguments",
    });
  }

  if (name === "check_calendar_availability") {
    const parsed = CalendarToolInputSchema.safeParse(args);
    if (!parsed.success) {
      return JSON.stringify({
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      });
    }
    const result = await executeCalendarTool(supabase, parsed.data, photographerId);
    return JSON.stringify(result);
  }

  if (name === "book_calendar_event") {
    const parsed = BookCalendarEventSchema.safeParse(args);
    if (!parsed.success) {
      return JSON.stringify({
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      });
    }
    const result = await runBookCalendarEvent(supabase, photographerId, parsed.data);
    return JSON.stringify(result);
  }

  if (name === "estimate_travel_costs") {
    const parsed = TravelToolInputSchema.safeParse(args);
    if (!parsed.success) {
      return JSON.stringify({
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      });
    }
    const result = await executeTravelTool(parsed.data, photographerId);
    return JSON.stringify(result);
  }

  if (name === "update_wedding_project_stage") {
    const parsed = CrmToolInputSchema.safeParse(args);
    if (!parsed.success) {
      return JSON.stringify({
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      });
    }
    const result = await executeCrmTool(parsed.data, photographerId, supabase);
    return JSON.stringify(result);
  }

  return JSON.stringify({
    success: false,
    facts: {},
    confidence: 0,
    error: `Unknown tool: ${name}`,
  });
}

async function runOrchestratorReasoningLoop(
  agentContext: AgentContext,
  supabase: typeof supabaseAdmin,
): Promise<{ finalText: string }> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(agentContext) },
    { role: "user", content: agentContext.rawMessage },
  ];

  let finalText = "";

  for (let round = 0; round < MAX_ORCHESTRATOR_ROUNDS; round++) {
    const completion = await openaiChatCompletions({
      model: MODEL,
      messages,
      tools: OPENAI_TOOLS,
      tool_choice: "auto",
    });

    const msg = completion.choices?.[0]?.message;
    if (!msg) {
      break;
    }

    const toolCalls = msg.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: toolCalls,
      });

      const resultStrings = await Promise.all(
        toolCalls.map((tc) =>
          dispatchTool(
            tc.function?.name ?? "",
            tc.function?.arguments ?? "{}",
            agentContext.photographerId,
            supabase,
          ),
        ),
      );

      const toolMessages: ChatMessage[] = toolCalls.map((tc, i) => ({
        role: "tool",
        tool_call_id: tc.id,
        content: resultStrings[i] ?? "",
      }));

      messages.push(...toolMessages);
      continue;
    }

    finalText = typeof msg.content === "string" ? msg.content : "";
    break;
  }

  return { finalText };
}

/**
 * Client WhatsApp orchestrator — AgentContext + OpenAI tool loop (native fetch, no AI SDK).
 *
 * Step 8D: subscribes to `client/whatsapp.inbound.v1` (canonical) and legacy `comms/whatsapp.received.v2`.
 * Operator lane uses `operator/whatsapp.inbound.v1` → `operatorOrchestrator`, not this function.
 */
export const whatsappOrchestratorFunction = inngest.createFunction(
  { id: "whatsapp-orchestrator-v2", name: "WhatsApp Orchestrator V2 (client)" },
  [{ event: "comms/whatsapp.received.v2" }, { event: CLIENT_WHATSAPP_INBOUND_V1_EVENT }],
  async ({ event, step }) => {
    const agentContext = await step.run("build-agent-context", async () => {
      const supabase = supabaseAdmin;
      const { photographerId, weddingId, threadId, rawMessage } = event.data;

      return buildAgentContext(
        supabase,
        photographerId,
        weddingId ?? null,
        threadId ?? null,
        "whatsapp",
        rawMessage,
      );
    });

    const orchestratorOutput = await step.run("orchestrator-reasoning-loop", async () => {
      return runOrchestratorReasoningLoop(agentContext, supabaseAdmin);
    });

    const personaDraft = await step.run("draft-persona-response", async () => {
      return draftPersonaResponse(agentContext, orchestratorOutput.finalText);
    });

    const draftSave = await step.run("save-draft-for-approval", async () => {
      if (!agentContext.threadId) {
        console.warn(
          "[whatsappOrchestrator] save-draft-for-approval: no threadId; skipping drafts insert (unfiled thread flow not implemented yet).",
        );
        return { saved: false as const, reason: "no_thread_id" as const };
      }

      const { data, error } = await supabaseAdmin
        .from("drafts")
        .insert({
          thread_id: agentContext.threadId,
          photographer_id: agentContext.photographerId,
          body: personaDraft,
          status: "pending_approval",
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`save-draft-for-approval: ${error.message}`);
      }

      return { saved: true as const, draftId: data?.id as string };
    });

    // Inngest "Finalization" serializes this return value to Cloud — keep it small (no full agentContext).
    return {
      ok: true as const,
      threadId: agentContext.threadId,
      weddingId: agentContext.weddingId,
      photographerId: agentContext.photographerId,
      draftSave,
    };
  },
);
