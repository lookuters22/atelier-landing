/**
 * Cheap deterministic classification of an email local-part for automated / no-reply heuristics.
 * Shared by `gmailRoutingSignals` ingest and `preLlmEmailRouting` sender fallback.
 */

export type EmailLocalPartClass = "no_reply" | "looks_human" | "unknown";

/**
 * Parse `From` or a bare address line: `"Name" <a@b>` or `a@b`.
 */
export function classifyEmailLocalPart(fromOrSenderLine: string | null | undefined): EmailLocalPartClass {
  const raw = String(fromOrSenderLine ?? "").trim();
  if (!raw) return "unknown";
  const email = raw.match(/<([^>]+@[^>]+)>/)?.[1] ?? raw;
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (/^(no-?reply|donotreply|do-not-reply|noreply|mailer-daemon|postmaster|bounce)/i.test(local)) {
    return "no_reply";
  }
  if (local.length > 0) return "looks_human";
  return "unknown";
}
