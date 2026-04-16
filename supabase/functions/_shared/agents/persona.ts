/**
 * Persona Agent — translates factual data into the photographer's voice.
 * Uses Anthropic Claude 3.5 Sonnet for warm, high-end writing.
 *
 * Set ANTHROPIC_API_KEY in Supabase Edge Function secrets.
 */
import Anthropic from "npm:@anthropic-ai/sdk";
import { boundPersonaRewriteContext, truncatePersonaRewriteFactualBullet } from "./personaA5Budget.ts";

const SYSTEM_PROMPT = `You are the Persona Agent for a luxury wedding photographer.
Translate the provided factual bullets into a warm, high-end, reassuring email reply.
Output ONLY the email body text — no subject line, no greeting prefix like "Dear", no sign-off.
Do not invent facts. Use only the information provided in the bullets and context.
Tone: sophisticated, personal, calm confidence. Short paragraphs. No exclamation marks.`;

export type PersonaContext = {
  couple_names: string;
  wedding_date: string | null;
  location: string | null;
  budget: string | null;
};

export async function runPersonaAgent(
  factualBullets: string[],
  contextData: PersonaContext,
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const anthropic = new Anthropic({
    apiKey,
    /** Bounded HTTP for long-form persona writes (SDK manages request lifecycle). */
    timeout: 120_000,
  });

  const ctx = boundPersonaRewriteContext(contextData);
  const bulletsForModel = factualBullets.map((b) => truncatePersonaRewriteFactualBullet(String(b)));

  const userContent = [
    "## Context",
    `Couple: ${ctx.couple_names}`,
    ctx.wedding_date ? `Date: ${ctx.wedding_date}` : "Date: not yet confirmed",
    ctx.location ? `Location: ${ctx.location}` : "Location: not yet confirmed",
    ctx.budget ? `Budget note: ${ctx.budget}` : "",
    "",
    "## Factual bullets to cover",
    ...bulletsForModel.map((b, i) => `${i + 1}. ${b}`),
  ]
    .filter(Boolean)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20240620",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Persona agent returned non-text content");
  }

  return block.text.trim();
}
