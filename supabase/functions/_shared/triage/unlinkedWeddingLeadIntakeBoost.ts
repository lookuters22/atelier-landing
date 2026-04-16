/**
 * Post-LLM correction for unlinked canonical inbox:
 * - `commercial`: pricing-heavy new wedding RFQs misclassified as commercial.
 * - `studio`: planner-led RFQs with audio/sound/production wording misclassified as studio.
 * Narrow heuristic — only upgrades when multiple wedding-lead signals align (score >= threshold).
 */
import type { TriageIntent } from "../agents/triage.ts";

const CORRECTABLE_INTENTS = new Set<TriageIntent>(["commercial", "studio"]);
const INTAKE_SCORE_THRESHOLD = 6;

function looksLikePureNonWeddingCommercialB2b(lower: string, combined: string): boolean {
  if (/\bwedding\b/i.test(combined)) return false;
  if (
    /\b(corporate (video|photography) only|linkedin headshot|product catalog shoot|podcast studio rental)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

/** Invoice / payment-first threads on an existing booking — do not boost to intake. */
function looksLikeExistingBookingPaymentThread(lower: string): boolean {
  if (/\b(payment received|thank you for payment|past due|invoice paid|remittance advice)\b/i.test(lower)) {
    return true;
  }
  if (/\b(contract amendment for booking|balance due on invoice)\b/i.test(lower)) return true;
  return false;
}

/**
 * Post-wedding gallery / album / delivery language — keep `studio`, do not treat as a new lead.
 * Conservative: delivery-ready phrasing, not bare mentions of "gallery" inside a pricing package ask.
 */
function looksLikePostWeddingStudioThread(lower: string): boolean {
  if (
    /\b((the |your )(online )?gallery (is )?(now )?(live|ready|open)|your (wedding )?photos are ready (to view|for download)|proof(ing)? (your )?album selections|download (the )?hi[- ]?res (files|images)?)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(password.{0,30}gallery|gallery (link|password) (below|here|is)|image delivery from your wedding day)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (/\b(print (order|shop) for your album|second (parent )?album|usb (with|of) (your )?wedding photos)\b/i.test(lower)) {
    return true;
  }
  return false;
}

function hasWeddingLeadAnchor(lower: string, combined: string): boolean {
  if (/\b(wedding|ceremony|nuptials|bridal|elopement|matrimony)\b/.test(lower)) return true;
  if (
    /\brfq\b/i.test(combined) &&
    /\b(20[2-9]\d|chateau|villa|destination|september|october|photographer|couple|bridal)\b/i.test(lower)
  ) {
    return true;
  }
  if (/\brfq\b/i.test(combined) && /\b(photograph|wedding|bridal|ceremony|couple|venue)\b/i.test(lower)) {
    return true;
  }
  if (/\b(photograph(er|y))\b/i.test(lower) && /\b(wedding|ceremony)\b/.test(lower)) return true;
  if (/\b(planner|wedding planner|coordinator)\b/i.test(lower) && /\b(couple|bride|groom|wedding)\b/i.test(lower)) {
    return true;
  }
  return false;
}

function computeWeddingLeadScore(title: string, lower: string, combined: string): number {
  let score = 0;
  if (/\b(rfq|request for quote|request for quotation)\b/i.test(combined)) score += 2;
  if (/\b(availability|are you available|shortlist|holding dates?)\b/i.test(lower)) score += 1;
  if (/\b(wedding|ceremony|nuptials|bridal|elopement)\b/.test(lower)) score += 2;
  if (/\b(planner|wedding planner|coordinator|agency)\b/i.test(lower)) score += 1;
  if (/\b20[2-9]\d\b/.test(combined)) score += 1;
  if (
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(lower)
  ) {
    score += 1;
  }
  if (/\b(photographer|photography coverage|wedding photo|photo & video)\b/i.test(lower)) score += 1;
  if (/\b(venue|chateau|villa|destination|resort|reception|tuscany|amalfi|lake como)\b/i.test(lower)) score += 1;
  if (/\b(couple|bride|groom)\b/i.test(lower)) score += 1;
  if (/\b(getting married|we are marrying|our wedding)\b/i.test(lower)) score += 1;

  if (/\b(pricing|package|collection|quote|investment|deposit|retainer)\b/i.test(lower) && score >= 4) {
    score += 1;
  }

  if (/\b(sound|audio|recording|mic|music)\b/i.test(lower) && /\b(wedding|ceremony|reception|event)\b/i.test(lower)) {
    score += 1;
  }

  if (/\s(&|\/\/)\s*[A-Z]/.test(title) || /rfq\s*:/i.test(title)) score += 1;

  return score;
}

/**
 * Correct `commercial` or `studio` → `intake` when the model mislabels a new unlinked wedding lead.
 * Caller should only use for unlinked inbound mail.
 */
export function applyUnlinkedWeddingLeadIntakeBoost(
  llmIntent: TriageIntent,
  body: string,
  threadTitle: string | null | undefined,
): TriageIntent {
  if (!CORRECTABLE_INTENTS.has(llmIntent)) return llmIntent;

  const title = String(threadTitle ?? "").trim();
  const b = String(body ?? "").trim();
  const combined = `${title}\n${b}`;
  const lower = combined.toLowerCase();

  if (looksLikePureNonWeddingCommercialB2b(lower, combined)) return llmIntent;
  if (looksLikeExistingBookingPaymentThread(lower)) return llmIntent;

  /** Do not steal true post-wedding studio (gallery / delivery) threads when LLM said `studio`. */
  if (llmIntent === "studio" && looksLikePostWeddingStudioThread(lower)) {
    return "studio";
  }

  if (!hasWeddingLeadAnchor(lower, combined)) return llmIntent;

  const score = computeWeddingLeadScore(title, lower, combined);

  return score >= INTAKE_SCORE_THRESHOLD ? "intake" : llmIntent;
}
