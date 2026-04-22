/**
 * Deterministic intent for operator assistant **inquiry count / day vs day / week** questions.
 * Gates a bounded read of `v_thread_first_inbound_at` — not general reporting.
 */

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
