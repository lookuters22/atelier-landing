/**
 * Gates a bounded read of `calendar_events` for operator **schedule / what's on** questions only.
 * Not for pure UI navigation ("where do I open the calendar" → app catalog).
 */

/**
 * True when the operator is likely asking about **their** calendar content (upcoming or historical),
 * not how to find the calendar page.
 */
export function hasOperatorCalendarScheduleIntent(queryText: string): boolean {
  const s = String(queryText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 6) return false;

  // Lead/inquiry analytics (“did I get leads this week?”) — not a calendar lookup even with week words
  if (
    /\b(did i|do i have|have i)\b/.test(s) &&
    /\b(lead|leads|inquir|inquiry|customer)\b/.test(s) &&
    !/\b(calendar|schedule|agenda|event|appointment|meeting|booking|session|shoot|busy|free)\b/.test(s)
  ) {
    return false;
  }

  // "Where/how do I open/find the calendar" — app-help / navigation, not a schedule lookup
  if (
    /^(where|how)\b.{0,60}\b(open|find|get to|navigate|go to|access|use)\b.{0,50}\b(calendar|schedule (?:tab|page|view)?)\b/.test(
      s,
    ) &&
    !/\b(what|what's|whats|when|on (?:mon|tue|wed|thu|fri|sat|sun)|on the|next |upcoming|event|busy|free|this week|next week|tomorrow|today|\d{1,2}(?:st|nd|rd|th)?|anything|on my|in my|see what)\b/.test(
      s,
    )
  ) {
    return false;
  }

  const hasContentQuestion = /\b(what|whats?|show|list|tell me|anything|do i have|am i|upcoming|next|when|did we|did i)\b/.test(
    s,
  );
  const hasScheduleNoun = /\b(calendar|schedule|agenda|event|shoot|wedding|booking|appointment|meeting|busy|free|session)\b/.test(
    s,
  );
  const hasTimeRef =
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|this week|next week|last week|that week|yesterday)\b/.test(
      s,
    ) ||
    /\b(?:on|for)\b.{0,12}(?:the\s*)?(?:\d{1,2})(?:st|nd|rd|th)?\b/.test(s) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b.{0,12}\b\d{1,2}(?:st|nd|rd|th)?\b/.test(
      s,
    ) ||
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(
      s,
    );

  const hasHistoricalCue =
    /\b(was|were|happened|ago|historical|history|past|previous|last time|what was on)\b/.test(s) ||
    /\b(last|previous)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/.test(s);

  const hasConsultEdge =
    /\b(last|previous|next)\b.{0,50}\b(consultation|consult|call|meeting|appointment|event|shoot|booking|session)\b/.test(s);

  if (hasConsultEdge && (hasScheduleNoun || hasTimeRef)) {
    return true;
  }

  if (hasContentQuestion && (hasScheduleNoun || hasTimeRef)) {
    return true;
  }
  if (hasHistoricalCue && (hasScheduleNoun || hasTimeRef)) {
    return true;
  }
  if (/\bnext\b.{0,50}\b(shoot|event|wedding|booking|meeting|session)\b/.test(s)) {
    return true;
  }
  if (
    /\b(what|when)\b.{0,30}\b(on|for)\b.{0,20}\b(friday|saturday|sunday|monday|tuesday|wednesday|thursday)\b/.test(
      s,
    )
  ) {
    return true;
  }

  // "When did we last …" + scheduling object
  if (/\bwhen did we last\b.{0,40}\b(consultation|consult|call|meeting|appointment|event)\b/.test(s)) {
    return true;
  }

  return false;
}
