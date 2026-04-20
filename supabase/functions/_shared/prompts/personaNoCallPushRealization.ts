/**
 * Voice realization for **no_call_push** first-touch inquiries: email-first, no proactive live-call steer.
 * Appended to the orchestrator user message when {@link INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER} is in facts.
 */

/** Must match the heading line in {@link buildNoCallPushEmailFirstUserHintBlock}. */
export const PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER =
  "=== No-call-push inquiry — email-first (voice) ===";

/**
 * User-message addendum for structured persona drafting (orchestrator rewrite path).
 * Triggered when facts include `INQUIRY_REPLY_NO_CALL_PUSH_EMAIL_FIRST_MARKER` from deriveInquiryReplyPlan.
 */
export function buildNoCallPushEmailFirstUserHintBlock(): string {
  return [
    "",
    PERSONA_NO_CALL_PUSH_REALIZATION_SECTION_MARKER,
    "**Tenant policy: no proactive call push on this turn.** Stay in email—warm, direct, lightly human—not a booking funnel.",
    "- **Do** answer what they asked; **match** warmth briefly—do **not** paraphrase their aesthetic adjectives or summarize their mood back to them; one short hospitality beat is fine.",
    "- **Do** invite more detail **in email** if useful—plain planning language (day, date, venue, what matters most). Avoid literary follow-ups (\"what the day feels like in your minds\") or validating their wording as poetry.",
    "- **Do not** propose a phone/video call, a “conversation” as the **best next move**, or scheduling as the implied path unless the client already asked to talk live.",
    "- **Do not** use lines like “The best way forward would be a conversation…”, “Would a call work for you…”, “let’s connect on a call”, or “hop on a quick call” as the steer—those violate this policy even when phrased softly.",
    "- **If** a light next step fits: prefer email-first phrasing such as being glad to hear more here, or asking them to share a bit more when it helps—**not** a live conversation as default.",
    "- **Format:** In `email_draft_lines`, put **Hi [Names],** alone in the first string; intro + studio in the second—do not merge into one paragraph (same rule as system anti-brochure layout).",
  ].join("\n");
}
