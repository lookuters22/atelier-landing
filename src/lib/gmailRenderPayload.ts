/**
 * Minimal Gmail client render payload (Slice 1 — contract + browser extraction only).
 *
 * Intended for compact storage on `messages.raw_payload` (or a future Storage pointer).
 * Does **not** include full Gmail API message JSON, header history, or non-render MIME parts.
 *
 * Decode semantics align with `supabase/functions/_shared/gmail/gmailBase64.ts` and
 * `gmailMessageBody.ts` (`decodeBase64UrlUtf8`).
 *
 * Server materialization writes the same v1 shape (size-capped) via
 * `supabase/functions/_shared/gmail/gmailRenderPayloadMaterialize.ts`.
 *
 * @see docs/v3/CLIENT_SIDE_GMAIL_HTML_RENDERING_SLICES.md
 */

export const GMAIL_RENDER_PAYLOAD_VERSION = 1 as const;

/** Provider discriminator for future non-Gmail render sources. */
export const GMAIL_RENDER_PROVIDER = "gmail" as const;

/**
 * Single inline related part (e.g. `multipart/related` image for `cid:` references).
 * Only assets needed to render HTML — not normal file attachments.
 */
export type GmailRenderInlineRelatedPartV1 = {
  /** Content-ID value (without or with angle brackets; matching is normalized). */
  cid: string;
  mime_type: string;
  /** Gmail-style base64url-encoded body bytes. */
  data_base64url: string;
};

/**
 * Compact v1 render payload: HTML/plain bodies as base64url strings plus optional inline `cid` parts.
 * Omit heavy fields by design (no raw API payload, no full headers).
 */
export type GmailRenderPayloadV1 = {
  version: typeof GMAIL_RENDER_PAYLOAD_VERSION;
  provider: typeof GMAIL_RENDER_PROVIDER;
  gmail_message_id: string;
  gmail_thread_id: string;
  html_base64url?: string | null;
  plain_base64url?: string | null;
  inline_related_parts?: GmailRenderInlineRelatedPartV1[] | null;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isNullableString(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || typeof v === "string";
}

function isInlinePart(v: unknown): v is GmailRenderInlineRelatedPartV1 {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    isNonEmptyString(o.cid) &&
    isNonEmptyString(o.mime_type) &&
    isNonEmptyString(o.data_base64url)
  );
}

/**
 * Runtime type guard for `GmailRenderPayloadV1`.
 */
export function isGmailRenderPayloadV1(value: unknown): value is GmailRenderPayloadV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (o.version !== GMAIL_RENDER_PAYLOAD_VERSION) return false;
  if (o.provider !== GMAIL_RENDER_PROVIDER) return false;
  if (!isNonEmptyString(o.gmail_message_id) || !isNonEmptyString(o.gmail_thread_id)) return false;
  if (!isNullableString(o.html_base64url) || !isNullableString(o.plain_base64url)) return false;
  const irp = o.inline_related_parts;
  if (irp !== null && irp !== undefined) {
    if (!Array.isArray(irp) || !irp.every(isInlinePart)) return false;
  }
  return true;
}

export type ParseGmailRenderPayloadResult =
  | { ok: true; payload: GmailRenderPayloadV1 }
  | { ok: false; error: string };

/**
 * Parse unknown JSON value into `GmailRenderPayloadV1` or a structured error.
 */
export function parseGmailRenderPayloadJson(value: unknown): ParseGmailRenderPayloadResult {
  if (!isGmailRenderPayloadV1(value)) {
    return { ok: false, error: "not a valid GmailRenderPayloadV1" };
  }
  return { ok: true, payload: value };
}

/** Keys persisted for v1 render payloads (`messages.raw_payload` may add extras like `snippet`). */
const GMAIL_RENDER_PAYLOAD_V1_KEYS = [
  "version",
  "provider",
  "gmail_message_id",
  "gmail_thread_id",
  "html_base64url",
  "plain_base64url",
  "inline_related_parts",
] as const;

/**
 * Pick only v1 render fields from a loose `raw_payload` object (ignores `snippet`, etc.).
 */
export function pickGmailRenderPayloadFieldsFromRawPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of GMAIL_RENDER_PAYLOAD_V1_KEYS) {
    if (Object.prototype.hasOwnProperty.call(o, k)) {
      out[k] = o[k];
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}

/**
 * Parse a compact Gmail render payload from `messages.raw_payload`.
 * Accepts objects with extra keys; validates only the v1 render subset.
 */
export function tryParseGmailRenderPayloadFromMessageRawPayload(raw: unknown): GmailRenderPayloadV1 | null {
  if (isGmailRenderPayloadV1(raw)) return raw;
  const picked = pickGmailRenderPayloadFieldsFromRawPayload(raw);
  if (picked && isGmailRenderPayloadV1(picked)) return picked;
  return null;
}

/**
 * Browser-decoded HTML suitable for {@link trySanitizeEmailHtmlForIframe} / `EmailHtmlIframe`, or null to use legacy sources.
 * Prefer CID resolution for inline `multipart/related` assets when present.
 */
export function tryExtractRenderableHtmlFromMessageRawPayload(
  raw: unknown,
  options?: { resolveCid?: boolean },
): string | null {
  const payload = tryParseGmailRenderPayloadFromMessageRawPayload(raw);
  if (!payload) return null;
  const extracted = extractRenderableHtmlFromGmailRenderPayloadWithOptions(payload, {
    resolveCid: options?.resolveCid ?? true,
  });
  return extracted?.html ?? null;
}

// ── Base64URL (aligned with supabase/functions/_shared/gmail/gmailBase64.ts) ───────────────

/**
 * Decode Gmail API base64url to raw bytes (browser-safe).
 */
export function decodeGmailBase64UrlToBytes(data: string): Uint8Array {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decode Gmail base64url body to a UTF-8 string (same semantics as `decodeBase64UrlUtf8` in `gmailMessageBody.ts`).
 */
export function decodeGmailBase64UrlToUtf8String(data: string): string {
  return new TextDecoder("utf-8").decode(decodeGmailBase64UrlToBytes(data));
}

/** Standard base64 for data: URLs (not base64url). */
export function bytesToStandardBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Extraction ───────────────────────────────────────────────────────────────────────────────

export type DecodedGmailRenderBodies = {
  html: string | null;
  plain: string | null;
};

/**
 * Decode optional HTML and plain parts from the payload (no CID rewriting).
 */
export function decodeBodiesFromGmailRenderPayload(payload: GmailRenderPayloadV1): DecodedGmailRenderBodies {
  let html: string | null = null;
  let plain: string | null = null;
  const h = payload.html_base64url;
  const p = payload.plain_base64url;
  if (typeof h === "string" && h.length > 0) {
    try {
      html = decodeGmailBase64UrlToUtf8String(h);
    } catch {
      html = null;
    }
  }
  if (typeof p === "string" && p.length > 0) {
    try {
      plain = decodeGmailBase64UrlToUtf8String(p);
    } catch {
      plain = null;
    }
  }
  return { html, plain };
}

/** Minimal HTML document wrapping plain text for iframe/sanitizer pipelines. */
export function escapeHtmlForEmailPlainText(plain: string): string {
  return plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToMinimalHtmlDocument(plain: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre>${escapeHtmlForEmailPlainText(plain)}</pre></body></html>`;
}

export type ExtractRenderableEmailFromPayloadResult = {
  /** Prefer `html` for rich rendering; `plain` document only when HTML missing. */
  kind: "html" | "plain";
  /** HTML string (full document when kind is `plain` minimal wrapper). */
  html: string;
};

/**
 * Prefer decoded HTML; if absent or empty, fall back to plain text as a minimal HTML document.
 */
export function extractRenderableHtmlFromGmailRenderPayload(
  payload: GmailRenderPayloadV1,
): ExtractRenderableEmailFromPayloadResult | null {
  const { html, plain } = decodeBodiesFromGmailRenderPayload(payload);
  const h = html?.trim() ?? "";
  if (h.length > 0) return { kind: "html", html: h };
  const t = plain?.trim() ?? "";
  if (t.length > 0) return { kind: "plain", html: plainTextToMinimalHtmlDocument(t) };
  return null;
}

function normalizeCidKey(cid: string): string {
  return cid.trim().replace(/^<|>$/g, "").toLowerCase();
}

/**
 * Build a map from normalized Content-ID key → `data:` URL for inline images.
 */
export function inlineRelatedPartsToDataUrlMap(
  parts: GmailRenderInlineRelatedPartV1[] | null | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!parts?.length) return map;
  for (const part of parts) {
    try {
      const bytes = decodeGmailBase64UrlToBytes(part.data_base64url);
      const b64 = bytesToStandardBase64(bytes);
      const mime = part.mime_type.trim() || "application/octet-stream";
      const dataUrl = `data:${mime};base64,${b64}`;
      map.set(normalizeCidKey(part.cid), dataUrl);
    } catch {
      /* skip bad part */
    }
  }
  return map;
}

/**
 * Replace `cid:` references in HTML `src` / `srcset` / `url()` with `data:` URLs when a matching inline part exists.
 */
export function applyInlineRelatedPartsToHtml(
  html: string,
  parts: GmailRenderInlineRelatedPartV1[] | null | undefined,
): string {
  const map = inlineRelatedPartsToDataUrlMap(parts);
  if (map.size === 0) return html;

  function replaceCidToken(raw: string): string {
    const key = normalizeCidKey(raw.replace(/^cid:/i, ""));
    const dataUrl = map.get(key);
    return dataUrl ?? raw;
  }

  let out = html;
  out = out.replace(/\bsrc\s*=\s*(["'])(cid:[^"']+)\1/gi, (_m, q: string, inner: string) => {
    const replaced = replaceCidToken(inner);
    return `src=${q}${replaced}${q}`;
  });
  out = out.replace(/\bsrcset\s*=\s*(["'])([^"']*)\1/gi, (_m, q: string, inner: string) => {
    const replaced = inner.replace(/\bcid:[^\s,]+/gi, (tok) => replaceCidToken(tok));
    return `srcset=${q}${replaced}${q}`;
  });
  out = out.replace(/\burl\s*\(\s*(["']?)(cid:[^"')]+)\1\s*\)/gi, (_m, _q: string, inner: string) => {
    return `url(${replaceCidToken(inner)})`;
  });
  return out;
}

/**
 * Full extraction: decode bodies, optionally rewrite `cid:` to `data:` URLs, then return renderable HTML or null.
 */
export function extractRenderableHtmlFromGmailRenderPayloadWithOptions(
  payload: GmailRenderPayloadV1,
  options?: { resolveCid?: boolean },
): ExtractRenderableEmailFromPayloadResult | null {
  const base = extractRenderableHtmlFromGmailRenderPayload(payload);
  if (!base) return null;
  if (!options?.resolveCid || base.kind === "plain") return base;
  const parts = payload.inline_related_parts ?? undefined;
  if (!parts?.length) return base;
  return { kind: base.kind, html: applyInlineRelatedPartsToHtml(base.html, parts) };
}
