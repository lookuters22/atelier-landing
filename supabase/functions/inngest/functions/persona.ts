/**
 * Persona drafting — execute_v3 Phase 6.5 Step 6.5H (**agents / tools / workers** split).
 *
 * - **Worker (runtime unit):** `personaFunction` is an Inngest worker — durable steps, retries, DB side
 *   effects (`drafts` only; outbound WhatsApp is not sent here — Slice 3). It is *not* an extra named “agent role” in `v3TargetAgentRoles`;
 *   it is the operational shell around one slice of work.
 * - **Agent (reasoning role):** the **writer / persona** turn — Anthropic Messages loop that composes copy.
 *   That reasoning stays inside this worker; we do not register a separate autonomous “persona agent” worker type.
 * - **Tools (bounded capabilities):** only `search_past_communications` (RAG) is exposed to the model in this loop.
 *   Calendar/CRM/orchestration belong elsewhere (tools or other workers), not here.
 *
 * Event: `ai/intent.persona`. Each tool round is wrapped in `step.run()` for durability.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import {
  searchPastCommunications,
  type RagToolParams,
} from "../../_shared/tools/rag.ts";
import { PERSONA_STRICT_STUDIO_BUSINESS_RULES } from "../../_shared/prompts/personaStudioRules.ts";
import {
  anthropicMessagesHeadersWithPromptCaching,
  cachedEphemeralSystemBlocks,
} from "../../_shared/persona/anthropicPromptCache.ts";

const MODEL = "claude-sonnet-4-20250514";

type PersonaContext = {
  coupleNames: string;
  weddingDate: string;
  location: string;
  stage: string;
  studioName: string;
  managerName: string;
  photographerNames: string;
};

function buildSystemPrompt(ctx: PersonaContext): string {
  const firstName = ctx.coupleNames.split("&")[0]?.trim() || ctx.coupleNames;

  return `You are the Client Manager for a high-end, luxury photography studio. You must write exactly like a busy, professional human studio manager — not like an AI.

${PERSONA_STRICT_STUDIO_BUSINESS_RULES}

BEFORE DRAFTING: Use your search tool twice.
1. Search document_type: 'brand_voice' to learn tone rules.
2. Search document_type: 'past_email' to study real examples.

If searches return empty, follow the constraints below as your default voice.

ZERO FLUFF RULE:
NEVER use poetic or romantic AI language.
BANNED WORDS AND PHRASES: magical, breathtaking, timeless, tapestry, honor, dance, symphony, capture your love story, weave, cherish, unforgettable, dream, fairy tale, enchanting, whimsical, ethereal, bliss, journey together, story of your love.
If you catch yourself using any of these, delete the sentence and rewrite it plainly.

CRITICAL FORMATTING & STRUCTURE RULES:
You MUST format the email with extreme vertical spacing. You MUST insert a double line break (\\n\\n) after almost every single sentence to create distinct, isolated lines.

Follow this exact template structure for NEW INQUIRY responses, including the spacing:

Hi ${firstName},

Thank you for reaching out to us, and congratulations on the beautiful news!

My name is ${ctx.managerName}, and I'm the client manager at ${ctx.studioName}. It's lovely to e-meet you.

I'm happy to say ${ctx.photographerNames} are currently available on ${ctx.weddingDate} to capture your special memories in ${ctx.location}.

We approach every wedding individually, tailoring our offer to match your plans and preferences.

Could you please share a bit more about how you envision your wedding day, including the number of hours or days you'd like captured and any particular style or moments that are most important to you?

Once I learn a bit more, I'll send over our brochure with detailed options and suggest the package that I believe would be the best fit. Looking forward to hearing from you!

Warmly,

${ctx.managerName}

FOR NON-INQUIRY RESPONSES (booked clients, logistics, follow-ups):
- Use the exact same extreme vertical spacing — double line break after every sentence.
- Address the specific question from the raw_facts.
- Keep it under 8 isolated lines total.
- End with "Warmly,\\n\\n${ctx.managerName}"

GROUNDING RULES (HIGHEST PRIORITY):
- You MUST base your response strictly on the factual payload provided in raw_facts.
- Do NOT invent scenarios, project phases, or relationship stages not present in the data.
- Do NOT assume the wedding has happened unless raw_facts explicitly says so.
- Do NOT write post-wedding templates unless raw_facts explicitly mentions delivery or gallery status.
- The current project stage is: "${ctx.stage}". Respect it.

VOICE RULES:
- You are a silent ghostwriter. NEVER break the fourth wall.
- NEVER mention your internal tools, searches, database, or lack of data.
- NEVER apologize for missing context.

OUTPUT:
- Your output MUST be the drafted email body only. No subject line, no preamble, no meta-commentary.
- Every sentence MUST be followed by a double line break. This is non-negotiable.`;
}

// Anthropic tool definition format
const TOOL_SPEC = {
  name: searchPastCommunications.name,
  description: searchPastCommunications.description,
  input_schema: searchPastCommunications.parameters,
};

// ── Anthropic API types ──────────────────────────────────────────

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

type AnthropicResponse = {
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
};

type ClaudeMetricsContext = { qa_sim_turn?: number };

type ClaudeCallResult = AnthropicResponse & {
  usage: { input_tokens: number; output_tokens: number };
};

async function callClaude(
  systemPrompt: string,
  messages: AnthropicMessage[],
  metrics?: ClaudeMetricsContext,
): Promise<ClaudeCallResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  // Same prompt-caching shape as _shared/persona/personaAgent.ts (ephemeral system cache).
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: anthropicMessagesHeadersWithPromptCaching(apiKey),
    body: JSON.stringify({
      model: MODEL,
      system: cachedEphemeralSystemBlocks(systemPrompt),
      max_tokens: 2048,
      temperature: 0.7,
      tools: [TOOL_SPEC],
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as AnthropicResponse & {
    usage?: { input_tokens: number; output_tokens: number };
  };
  const usage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };
  console.log(
    JSON.stringify({
      type: "persona_metrics",
      usage: data.usage,
      prompt_caching: true,
      ...(metrics?.qa_sim_turn != null ? { qa_sim_turn: metrics.qa_sim_turn } : {}),
    }),
  );
  return { content: data.content, stop_reason: data.stop_reason, usage };
}

function extractText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function extractToolUses(blocks: ContentBlock[]): ToolUseBlock[] {
  return blocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Worker: Inngest runtime unit (durable orchestration of draft pipeline) ──

const MAX_TOOL_ROUNDS = 5;

export const personaFunction = inngest.createFunction(
  {
    id: "persona-agent",
    name: "Persona drafting worker — writer role + RAG tool (6.5H)",
  },
  { event: "ai/intent.persona" },
  async ({ event, step }) => {
    const { wedding_id, thread_id, photographer_id, raw_facts, qa_sim_turn } =
      event.data;

    // ── Fetch context for dynamic prompt interpolation ────────────
    const ctx = await step.run("fetch-persona-context", async () => {
      let coupleNames = "there";
      let weddingDate = "your date";
      let location = "your destination";
      let stage = "inquiry";
      let studioName = "Atelier Studio";
      let managerName = "The Atelier Team";
      let photographerNames = "our team";

      if (wedding_id && photographer_id) {
        const { data: wedding } = await supabaseAdmin
          .from("weddings")
          .select("couple_names, wedding_date, location, stage")
          .eq("id", wedding_id)
          .eq("photographer_id", photographer_id)
          .maybeSingle();

        if (wedding) {
          coupleNames = (wedding.couple_names as string) || coupleNames;
          weddingDate = wedding.wedding_date
            ? formatDate(wedding.wedding_date as string)
            : weddingDate;
          location = (wedding.location as string) || location;
          stage = (wedding.stage as string) || stage;
        }
      }

      if (photographer_id) {
        const { data: photographer } = await supabaseAdmin
          .from("photographers")
          .select("email, settings")
          .eq("id", photographer_id)
          .single();

        if (photographer?.settings) {
          const settings = photographer.settings as Record<string, unknown>;
          studioName = (settings.studio_name as string) || studioName;
          managerName = (settings.manager_name as string) || managerName;
          photographerNames = (settings.photographer_names as string) || photographerNames;
        }
      }

      return {
        coupleNames,
        weddingDate,
        location,
        stage,
        studioName,
        managerName,
        photographerNames,
      } satisfies PersonaContext;
    });

    const systemPrompt = buildSystemPrompt(ctx);

    // ── Reasoning: writer/persona loop + bounded tool (RAG only) ──
    const draftResult = await step.run("writer-persona-rag-tool-loop", async () => {
      const metrics: ClaudeMetricsContext = { qa_sim_turn };
      const messages: AnthropicMessage[] = [
        {
          role: "user",
          content: [
            `photographer_id: ${photographer_id}`,
            `couple_names: ${ctx.coupleNames}`,
            `wedding_date: ${ctx.weddingDate}`,
            `location: ${ctx.location}`,
            `stage: ${ctx.stage}`,
            "",
            "## Raw Facts",
            raw_facts,
          ].join("\n"),
        },
      ];

      let totalIn = 0;
      let totalOut = 0;
      const addUsage = (u: { input_tokens: number; output_tokens: number }) => {
        totalIn += u.input_tokens;
        totalOut += u.output_tokens;
      };

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await callClaude(systemPrompt, messages, metrics);
        addUsage(response.usage);

        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
          return {
            draftBody: extractText(response.content),
            usage_totals: { input_tokens: totalIn, output_tokens: totalOut },
          };
        }

        const toolUses = extractToolUses(response.content);
        if (toolUses.length === 0) {
          return {
            draftBody: extractText(response.content),
            usage_totals: { input_tokens: totalIn, output_tokens: totalOut },
          };
        }

        const toolResults: ToolResultBlock[] = [];

        for (const toolUse of toolUses) {
          const args = toolUse.input as RagToolParams;

          const result = await searchPastCommunications.handler({
            query: args.query,
            photographer_id: args.photographer_id ?? photographer_id,
            document_type: args.document_type,
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        messages.push({ role: "user", content: toolResults });
      }

      const fallback = await callClaude(systemPrompt, messages, metrics);
      addUsage(fallback.usage);
      return {
        draftBody: extractText(fallback.content),
        usage_totals: { input_tokens: totalIn, output_tokens: totalOut },
      };
    });

    const draftBody = draftResult.draftBody;
    const usageTotals = draftResult.usage_totals;

    // ── Save draft for human approval ────────────────────────────
    const draftId = await step.run("save-draft", async () => {
      const { data, error } = await supabaseAdmin
        .from("drafts")
        .insert({
          photographer_id,
          thread_id,
          status: "pending_approval",
          body: draftBody,
          instruction_history: [
            {
              step: "persona_agent",
              raw_facts,
              model: MODEL,
              context: ctx,
              tool_calls_enabled: true,
              usage: usageTotals,
            },
          ],
        })
        .select("id")
        .single();

      if (error) throw new Error(`Failed to insert draft: ${error.message}`);
      return data.id as string;
    });

    // Slice 3: no direct WhatsApp send from persona — drafts go through approval / verifier-gated outbound.

    return {
      status: "draft_pending_approval" as const,
      wedding_id,
      thread_id,
      draftId,
      whatsapp_send_skipped: true as const,
    };
  },
);
