/**
 * Decode Google Pub/Sub push body → Gmail mailbox notification JSON.
 */

/** Gmail may report the same mailbox as `@gmail.com` or `@googlemail.com`; Pub/Sub uses one, DB may store the other. */
export function gmailMailboxLookupVariants(emailLowerTrimmed: string): string[] {
  const e = emailLowerTrimmed.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return [e];
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const out = new Set<string>([e]);
  if (domain === "gmail.com") {
    out.add(`${local}@googlemail.com`);
  } else if (domain === "googlemail.com") {
    out.add(`${local}@gmail.com`);
  }
  return [...out];
}

/** Gmail JSON often uses string uint64; some serializers emit numbers — normalize for logs + downstream. */
export function coerceGmailHistoryId(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "bigint") return value.toString();
  return undefined;
}

/**
 * True when the persisted `gmail_last_history_id` is already at or past the Pub/Sub notification's `historyId`
 * (duplicate or reordered events — safe to skip `history.list` for this notification).
 */
export function isStoredHistoryIdAtOrAfterNotification(
  storedHistoryId: string,
  notificationHistoryId: string,
): boolean {
  try {
    return BigInt(storedHistoryId.trim()) >= BigInt(notificationHistoryId.trim());
  } catch {
    return false;
  }
}

export function parseGmailPubSubNotification(body: unknown): { emailAddress: string; historyId?: string } | null {
  if (!body || typeof body !== "object") return null;
  const msg = (body as { message?: { data?: unknown } }).message;
  const dataB64 = msg?.data;
  if (typeof dataB64 !== "string" || dataB64.length === 0) return null;
  let decoded: string;
  try {
    decoded = atob(dataB64.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    try {
      decoded = atob(dataB64);
    } catch {
      return null;
    }
  }
  let inner: unknown;
  try {
    inner = JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }
  if (!inner || typeof inner !== "object") return null;
  const emailAddress = (inner as { emailAddress?: unknown }).emailAddress;
  const historyIdRaw = (inner as { historyId?: unknown }).historyId;
  if (typeof emailAddress !== "string" || emailAddress.length === 0) return null;
  const hid = coerceGmailHistoryId(historyIdRaw);
  return {
    emailAddress: emailAddress.trim().toLowerCase(),
    ...(hid ? { historyId: hid } : {}),
  };
}
