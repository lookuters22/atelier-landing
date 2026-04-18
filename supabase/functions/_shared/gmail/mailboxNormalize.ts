/**
 * Normalize email addresses for safe comparison (Gmail +tag, case).
 * Keep in sync with `src/lib/mailboxNormalize.ts`.
 */

export function extractFirstEmailFromAddressString(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const angle = /<([^>]+@[^>]+)>/i.exec(t);
  if (angle?.[1]) return angle[1].trim();
  const word = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}/.exec(t);
  if (word?.[0]) return word[0].trim();
  return null;
}

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
 * System / bulk / marketing local-part denylist. Mirrors `src/lib/mailboxNormalize.ts`
 * and must be kept in sync with `src/lib/inboundSuppressionClassifier.ts`.
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
 * Heuristic: automated / no-reply / marketing local parts. Keep parity with
 * `src/lib/mailboxNormalize.ts#isLikelyNonReplyableSystemLocalPart`.
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
