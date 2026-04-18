/**
 * Normalize email addresses for safe comparison (Gmail +tag, case).
 * Mirrors `supabase/functions/_shared/gmail/mailboxNormalize.ts` — keep in sync when changing rules.
 */

/** Extract first `addr@domain` from a string (handles `Name <email>` and bare email). */
export function extractFirstEmailFromAddressString(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const angle = /<([^>]+@[^>]+)>/i.exec(t);
  if (angle?.[1]) return angle[1].trim();
  const word = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}/.exec(t);
  if (word?.[0]) return word[0].trim();
  return null;
}

/** First mailbox in a To/Cc line (comma-separated). */
export function extractFirstMailboxFromRecipientField(field: string): string | null {
  const t = field.trim();
  if (!t) return null;
  const parts = splitRecipientList(t);
  for (const p of parts) {
    const e = extractFirstEmailFromAddressString(p);
    if (e) return e;
  }
  return null;
}

function splitRecipientList(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '"' && (i === 0 || s[i - 1] !== "\\")) {
      cur += c;
      continue;
    }
    if (c === "<") depth++;
    if (c === ">") depth = Math.max(0, depth - 1);
    if (c === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length > 0 ? out : [s.trim()];
}

/** Gmail treats user+tag@ as user@ for routing. */
export function normalizeMailboxForComparison(email: string): string {
  const extracted = extractFirstEmailFromAddressString(email) ?? email.trim();
  const lower = extracted.toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return lower;
  let local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
  }
  return `${local}@${domain}`;
}

export function mailboxesAreSameMailbox(a: string, b: string): boolean {
  return normalizeMailboxForComparison(a) === normalizeMailboxForComparison(b);
}

/**
 * Local-part patterns that are never a replyable human mailbox. Covers both
 * classic no-reply forms (`noreply`, `mailer-daemon`) and bulk/marketing
 * patterns (`campaign`, `newsletter`, `marketing`, `promo`, `offers`, etc.).
 *
 * NOTE: keep this table in sync with `supabase/functions/_shared/gmail/mailboxNormalize.ts`
 * and with the authoritative classifier in `src/lib/inboundSuppressionClassifier.ts`.
 * Changes here affect UI replyability **and** Gmail import / convert-to-inquiry
 * guards, so add tests when extending.
 */
const SYSTEM_LOCAL_DENY: ReadonlySet<string> = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "bounces",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
  "automated",
  "system",
  "campaign",
  "campaigns",
  "newsletter",
  "newsletters",
  "marketing",
  "promo",
  "promos",
  "promotion",
  "promotions",
  "offers",
  "deals",
  "mailers",
  "mailer",
  "digest",
  "updates",
  "announce",
  "announcements",
]);

/** Tokens inside a local-part (split by `.`, `-`, `_`, `+`) that mark it as non-replyable. */
const SYSTEM_LOCAL_TOKEN_DENY: ReadonlySet<string> = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "campaign",
  "campaigns",
  "newsletter",
  "newsletters",
  "marketing",
  "promo",
  "promos",
  "promotion",
  "promotions",
  "offers",
  "deals",
  "mailers",
  "mailer",
  "digest",
  "notifications",
  "notification",
  "alerts",
  "alert",
  "updates",
]);

/**
 * Heuristic: automated / no-reply / marketing local parts.
 *
 * Catches:
 *   - Bare tokens: `noreply@`, `campaign@`, `newsletter@`.
 *   - Compound tokens separated by `.`, `-`, `_`, `+`:
 *     `email.campaign@sg.booking.com`, `no-reply@`, `brand.marketing@`.
 *   - Run-together forms: `donotreply`, `noreply01`.
 *
 * Conservative by design — returns `false` for normal human local parts like
 * `alice.smith@`, `hello@`, `info@`.
 */
export function isLikelyNonReplyableSystemLocalPart(localPart: string): boolean {
  const base = localPart.split("+")[0]?.toLowerCase() ?? "";
  if (!base) return true;
  if (SYSTEM_LOCAL_DENY.has(base)) return true;
  if (base.startsWith("no-reply") || base.startsWith("noreply")) return true;
  if (base.includes("donotreply")) return true;

  const tokens = base.split(/[.+_\-]/g).filter((t) => t.length > 0);
  for (const t of tokens) {
    if (SYSTEM_LOCAL_TOKEN_DENY.has(t)) return true;
  }
  return false;
}
