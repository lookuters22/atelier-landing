import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  applyInlineRelatedPartsToHtml,
  decodeGmailBase64UrlToUtf8String,
  extractRenderableHtmlFromGmailRenderPayload,
  extractRenderableHtmlFromGmailRenderPayloadWithOptions,
  GMAIL_RENDER_PAYLOAD_VERSION,
  GMAIL_RENDER_PROVIDER,
  isGmailRenderPayloadV1,
  parseGmailRenderPayloadJson,
  pickGmailRenderPayloadFieldsFromRawPayload,
  tryExtractRenderableHtmlFromMessageRawPayload,
  tryParseGmailRenderPayloadFromMessageRawPayload,
  type GmailRenderPayloadV1,
} from "./gmailRenderPayload";

function toGmailBase64UrlUtf8(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function minimalPayload(overrides: Partial<GmailRenderPayloadV1> = {}): GmailRenderPayloadV1 {
  return {
    version: GMAIL_RENDER_PAYLOAD_VERSION,
    provider: GMAIL_RENDER_PROVIDER,
    gmail_message_id: "m1",
    gmail_thread_id: "t1",
    ...overrides,
  };
}

describe("gmailRenderPayload", () => {
  it("isGmailRenderPayloadV1 accepts v1 gmail payload", () => {
    const p = minimalPayload({ html_base64url: toGmailBase64UrlUtf8("<p>x</p>") });
    expect(isGmailRenderPayloadV1(p)).toBe(true);
  });

  it("rejects wrong version or provider", () => {
    expect(isGmailRenderPayloadV1({ ...minimalPayload(), version: 2 as unknown as 1 })).toBe(false);
    expect(isGmailRenderPayloadV1({ ...minimalPayload(), provider: "other" as "gmail" })).toBe(false);
  });

  it("parseGmailRenderPayloadJson returns structured error for invalid input", () => {
    expect(parseGmailRenderPayloadJson(null).ok).toBe(false);
  });

  it("decodeGmailBase64UrlToUtf8String round-trips UTF-8", () => {
    const s = "café ☃";
    const b64url = toGmailBase64UrlUtf8(s);
    expect(decodeGmailBase64UrlToUtf8String(b64url)).toBe(s);
  });

  it("extractRenderableHtml prefers HTML over plain", () => {
    const p = minimalPayload({
      html_base64url: toGmailBase64UrlUtf8("<b>hi</b>"),
      plain_base64url: toGmailBase64UrlUtf8("plain"),
    });
    const r = extractRenderableHtmlFromGmailRenderPayload(p);
    expect(r?.kind).toBe("html");
    expect(r?.html).toContain("<b>hi</b>");
  });

  it("extractRenderableHtml falls back to minimal HTML document for plain-only", () => {
    const p = minimalPayload({
      plain_base64url: toGmailBase64UrlUtf8("line1\nline2"),
    });
    const r = extractRenderableHtmlFromGmailRenderPayload(p);
    expect(r?.kind).toBe("plain");
    expect(r?.html).toContain("<!DOCTYPE html>");
    expect(r?.html).toContain("line1");
    expect(r?.html).not.toContain("<line1"); // escaped
  });

  it("applyInlineRelatedPartsToHtml replaces cid: in srcset with data URLs", () => {
    const png1x1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const b64url = Buffer.from(png1x1).toString("base64url");
    const html = '<img srcset="cid:logo@x 1x, cid:logo@x 2x">';
    const out = applyInlineRelatedPartsToHtml(html, [
      { cid: "<logo@x>", mime_type: "image/png", data_base64url: b64url },
    ]);
    expect(out).toMatch(/srcset="[^"]*data:image\/png;base64,/);
    expect(out).not.toContain("cid:");
  });

  it("applyInlineRelatedPartsToHtml replaces cid: src with data URL", () => {
    const png1x1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const b64url = Buffer.from(png1x1).toString("base64url");
    const html = '<img src="cid:foo@bar">';
    const out = applyInlineRelatedPartsToHtml(html, [
      { cid: "<foo@bar>", mime_type: "image/png", data_base64url: b64url },
    ]);
    expect(out).toMatch(/^<img src="data:image\/png;base64,/);
    expect(out).not.toContain("cid:");
  });

  it("tryParseGmailRenderPayloadFromMessageRawPayload accepts raw_payload with extra keys (e.g. snippet)", () => {
    const p = minimalPayload({
      html_base64url: toGmailBase64UrlUtf8("<p>x</p>"),
    });
    const loose = { ...p, snippet: "hello snippet", extra: 123 };
    expect(tryParseGmailRenderPayloadFromMessageRawPayload(loose)).not.toBeNull();
    expect(tryExtractRenderableHtmlFromMessageRawPayload(loose)).toContain("<p>x</p>");
  });

  it("pickGmailRenderPayloadFieldsFromRawPayload strips non-render keys for validation", () => {
    const p = minimalPayload({
      html_base64url: toGmailBase64UrlUtf8("<i>y</i>"),
    });
    const picked = pickGmailRenderPayloadFieldsFromRawPayload({
      ...p,
      snippet: "noise",
    });
    expect(isGmailRenderPayloadV1(picked)).toBe(true);
  });

  it("extractRenderableHtmlFromGmailRenderPayloadWithOptions resolves cid when requested", () => {
    const png1x1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const b64url = Buffer.from(png1x1).toString("base64url");
    const p = minimalPayload({
      html_base64url: toGmailBase64UrlUtf8('<img src="cid:logo">'),
      inline_related_parts: [{ cid: "logo", mime_type: "image/png", data_base64url: b64url }],
    });
    const without = extractRenderableHtmlFromGmailRenderPayloadWithOptions(p, { resolveCid: false });
    expect(without?.html).toContain("cid:logo");
    const withCid = extractRenderableHtmlFromGmailRenderPayloadWithOptions(p, { resolveCid: true });
    expect(withCid?.html).toMatch(/data:image\/png;base64,/);
  });
});
