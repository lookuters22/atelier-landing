/**
 * Gmail users.messages.send — RFC822 raw payload (base64url).
 */
import { fetchWithTimeout } from "../http/fetchWithTimeout.ts";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_HTTP_TIMEOUT_MS = 60_000;

function base64UrlEncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Plain UTF-8 body; CRLF line endings. */
export function buildPlainTextRfc822(opts: {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  inReplyToMessageIdHeader?: string | null;
  referencesHeader?: string | null;
}): string {
  const crlf = "\r\n";
  const lines: string[] = [];
  lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to}`);
  if (opts.cc?.trim()) lines.push(`Cc: ${opts.cc.trim()}`);
  if (opts.bcc?.trim()) lines.push(`Bcc: ${opts.bcc.trim()}`);
  const subj = opts.subject.replace(/\r|\n/g, " ").trim() || "(no subject)";
  lines.push(`Subject: ${subj}`);
  if (opts.inReplyToMessageIdHeader?.trim()) {
    lines.push(`In-Reply-To: ${opts.inReplyToMessageIdHeader.trim()}`);
  }
  if (opts.referencesHeader?.trim()) {
    lines.push(`References: ${opts.referencesHeader.trim()}`);
  }
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push("");
  const body = opts.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  lines.push(body);
  return lines.join(crlf);
}

export async function sendGmailUsersMessagesSend(
  accessToken: string,
  opts: { rawRfc822: string; gmailThreadId?: string | null },
): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
  const raw = base64UrlEncodeUtf8(opts.rawRfc822);
  const body: Record<string, unknown> = { raw };
  if (opts.gmailThreadId) body.threadId = opts.gmailThreadId;

  const res = await fetchWithTimeout(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gmail messages.send failed: ${res.status} ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text) as { id?: string; threadId?: string; labelIds?: string[] };
  if (!json.id || !json.threadId) {
    throw new Error("Gmail messages.send: missing id or threadId in response");
  }
  return { id: json.id, threadId: json.threadId, labelIds: json.labelIds };
}

function headerFromMetadata(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value?.trim() ?? null;
}

export async function getGmailMessageHeaderMessageId(
  accessToken: string,
  gmailMessageId: string,
): Promise<string | null> {
  const u = new URL(`${GMAIL_BASE}/messages/${encodeURIComponent(gmailMessageId)}`);
  u.searchParams.set("format", "metadata");
  u.searchParams.append("metadataHeaders", "Message-ID");
  const res = await fetchWithTimeout(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    payload?: { headers?: { name?: string; value?: string }[] };
  };
  const headers = json.payload?.headers;
  return headerFromMetadata(headers, "Message-ID");
}

/** Message-ID, In-Reply-To, References from anchor message for reply threading. */
export async function getGmailMessageRfc822ReplyHeaders(
  accessToken: string,
  gmailMessageId: string,
): Promise<{
  messageIdRfc: string | null;
  references: string | null;
  inReplyTo: string | null;
}> {
  const u = new URL(`${GMAIL_BASE}/messages/${encodeURIComponent(gmailMessageId)}`);
  u.searchParams.set("format", "metadata");
  u.searchParams.append("metadataHeaders", "Message-ID");
  u.searchParams.append("metadataHeaders", "References");
  u.searchParams.append("metadataHeaders", "In-Reply-To");
  const res = await fetchWithTimeout(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  if (!res.ok) {
    return { messageIdRfc: null, references: null, inReplyTo: null };
  }
  const json = (await res.json()) as {
    payload?: { headers?: { name?: string; value?: string }[] };
  };
  const headers = json.payload?.headers;
  return {
    messageIdRfc: headerFromMetadata(headers, "Message-ID"),
    references: headerFromMetadata(headers, "References"),
    inReplyTo: headerFromMetadata(headers, "In-Reply-To"),
  };
}

/**
 * Build References for a reply: parent References + parent Message-ID (deduped, order preserved).
 */
export function mergeReferencesForReply(
  parentReferences: string | null | undefined,
  parentMessageIdRfc: string | null | undefined,
): string | null {
  const mid = parentMessageIdRfc?.trim() ?? "";
  if (!mid) return parentReferences?.trim() ?? null;
  const tokens: string[] = [];
  const seen = new Set<string>();
  const ref = (parentReferences ?? "").trim();
  if (ref) {
    for (const part of ref.split(/\s+/)) {
      const p = part.trim();
      if (!p) continue;
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      tokens.push(p);
    }
  }
  const kMid = mid.toLowerCase();
  if (!seen.has(kMid)) {
    tokens.push(mid);
  }
  return tokens.length > 0 ? tokens.join(" ") : null;
}
