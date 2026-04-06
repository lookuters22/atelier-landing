/**
 * Phase 9 Step 9A — single classifier slice: outcome path for answered escalations (`execute_v3.md`).
 *
 * Exactly one of:
 * - one_off_case — decision applies only to this situation (case-specific).
 * - reusable_playbook — should become a global or channel-wide studio rule.
 *
 * Writeback to playbook_rules / memories: Step 9B (`writebackEscalationLearning.ts`).
 */
const MODEL = "gpt-4o-mini";

export type EscalationLearningOutcome = "one_off_case" | "reusable_playbook";

export type ClassifyEscalationLearningInput = {
  questionBody: string;
  photographerReply: string;
  resolutionSummary: string;
  actionKey?: string | null;
  weddingId?: string | null;
};

/**
 * Classify how this answered escalation should be treated in the learning loop.
 * Returns `reusable_playbook` only after a successful API response and explicit JSON parse.
 * Any missing key, HTTP error, network/runtime failure, or bad JSON → `one_off_case` (conservative).
 */
export async function classifyEscalationLearningOutcome(
  input: ClassifyEscalationLearningInput,
): Promise<EscalationLearningOutcome> {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return "one_off_case";

    const ctx = [
      input.actionKey ? `action_key: ${input.actionKey}` : null,
      input.weddingId ? `wedding_id present (case-scoped)` : "no wedding_id (studio-wide context)",
    ]
      .filter(Boolean)
      .join("\n");

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
            content: `You classify a photographer's answer to an operational escalation into exactly one category:
- one_off_case: applies only to this specific client, wedding, or one-time situation; not intended as a studio-wide rule.
- reusable_playbook: the photographer's decision should become a reusable global or channel-wide rule for this studio.

Return JSON only: {"learning_outcome":"one_off_case"|"reusable_playbook"}.
If uncertain, prefer one_off_case.`,
          },
          {
            role: "user",
            content: `Context:\n${ctx || "(none)"}

Original question:\n${input.questionBody}

Photographer reply:\n${input.photographerReply}

Summarized resolution:\n${input.resolutionSummary}`,
          },
        ],
      }),
    });

    if (!res.ok) return "one_off_case";

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const v = parsed.learning_outcome;
      if (v === "reusable_playbook") return "reusable_playbook";
      return "one_off_case";
    } catch {
      return "one_off_case";
    }
  } catch {
    return "one_off_case";
  }
}
