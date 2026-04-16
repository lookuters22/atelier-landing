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

const SYSTEM_LOCAL_DENY = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "bounces",
  "notifications",
]);

/** Heuristic: automated / no-reply style local parts (not exhaustive). */
export function isLikelyNonReplyableSystemLocalPart(localPart: string): boolean {
  const base = localPart.split("+")[0]?.toLowerCase() ?? "";
  if (!base) return true;
  if (SYSTEM_LOCAL_DENY.has(base)) return true;
  if (base.startsWith("no-reply") || base.startsWith("noreply")) return true;
  if (base.includes("donotreply")) return true;
  return false;
}
