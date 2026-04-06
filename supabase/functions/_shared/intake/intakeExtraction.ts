/**
 * Intake extraction + calendar research (OpenAI tool loop).
 * Shared with `inngest/functions/intake.ts`; behavior preserved from legacy worker.
 */
import {
  checkCalendarAvailability,
  type CalendarToolParams,
} from "../tools/calendar.ts";
import type { IntakeStructuredExtraction } from "./intakeBootstrapTypes.ts";

const SYSTEM_PROMPT = `You are the Intake Agent. A new inquiry has arrived.

Your job is to extract facts and check availability. Follow these steps strictly:

1. Extract the Couple Names, Date, Location, and Budget from the message.
2. Use your check_calendar_availability tool to check the date.
3. Output a JSON object with these exact keys:
   {
     "couple_names": "string",
     "wedding_date": "ISO date string or null",
     "location": "string or null",
     "budget": "string or null",
     "story_notes": "brief summary of the inquiry",
     "raw_facts": "concise factual summary only (extracted details + calendar). Never paste the full message or a transcript."
   }

Output ONLY the JSON object. No markdown fences, no explanation.`;

const TOOL_SPEC = {
  type: "function" as const,
  function: {
    name: checkCalendarAvailability.name,
    description: checkCalendarAvailability.description,
    parameters: checkCalendarAvailability.parameters,
  },
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIResponse = {
  choices: {
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }[];
};

async function callOpenAI(messages: ChatMessage[]): Promise<OpenAIResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
      tools: [TOOL_SPEC],
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  return (await res.json()) as OpenAIResponse;
}

const MAX_TOOL_ROUNDS = 4;

/**
 * Agentic loop: extract structured fields and run calendar tool when needed.
 */
export async function runIntakeExtractionAndResearch(
  rawMessage: string,
): Promise<IntakeStructuredExtraction> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: rawMessage },
  ];

  let finalContent = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callOpenAI(messages);
    const choice = response.choices[0];
    const assistantMsg = choice.message;

    messages.push({
      role: "assistant",
      content: assistantMsg.content,
      tool_calls: assistantMsg.tool_calls,
    });

    if (choice.finish_reason === "stop" || !assistantMsg.tool_calls?.length) {
      finalContent = (assistantMsg.content ?? "{}").trim();
      break;
    }

    for (const toolCall of assistantMsg.tool_calls) {
      const args = JSON.parse(
        toolCall.function.arguments,
      ) as CalendarToolParams;

      const result = await checkCalendarAvailability.handler(args);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  if (!finalContent) {
    const fallback = await callOpenAI(messages);
    finalContent = (fallback.choices[0].message.content ?? "{}").trim();
  }

  const cleaned = finalContent
    .replace(/^```json?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<IntakeStructuredExtraction>;

  return {
    couple_names: parsed.couple_names ?? "Unknown",
    wedding_date: normalizeNullableIsoDateString(parsed.wedding_date),
    location: normalizeNullableString(parsed.location),
    budget: normalizeNullableString(parsed.budget),
    story_notes: parsed.story_notes ?? "",
    raw_facts: parsed.raw_facts ?? "",
  };
}

/** Rejects JSON literal `"null"`, empty strings, and invalid dates (models sometimes emit `"null"` as a string). */
function normalizeNullableIsoDateString(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeNullableString(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
  return t;
}
