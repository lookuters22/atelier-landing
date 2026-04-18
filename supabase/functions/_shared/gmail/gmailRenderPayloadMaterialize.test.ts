import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { decodeBase64UrlUtf8 } from "./gmailMessageBody.ts";
import {
  buildSizeCappedGmailRenderPayloadV1,
  collectGmailInlineRelatedPartsForHtml,
  encodeUtf8StringToGmailBase64Url,
} from "./gmailRenderPayloadMaterialize.ts";
import type { GmailAttachmentCandidate } from "./gmailMimeAttachments.ts";

describe("gmailRenderPayloadMaterialize", () => {
  it("encodeUtf8StringToGmailBase64Url round-trips with decodeBase64UrlUtf8", () => {
    const s = "café ☃";
    const enc = encodeUtf8StringToGmailBase64Url(s);
    expect(decodeBase64UrlUtf8(enc)).toBe(s);
  });

  it("collectGmailInlineRelatedPartsForHtml includes only cid-linked inline parts", () => {
    const png1x1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const b64url = Buffer.from(png1x1).toString("base64url");
    const raw: GmailAttachmentCandidate[] = [
      {
        attachmentId: null,
        filename: "x.png",
        mimeType: "image/png",
        sizeBytes: png1x1.length,
        contentId: "logo@local",
        disposition: "inline",
        partId: "1",
        inlineDataBase64Url: b64url,
      },
      {
        attachmentId: "att1",
        filename: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        contentId: null,
        disposition: "attachment",
        partId: "2",
      },
    ];
    const html = '<p><img src="cid:logo@local"></p>';
    const parts = collectGmailInlineRelatedPartsForHtml(html, raw);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.cid).toBe("logo@local");
    expect(parts[0]!.mime_type).toBe("image/png");
    expect(parts[0]!.data_base64url).toBe(b64url);
  });

  it("buildSizeCappedGmailRenderPayloadV1 produces client-compatible shape", () => {
    const o = buildSizeCappedGmailRenderPayloadV1({
      gmailMessageId: "m1",
      gmailThreadId: "t1",
      plain: "hello",
      html: "<b>hi</b>",
      rawAttachmentCandidates: [],
    });
    expect(o.version).toBe(1);
    expect(o.provider).toBe("gmail");
    expect(o.gmail_message_id).toBe("m1");
    expect(o.gmail_thread_id).toBe("t1");
    expect(typeof o.html_base64url).toBe("string");
    expect(typeof o.plain_base64url).toBe("string");
    expect(decodeBase64UrlUtf8(o.html_base64url as string)).toBe("<b>hi</b>");
    expect(decodeBase64UrlUtf8(o.plain_base64url as string)).toBe("hello");
  });
});
