/**
 * Matchmaker Agent — cross-references an inbound message against active weddings.
 * Uses OpenAI `gpt-4o-mini` with JSON mode (same cost profile as triage classification).
 *
 * Set OPENAI_API_KEY in Supabase Edge Function secrets.
 */

import {
  truncateMatchmakerInboundMessage,
  truncateMatchmakerRosterJson,
} from "../matchmakerA5Budget.ts";

export type MatchmakerResult = {
  suggested_wedding_id: string | null;
  confidence_score: number;
  reasoning: string;
};

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are the Matchmaker Agent. Cross-reference the inbound message with the JSON roster of active weddings.
You MUST respond with a single JSON object only (no markdown fences), with exactly these keys:
- "suggested_wedding_id": a string UUID from the roster, or null if none fits
- "confidence_score": number from 0 to 100
- "reasoning": brief string (see below)

Be highly conservative. Only give confidence_score > 90 if dates, unique venues, or rare names match exactly.

Reasoning guidance: If couple names, dates, or venues appear in the inbound message but **no roster row** is a strong match,
say clearly that **those details did not align with an existing project in the roster** — do NOT imply that no names,
dates, or locations were present in the email. Reserve phrasing like "no inquiry details" only when the message truly
lacks identifiable couple/date/venue cues.`;

function stripJsonFences(text: string): string {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  return fence ? fence[1].trim() : t;
}

export async function runMatchmakerAgent(
  rawMessage: string,
  activeWeddings: Record<string, unknown>[],
): Promise<MatchmakerResult> {
  const inboundTrim = String(rawMessage ?? "").trim();
  if (!inboundTrim || activeWeddings.length === 0) {
    return {
      suggested_wedding_id: null,
      confidence_score: 0,
      reasoning: "",
    };
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const rosterBlock = JSON.stringify(
    activeWeddings.map((w) => ({
      id: w.id,
      couple_names: w.couple_names,
      wedding_date: w.wedding_date,
      location: w.location,
      stage: w.stage,
    })),
  );

  const rosterForModel = truncateMatchmakerRosterJson(rosterBlock);
  const inboundForModel = truncateMatchmakerInboundMessage(String(rawMessage ?? ""));

  const userContent = [
    "## Active Weddings Roster",
    rosterForModel,
    "",
    "## Inbound Message",
    inboundForModel,
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 256,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI matchmaker API error ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const text = json.choices[0]?.message?.content?.trim() ?? "";

  try {
    const parsed = JSON.parse(stripJsonFences(text)) as MatchmakerResult;

    return {
      suggested_wedding_id: parsed.suggested_wedding_id ?? null,
      confidence_score: typeof parsed.confidence_score === "number" ? parsed.confidence_score : 0,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch (e) {
    throw new Error(`Matchmaker agent returned invalid JSON: ${text.slice(0, 200)} — ${e}`);
  }
}
