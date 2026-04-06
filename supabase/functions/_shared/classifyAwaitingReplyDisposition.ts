/**
 * Phase 10 Step 10D — classify photographer replies against an `Awaiting reply:` follow-up task
 * (`docs/v3/execute_v3.md`). Conservative: any failure → `unresolved` (never falsely `answered`).
 */
const MODEL = "gpt-4o-mini";

export type AwaitingReplyDisposition = "answered" | "deferral" | "unresolved";

export type ClassifyAwaitingReplyInput = {
  taskTitle: string;
  photographerReply: string;
};

/**
 * Only a successful parse with explicit disposition may return answered/deferral; all errors → unresolved.
 */
export async function classifyAwaitingReplyDisposition(
  input: ClassifyAwaitingReplyInput,
): Promise<AwaitingReplyDisposition> {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return "unresolved";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You classify a photographer WhatsApp reply against a studio follow-up task title.
Return JSON only: {"disposition":"answered"|"deferral"|"unresolved"}.

- answered: they gave a clear final answer, decision, or confirmation that satisfies the ask.
- deferral: they explicitly need more time, will reply later, or postpone without resolving yet.
- unresolved: unclear, off-topic, partial, or you cannot tell.

If uncertain, use unresolved.`,
          },
          {
            role: "user",
            content: `Task title:\n${input.taskTitle}\n\nPhotographer reply:\n${input.photographerReply}`,
          },
        ],
      }),
    });

    if (!res.ok) return "unresolved";

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const d = parsed.disposition;
      if (d === "answered" || d === "deferral" || d === "unresolved") return d;
      return "unresolved";
    } catch {
      return "unresolved";
    }
  } catch {
    return "unresolved";
  }
}
