/**
 * Concierge Agent — Factual Researcher for client Q&A.
 *
 * Listens for ai/intent.concierge.
 *
 * 1. Fetch wedding context to resolve photographer_id and thread_id.
 * 2. Run an agentic tool-calling loop (OpenAI + RAG) to find the
 *    factual answer in the photographer's knowledge base / contracts.
 * 3. Hand off the raw_facts to the Persona Agent for brand-voice drafting.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import {
  searchPastCommunications,
  type RagToolParams,
} from "../../_shared/tools/rag.ts";

const SYSTEM_PROMPT_TEMPLATE = (question: string) =>
  `You are the Concierge Agent. A client has asked a question: "${question}".

You MUST use your search tool with document_type: 'contract' to find the factual answer in their contract.

Do NOT write an email to the client.
Output ONLY a dry, factual summary of the answer (e.g., "Extra coverage is $500/hr").
If the answer is not in the contract, state "Fact not found".`;

const TOOL_SPEC = {
  type: "function" as const,
  function: {
    name: searchPastCommunications.name,
    description: searchPastCommunications.description,
    parameters: searchPastCommunications.parameters,
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
      max_tokens: 512,
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

export const conciergeFunction = inngest.createFunction(
  { id: "concierge-worker", name: "Concierge Agent — Factual Researcher" },
  { event: "ai/intent.concierge" },
  async ({ event, step }) => {
    const { wedding_id, raw_message, reply_channel, photographer_id } = event.data;

    if (!photographer_id || typeof photographer_id !== "string") {
      throw new Error("ai/intent.concierge: missing photographer_id (tenant-proof required)");
    }

    const context = await step.run("fetch-wedding-context", async () => {
      const { data: wedding, error: weddingErr } = await supabaseAdmin
        .from("weddings")
        .select("id, photographer_id")
        .eq("id", wedding_id)
        .eq("photographer_id", photographer_id)
        .single();

      if (weddingErr || !wedding) {
        throw new Error(`Wedding not found: ${weddingErr?.message ?? wedding_id}`);
      }

      const { data: threads } = await supabaseAdmin
        .from("threads")
        .select("id")
        .eq("wedding_id", wedding_id)
        .eq("photographer_id", wedding.photographer_id as string)
        .order("last_activity_at", { ascending: false })
        .limit(1);

      const threadId = (threads?.[0]?.id as string) ?? null;
      if (!threadId) {
        throw new Error(`No thread found for wedding ${wedding_id}`);
      }

      return {
        photographerId: wedding.photographer_id as string,
        threadId,
      };
    });

    // ── Agentic RAG loop — research the factual answer ───────────
    const rawFacts = await step.run("research-facts", async () => {
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT_TEMPLATE(raw_message) },
        {
          role: "user",
          content: `photographer_id: ${context.photographerId}\n\nClient question: ${raw_message}`,
        },
      ];

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
          return (assistantMsg.content ?? "Fact not found").trim();
        }

        for (const toolCall of assistantMsg.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments) as RagToolParams;

          const result = await searchPastCommunications.handler({
            query: args.query,
            photographer_id: args.photographer_id ?? context.photographerId,
            document_type: args.document_type,
          });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      }

      const fallback = await callOpenAI(messages);
      return (fallback.choices[0].message.content ?? "Fact not found").trim();
    });

    // ── Handoff to Persona Agent ─────────────────────────────────
    await step.sendEvent("handoff-to-persona", {
      name: "ai/intent.persona",
      data: {
        wedding_id,
        thread_id: context.threadId,
        photographer_id: context.photographerId,
        raw_facts: rawFacts,
        reply_channel: reply_channel ?? undefined,
      },
    });

    return {
      status: "facts_gathered_handoff_sent",
      wedding_id,
      threadId: context.threadId,
      rawFacts,
    };
  },
);
