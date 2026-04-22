/**
 * Deterministic intent for operator assistant thread / message / email history questions.
 * Used to gate bounded `threads` + `messages` reads (no broad search).
 */

const TOPIC_STOP = new Set(
  `the a an to of in on for with from at by and or is it if we you they are was were be
about what when where which who how why that this there then than our your their
do did does can could should would not no yes just only very more much
please thanks hello hi hey ok okay app help settings weather package balance
phone call calls got another other too also did does doing done
sent send sending email emails thread threads message messages`.split(/\s+/),
);

/** Max topic keywords scored against inbox rows (title + latest sender + snippet). */
export const OPERATOR_INBOX_TOPIC_KEYWORD_CAP = 6;

/** Max characters of latest_body read for keyword / sender matching (bounded). */
export const OPERATOR_INBOX_BODY_SNIPPET_CHARS = 420;

export type OperatorInboxThreadRecencyHint = "today" | "yesterday" | "recent" | null;

export type OperatorInboxThreadLookupSignals = {
  topicKeywords: string[];
  senderPhrases: string[];
  recency: OperatorInboxThreadRecencyHint;
};

/**
 * True when the operator question likely refers to commercial / brand / product inbound
 * (not wedding-couple CRM semantics). Used to avoid wedding index false positives and to
 * steer the prompt toward inbox thread evidence.
 */
export function querySuggestsCommercialOrNonWeddingInboundFocus(queryText: string): boolean {
  const n = normalizeOperatorInboxMatchText(queryText);
  if (!n) return false;
  if (/\b(non[-\s]?wedding|not\s+a\s+wedding|commercial\s+inquir|brand\s+inquir)\b/.test(n)) {
    return true;
  }
  return /\b(skincare|cosmetic|cosmetics|brand|brands|campaign|commercial|corporate|editorial|ecommerce|e commerce|retail|influencer|advertising|lookbook|b2b|catalogue|catalog|launch|product|products|sponsorship|creative\s+agency|commissioned|photo\s+shoot|brand\s+shoot)\b/.test(
    n,
  );
}

/** Normalizes free text for substring matching (sender / title / body snippets). */
export function normalizeOperatorInboxMatchText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic cues for inbox-thread retrieval: multi-keyword topic, sender/name/email
 * fragments, and UTC-calendar recency (aligned with inquiry-count windows).
 */
export function extractOperatorInboxThreadLookupSignals(queryText: string): OperatorInboxThreadLookupSignals {
  const raw = String(queryText ?? "");
  const lower = raw.toLowerCase();
  const norm = normalizeOperatorInboxMatchText(raw);
  const topicKeywords: string[] = [];
  const senderPhrases: string[] = [];

  for (const m of norm.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/g)) {
    const e = m[0]!.trim();
    if (e.length >= 5) senderPhrases.push(e);
  }

  for (const re of [
    /\bfrom\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\bby\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\bcalled\s+([a-z][a-z\s.'-]{2,60})\b/gi,
  ]) {
    for (const m of lower.matchAll(re)) {
      const frag = normalizeOperatorInboxMatchText(m[1] ?? "");
      if (frag.length >= 3 && frag.length <= 48) senderPhrases.push(frag);
    }
  }

  const parts = norm.split(" ").filter((p) => p.length >= 4 && !TOPIC_STOP.has(p));
  const uniq = [...new Set(parts)];
  uniq.sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const p of uniq.slice(0, OPERATOR_INBOX_TOPIC_KEYWORD_CAP)) {
    topicKeywords.push(p);
  }

  let recency: OperatorInboxThreadRecencyHint = null;
  if (/\btoday\b/.test(lower)) recency = "today";
  else if (/\byesterday\b/.test(lower)) recency = "yesterday";
  else if (/\b(recently|this week|past week|last few days|last couple days)\b/.test(lower)) {
    recency = "recent";
  }

  const dedupedSenders = [...new Set(senderPhrases.map((s) => s.trim()).filter(Boolean))];
  return {
    topicKeywords,
    senderPhrases: dedupedSenders.slice(0, 6),
    recency,
  };
}

/**
 * True when the operator is likely asking about thread activity, email sends, or last contact.
 * Kept conservative: unrelated CRM questions should not match.
 */
export function hasOperatorThreadMessageLookupIntent(queryText: string): boolean {
  const s = String(queryText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 3) return false;

  if (
    /\b(email|emails|e-mail|thread|threads|inquiry|inquiries|inbox|message|messages|sent|send|sending|outbound|inbound|reply|replied|whatsapp|dm|dms)\b/.test(s)
  ) {
    return true;
  }
  if (/\b(last|latest)\s+(activity|email|emails|message|messages|thread|contact|time)\b/.test(s)) {
    return true;
  }
  if (/\bwhen\s+did\s+(we|i|you)\s+(last\s+)?(email|send|write|contact)\b/.test(s)) {
    return true;
  }
  if (/\b(did|have|has)\s+(they|we|the client|the couple)\s+(send|sent|email)\b/.test(s)) {
    return true;
  }
  if (/\bwhat\s+(happened|is going on|was that)\b.*\b(inquiry|thread|email)\b/.test(s)) {
    return true;
  }
  if (/\bwhat\s+inquiry\b/.test(s) || /\binquiry\s+is\s+this\b/.test(s)) {
    return true;
  }

  return false;
}

/**
 * Single topic token for bounded `threads.title` match when there is no resolved wedding/person (4–40 chars).
 */
export function extractOperatorThreadTitleSearchToken(queryText: string): string | null {
  const raw = String(queryText ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const parts = raw.split(/\s+/).filter((p) => p.length >= 4 && !TOPIC_STOP.has(p));
  const sorted = [...parts].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const t = sorted[0];
  if (!t || t.length > 40) return null;
  return t;
}
