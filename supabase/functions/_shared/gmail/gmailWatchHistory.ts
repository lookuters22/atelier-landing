/**
 * Gmail users.watch, users.history.list, users.getProfile — Pub/Sub + delta checkpoint helpers.
 * Topic name comes from env `GMAIL_PUBSUB_TOPIC_NAME` only (no per-account column).
 */
import { fetchWithTimeout } from "../http/fetchWithTimeout.ts";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_HTTP_TIMEOUT_MS = 45_000;

/** Gmail system label id for outbound mail (skip in delta so Atelier sends are not re-ingested as inbound). */
export const GMAIL_SENT_LABEL_ID = "SENT";

export class GmailApiError extends Error {
  readonly status: number;
  readonly bodySnippet: string;
  constructor(message: string, status: number, bodySnippet: string) {
    super(message);
    this.name = "GmailApiError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

export type GmailProfile = {
  emailAddress: string;
  historyId: string;
  messagesTotal?: number;
};

/** Parse `users.getProfile` JSON. */
export function parseGmailProfile(json: unknown): GmailProfile | null {
  if (!json || typeof json !== "object") return null;
  const o = json as { emailAddress?: unknown; historyId?: unknown; messagesTotal?: unknown };
  if (typeof o.emailAddress !== "string") return null;
  const hid = coerceGmailHistoryIdFromJson(json);
  if (!hid) return null;
  return {
    emailAddress: o.emailAddress,
    historyId: hid,
    messagesTotal: typeof o.messagesTotal === "number" ? o.messagesTotal : undefined,
  };
}

export async function getGmailProfile(accessToken: string): Promise<GmailProfile> {
  const res = await fetchWithTimeout(`${GMAIL_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  const t = await res.text();
  if (!res.ok) {
    throw new GmailApiError(`Gmail profile failed: ${res.status}`, res.status, t.slice(0, 300));
  }
  let json: unknown;
  try {
    json = JSON.parse(t) as unknown;
  } catch {
    throw new GmailApiError("Gmail profile: invalid JSON", res.status, t.slice(0, 200));
  }
  const p = parseGmailProfile(json);
  if (!p) throw new GmailApiError("Gmail profile: missing fields", res.status, t.slice(0, 200));
  return p;
}

export type GmailHistoryAddedRef = { messageId: string; threadId: string };

export type GmailHistoryListPage = {
  added: GmailHistoryAddedRef[];
  nextPageToken?: string;
  /** Latest history id from the response (checkpoint target when a run completes). */
  historyId: string;
};

function collectMessageAddedFromHistoryJson(json: unknown): GmailHistoryAddedRef[] {
  if (!json || typeof json !== "object") return [];
  const h = (json as { history?: unknown }).history;
  if (!Array.isArray(h)) return [];
  const out: GmailHistoryAddedRef[] = [];
  const seen = new Set<string>();
  for (const rec of h) {
    if (!rec || typeof rec !== "object") continue;
    const messagesAdded = (rec as { messagesAdded?: unknown }).messagesAdded;
    if (!Array.isArray(messagesAdded)) continue;
    for (const ma of messagesAdded) {
      if (!ma || typeof ma !== "object") continue;
      const msg = (ma as { message?: unknown }).message;
      if (!msg || typeof msg !== "object") continue;
      const id = (msg as { id?: unknown }).id;
      const threadId = (msg as { threadId?: unknown }).threadId;
      if (typeof id !== "string" || typeof threadId !== "string") continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ messageId: id, threadId });
    }
  }
  return out;
}

/** Gmail REST may return `historyId` as string or number (uint64). */
export function coerceGmailHistoryIdFromJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const h = (json as { historyId?: unknown }).historyId;
  if (typeof h === "string" && h.length > 0) return h;
  if (typeof h === "number" && Number.isFinite(h)) return String(Math.trunc(h));
  if (typeof h === "bigint") return h.toString();
  return null;
}

function parseHistoryIdFromJson(json: unknown): string | null {
  return coerceGmailHistoryIdFromJson(json);
}

/**
 * Single page of `users.history.list` — only `messageAdded` history records (new mail).
 */
export async function listGmailHistoryMessageAddedPage(
  accessToken: string,
  startHistoryId: string,
  opts?: { pageToken?: string; maxResults?: number },
): Promise<GmailHistoryListPage> {
  const u = new URL(`${GMAIL_BASE}/history`);
  u.searchParams.set("startHistoryId", startHistoryId);
  u.searchParams.set("historyTypes", "messageAdded");
  u.searchParams.set("maxResults", String(opts?.maxResults ?? 100));
  if (opts?.pageToken) u.searchParams.set("pageToken", opts.pageToken);

  const res = await fetchWithTimeout(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  const t = await res.text();
  if (res.status === 404) {
    throw new GmailApiError(`Gmail history.list not found (invalid/expired startHistoryId): ${res.status}`, 404, t.slice(0, 300));
  }
  if (!res.ok) {
    throw new GmailApiError(`Gmail history.list failed: ${res.status}`, res.status, t.slice(0, 300));
  }
  let json: unknown;
  try {
    json = JSON.parse(t) as unknown;
  } catch {
    throw new GmailApiError("Gmail history.list: invalid JSON", res.status, t.slice(0, 200));
  }
  const historyId = parseHistoryIdFromJson(json);
  if (!historyId) {
    throw new GmailApiError("Gmail history.list: missing historyId", res.status, t.slice(0, 200));
  }
  const nextRaw = (json as { nextPageToken?: unknown }).nextPageToken;
  const nextPageToken = typeof nextRaw === "string" && nextRaw.length > 0 ? nextRaw : undefined;
  return {
    added: collectMessageAddedFromHistoryJson(json),
    nextPageToken,
    historyId,
  };
}

export type GmailWatchStartResult = {
  historyId: string;
  expiration: string;
};

/** `users.watch` — `topicName` is full resource name e.g. projects/x/topics/y. */
export async function startGmailUsersWatch(
  accessToken: string,
  topicName: string,
): Promise<GmailWatchStartResult> {
  const res = await fetchWithTimeout(`${GMAIL_BASE}/watch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ topicName }),
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  const t = await res.text();
  if (!res.ok) {
    throw new GmailApiError(`Gmail watch failed: ${res.status}`, res.status, t.slice(0, 300));
  }
  let json: unknown;
  try {
    json = JSON.parse(t) as unknown;
  } catch {
    throw new GmailApiError("Gmail watch: invalid JSON", res.status, t.slice(0, 200));
  }
  const historyIdRaw = (json as { historyId?: unknown }).historyId;
  const expirationRaw = (json as { expiration?: unknown }).expiration;
  const historyId =
    typeof historyIdRaw === "string"
      ? historyIdRaw
      : typeof historyIdRaw === "number" && Number.isFinite(historyIdRaw)
        ? String(Math.trunc(historyIdRaw))
        : null;
  const expiration =
    typeof expirationRaw === "string"
      ? expirationRaw
      : typeof expirationRaw === "number" && Number.isFinite(expirationRaw)
        ? String(Math.trunc(expirationRaw))
        : null;
  if (!historyId || !expiration) {
    throw new GmailApiError("Gmail watch: missing historyId/expiration", res.status, t.slice(0, 200));
  }
  return { historyId, expiration };
}

export async function stopGmailUsersWatch(accessToken: string): Promise<void> {
  const res = await fetchWithTimeout(`${GMAIL_BASE}/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new GmailApiError(`Gmail stop failed: ${res.status}`, res.status, t.slice(0, 300));
  }
}

export type GmailMessagesListPage = {
  messageIds: string[];
  nextPageToken?: string;
};

/**
 * Bounded `users.messages.list` for catch-up (e.g. 404 recovery). Uses Gmail `q` query.
 */
export async function listGmailMessagesListPage(
  accessToken: string,
  opts: { q: string; maxResults: number; pageToken?: string },
): Promise<GmailMessagesListPage> {
  const u = new URL(`${GMAIL_BASE}/messages`);
  u.searchParams.set("q", opts.q);
  u.searchParams.set("maxResults", String(opts.maxResults));
  if (opts.pageToken) u.searchParams.set("pageToken", opts.pageToken);

  const res = await fetchWithTimeout(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  const t = await res.text();
  if (!res.ok) {
    throw new GmailApiError(`Gmail messages.list failed: ${res.status}`, res.status, t.slice(0, 300));
  }
  let json: unknown;
  try {
    json = JSON.parse(t) as unknown;
  } catch {
    throw new GmailApiError("Gmail messages.list: invalid JSON", res.status, t.slice(0, 200));
  }
  const messages = (json as { messages?: { id?: string }[] }).messages ?? [];
  const messageIds = messages.map((m) => m.id).filter((id): id is string => typeof id === "string");
  const nextRaw = (json as { nextPageToken?: unknown }).nextPageToken;
  const nextPageToken = typeof nextRaw === "string" && nextRaw.length > 0 ? nextRaw : undefined;
  return { messageIds, nextPageToken };
}
