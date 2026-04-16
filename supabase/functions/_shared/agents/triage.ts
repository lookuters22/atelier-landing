/**
 * Triage Agent — classifies an inbound message into one of six intents
 * matching the Worker Agent roster.
 * Uses OpenAI gpt-4o-mini for low-latency, low-cost classification.
 *
 * Set OPENAI_API_KEY in Supabase Edge Function secrets.
 */

import { truncateTriageUserMessage } from "../triageA5Budget.ts";

export type TriageIntent =
  | "intake"
  | "commercial"
  | "logistics"
  | "project_management"
  | "concierge"
  | "studio";

const VALID_INTENTS: ReadonlySet<string> = new Set<TriageIntent>([
  "intake",
  "commercial",
  "logistics",
  "project_management",
  "concierge",
  "studio",
]);

const SYSTEM_PROMPT = `You are a strict message classifier for a luxury wedding photography studio (Atelier OS).

Choose exactly ONE category. Output ONLY that lowercase label — no punctuation, no explanation.

Priority for **unlinked / new-client email**: if the message is primarily a **new wedding booking inquiry or RFQ**
(including when sent by a **wedding planner or coordinator** on behalf of a couple), you MUST use **intake**,
even when the message also asks about **pricing, packages, collections, quotes, deposits, coverage, or production details**
(e.g. **audio / sound recording** on the wedding day). Pricing language inside a new lead is still **intake**.

Definitions:
- **intake**: New wedding leads — inquiries, RFQs, availability checks, shortlists, first contact,
  planner-led RFQs for a couple’s future wedding, destination or venue-led booking requests,
  rehearsal / multi-day wedding weekend coverage asks. Technical or AV asks **for the wedding event** stay **intake** when the overall message is still lead-first.

- **commercial**: Use for **commercial-first** threads: existing booked client discussing **invoices, payments, past-due balances,
  contract amendments that are billing-focused**, rate-card / wholesale discussions **without** a new wedding inquiry,
  or non-lead vendor/partnership pitches. If the sender is clearly negotiating **money or contract status on an ongoing booking**
without introducing a **new** wedding inquiry, prefer **commercial**.

- **logistics**: Flights, hotels, destination travel planning, transport, accommodation (when not purely new-lead intake).

- **project_management**: Day-of timelines, vendor coordination, weather contingencies, shot lists for **known** projects.

- **concierge**: General client Q&A, reassurance, what-to-expect — **not** the primary bucket for a brand-new wedding RFQ with dates and venue.

- **studio**: Post-wedding delivery, gallery timelines, album design, print orders.

If unsure between **intake** and **commercial**: ask “Is this mainly a **new wedding lead**?” If yes → **intake**.`;

export async function runTriageAgent(messageText: string): Promise<TriageIntent> {
  const inboundTrim = String(messageText ?? "").trim();
  if (!inboundTrim) {
    return "concierge";
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const userForModel = truncateTriageUserMessage(String(messageText ?? ""));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 10,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userForModel },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const json = await res.json() as {
    choices: { message: { content: string } }[];
  };

  const raw = json.choices[0]?.message?.content?.trim().toLowerCase() ?? "";

  if (VALID_INTENTS.has(raw)) {
    return raw as TriageIntent;
  }

  return "concierge";
}
