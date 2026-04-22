/**
 * Deterministic intent for operator assistant **inquiry count / day vs day / week** questions.
 * Gates a bounded read of `v_thread_first_inbound_at` — not general reporting.
 */

import { hasOperatorThreadMessageLookupIntent } from "./operatorAssistantThreadMessageLookupIntent.ts";

/**
 * True when the operator is likely asking for counts of new inquiries over calendar windows
 * (today, yesterday, this week, last week) or comparing them.
 * Kept stricter than thread-history intent to avoid double-fetching on “this week’s inquiry email”-style phrasing.
 */
export function hasOperatorInquiryCountIntent(queryText: string): boolean {
  const s = String(queryText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 8) return false;

  // Plural "leads" (sales) without "new": e.g. "more leads today than yesterday" — not bare "lead" (too ambiguous).
  const inquiryOrLead = /\b(inquir(y|ies)|leads|new\s+leads?|lead\s+count|inbox\s+leads?)\b/.test(s);
  if (!inquiryOrLead) return false;

  // `then yesterday` is a very common autocorrect/typo for `than yesterday`; require `then` + window word (not a bare "then").
  const countOrCompare = /\b(how\s+many|number\s+of|how\s+much|count|totals?|more|fewer|less|vs\.?|versus|compared|comparison|(?:than|then)\s+yesterday|(?:than|then)\s+last|delta)\b/.test(
    s,
  );
  const timeWindow = /\b(today|yesterday|this\s+week|last\s+week|week\s+so\s+far|daily|weekly|per\s+day|per\s+week)\b/.test(
    s,
  );
  const receivedOrInflow = /\b(received|got|came\s+in|incoming|arrivals?|per\s+day|per\s+week)\b/.test(
    s,
  );

  if (countOrCompare) return true;
  if (timeWindow && receivedOrInflow) return true;
  if (timeWindow && /\b(new)\b/.test(s) && /\b(inquir|leads?)\b/.test(s)) return true;

  return false;
}

/** @internal Keep aligned with `OPERATOR_ANA_CARRY_FORWARD_MAX_AGE_SECONDS` in carry-forward (Slice 6). */
const INQUIRY_COUNT_CARRY_MAX_AGE_SEC = 180;

/**
 * When the **prior** turn was in the inquiry-count domain (client carry-forward) and the current
 * question is a short, time-bucketed follow-up ("how many yesterday?", "what about last week?"),
 * treat it as inquiry-count intent even though the elliptical wording omits "inquiry/leads".
 * Does not run in fresh sessions (no valid pointer) or when thread/email lookup intent is stronger.
 */
export function hasOperatorInquiryCountContinuityIntent(
  queryText: string,
  carryForward: { lastDomain: string; ageSeconds: number } | null,
): boolean {
  if (carryForward == null) return false;
  if (carryForward.lastDomain !== "inquiry_counts") return false;
  if (carryForward.ageSeconds > INQUIRY_COUNT_CARRY_MAX_AGE_SEC) return false;
  if (hasOperatorInquiryCountIntent(queryText)) return false;
  if (hasOperatorThreadMessageLookupIntent(queryText)) return false;

  const s = String(queryText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 4 || s.length > 96) return false;

  const hasTime = /\b(today|yesterday|this\s+week|last\s+week|week\s+so\s+far)\b/.test(s);
  if (!hasTime) return false;

  return (
    /\b(how many|how much|number of|count|totals?|what about|compared|vs\.?|versus|more|fewer|less|delta|per\s+day|per\s+week)\b/i.test(
      s,
    ) || /^(and|or|so|ok)\b/i.test(s)
  );
}
