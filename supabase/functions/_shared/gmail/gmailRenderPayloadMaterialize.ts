/**
 * Build Slice-1 `GmailRenderPayloadV1` for `messages.raw_payload` during Gmail materialization.
 * Keep field names aligned with `src/lib/gmailRenderPayload.ts` (client decode).
 *
 * Stores only render-critical MIME subsets (HTML/plain as base64url + inline `cid` bytes already
 * present on the Gmail payload). No full API message JSON, headers, or attachment fetches here.
 */
import { decodeBase64UrlToBytes } from "./gmailBase64.ts";
import { GMAIL_HTML_MAX_STORAGE_CHARS } from "./gmailHtmlLimits.ts";
import {
  extractCidReferencesFromHtml,
  normalizeContentIdForMatch,
  type GmailAttachmentCandidate,
} from "./gmailMimeAttachments.ts";

/** Match `MAX_STORED_BODY_CHARS` in `gmailMessageBody.ts` (canonical `messages.body` cap). */
const MAX_STORED_PLAIN_CHARS = 500_000;

/** Soft cap on serialized JSON size for hot `messages` rows (Postgres jsonb). */
const MAX_RENDER_PAYLOAD_JSON_CHARS = 450_000;

const MAX_INLINE_PARTS = 32;
/** Per-part decoded size cap — skips huge inlined images. */
const MAX_INLINE_PART_DECODED_BYTES = 512_000;
/** Total decoded bytes for all inline parts. */
const MAX_INLINE_TOTAL_DECODED_BYTES = 2_000_000;

export const GMAIL_RENDER_PAYLOAD_VERSION = 1 as const;
export const GMAIL_RENDER_PROVIDER = "gmail" as const;

export type GmailRenderInlineRelatedPartV1 = {
  cid: string;
  mime_type: string;
  data_base64url: string;
};

/**
 * UTF-8 → Gmail-style base64url (same alphabet as API `body.data`; client decodes with padding fix).
 */
export function encodeUtf8StringToGmailBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function truncateHtml(html: string | null): string | null {
  if (html == null) return null;
  if (html.length <= GMAIL_HTML_MAX_STORAGE_CHARS) return html;
  return html.slice(0, GMAIL_HTML_MAX_STORAGE_CHARS);
}

function truncatePlain(plain: string | null): string | null {
  if (plain == null) return null;
  if (plain.length <= MAX_STORED_PLAIN_CHARS) return plain;
  return plain.slice(0, MAX_STORED_PLAIN_CHARS);
}

/**
 * Inline MIME parts referenced by `cid:` in HTML, using bytes already on the Gmail payload
 * (`inlineDataBase64Url`). Skips parts that require `attachments.get` — no extra network I/O here.
 */
export function collectGmailInlineRelatedPartsForHtml(
  html: string | null | undefined,
  raw: GmailAttachmentCandidate[],
): GmailRenderInlineRelatedPartV1[] {
  const htmlTrim = html?.trim() ?? "";
  if (htmlTrim.length === 0) return [];
  const cidRefs = extractCidReferencesFromHtml(htmlTrim);
  if (cidRefs.size === 0) return [];

  const out: GmailRenderInlineRelatedPartV1[] = [];
  let totalDecoded = 0;

  for (const c of raw) {
    if (out.length >= MAX_INLINE_PARTS) break;
    if (!c.contentId || !c.inlineDataBase64Url) continue;
    const norm = normalizeContentIdForMatch(c.contentId);
    if (!cidRefs.has(norm)) continue;
    let decodedLen = 0;
    try {
      decodedLen = decodeBase64UrlToBytes(c.inlineDataBase64Url).byteLength;
    } catch {
      continue;
    }
    if (decodedLen > MAX_INLINE_PART_DECODED_BYTES) continue;
    if (totalDecoded + decodedLen > MAX_INLINE_TOTAL_DECODED_BYTES) continue;
    totalDecoded += decodedLen;
    const mime = c.mimeType.split(";")[0]!.trim() || "application/octet-stream";
    out.push({
      cid: c.contentId,
      mime_type: mime,
      data_base64url: c.inlineDataBase64Url,
    });
  }
  return out;
}

export type BuildGmailRenderPayloadV1Input = {
  gmailMessageId: string;
  gmailThreadId: string;
  plain: string | null;
  html: string | null;
  rawAttachmentCandidates: GmailAttachmentCandidate[];
};

/**
 * Build a size-capped JSON object suitable for `messages.raw_payload`.
 * Drops heaviest fields first (inline parts → HTML → plain) so legacy metadata HTML paths remain.
 */
export function buildSizeCappedGmailRenderPayloadV1(
  input: BuildGmailRenderPayloadV1Input,
): Record<string, unknown> {
  const baseIds = {
    version: GMAIL_RENDER_PAYLOAD_VERSION,
    provider: GMAIL_RENDER_PROVIDER,
    gmail_message_id: input.gmailMessageId,
    gmail_thread_id: input.gmailThreadId,
  };

  let htmlSrc = truncateHtml(input.html);
  let plainSrc = truncatePlain(input.plain);
  let inlineParts = collectGmailInlineRelatedPartsForHtml(htmlSrc, input.rawAttachmentCandidates);

  function encodedPair(): {
    html_base64url: string | null;
    plain_base64url: string | null;
    inline_related_parts: GmailRenderInlineRelatedPartV1[] | null;
  } {
    let html_base64url: string | null = null;
    let plain_base64url: string | null = null;
    try {
      const ht = htmlSrc?.trim() ?? "";
      if (ht.length > 0) html_base64url = encodeUtf8StringToGmailBase64Url(ht);
    } catch {
      html_base64url = null;
    }
    try {
      const pt = plainSrc?.trim() ?? "";
      if (pt.length > 0) plain_base64url = encodeUtf8StringToGmailBase64Url(pt);
    } catch {
      plain_base64url = null;
    }
    return {
      html_base64url,
      plain_base64url,
      inline_related_parts: inlineParts.length > 0 ? inlineParts : null,
    };
  }

  function pack(): Record<string, unknown> {
    const enc = encodedPair();
    return {
      ...baseIds,
      ...enc,
    };
  }

  let payload = pack();
  if (jsonLen(payload) <= MAX_RENDER_PAYLOAD_JSON_CHARS) return payload;

  inlineParts = [];
  payload = pack();
  if (jsonLen(payload) <= MAX_RENDER_PAYLOAD_JSON_CHARS) return payload;

  htmlSrc = null;
  payload = pack();
  if (jsonLen(payload) <= MAX_RENDER_PAYLOAD_JSON_CHARS) return payload;

  while (plainSrc && plainSrc.trim().length > 0) {
    payload = pack();
    if (jsonLen(payload) <= MAX_RENDER_PAYLOAD_JSON_CHARS) return payload;
    plainSrc = plainSrc.slice(0, Math.floor(plainSrc.length * 0.85));
  }
  plainSrc = null;

  payload = pack();
  if (jsonLen(payload) <= MAX_RENDER_PAYLOAD_JSON_CHARS) return payload;

  return {
    ...baseIds,
    html_base64url: null,
    plain_base64url: null,
    inline_related_parts: null,
    render_payload_truncated: true,
  };
}

function jsonLen(o: Record<string, unknown>): number {
  return JSON.stringify(o).length;
}
