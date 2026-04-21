/**
 * Operator-dashboard Ana: single-turn completion grounded on {@link AssistantContext}.
 * **Not** the client-facing persona / draft writer.
 */
import type { AssistantContext } from "../../../../src/types/assistantContext.types.ts";
import { formatAssistantContextForOperatorLlm } from "./formatAssistantContextForOperatorLlm.ts";

const SYSTEM_PROMPT = `You are Ana in the **studio operator dashboard** (internal tool).

The user is the photographer or studio staff - not an end client.

**Hard rules:**
- Answer clearly and helpfully for **operator workflow** (reminders, policy checks, CRM/memory lookups).
- **Never** write copy that reads like an email or message **to send to a client** (no "Hi [Name]", no sign-off as if emailing the couple).
- **Never** claim the user already sent something to a client unless the context explicitly says so.
- Treat **Playbook** sections as authoritative policy; **memory** and **knowledge excerpts** are supporting and may be incomplete.
- If the context does not contain the answer, say what is missing and suggest what to check in the app.

Keep answers concise (roughly 2-8 short paragraphs or a tight bullet list unless the question needs more).`;

export async function completeOperatorStudioAssistantLlm(ctx: AssistantContext): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const userContent = formatAssistantContextForOperatorLlm(ctx);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.25,
      max_tokens: 1200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string | null } }[];
  };

  const text = json.choices[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("OpenAI returned empty assistant content");
  }
  return text;
}
