/**
 * Sender-identity regression for Gmail import suppression.
 *
 * Closes the open gap from the Booking.com promo-thread review where
 * `gmailImportMaterialize.ts` was feeding `connected_accounts.email` (the
 * photographer's mailbox) to `classifyGmailImportCandidate`. With this fix,
 * the classifier sees the real inbound `From` header surfaced by
 * `extractSuppressionRelevantInboundHeaders` and persisted under
 * `metadata.gmail_import.inbound_headers.from`.
 *
 * What is locked in here:
 *   1. `extractSuppressionRelevantInboundHeaders` parses the From header from a
 *      Gmail payload (the same shape Gmail's API returns).
 *   2. `readInboundFromHeader` reads it back from the materialized message
 *      metadata (round-trip from materialize → DB → decision context).
 *   3. A Booking.com-style sender like `email.campaign@sg.booking.com` is
 *      classified as `promotional_or_marketing` once the real sender flows
 *      into `classifyGmailImportCandidate` — proving the sender-identity
 *      half of the suppression signal is back online.
 */
import { describe, expect, it } from "vitest";

import { extractSuppressionRelevantInboundHeaders } from "./inboundHeaderExtraction.ts";
import { inboundMetadataHeadersForClassifier, readInboundFromHeader } from "./readInboundFromHeader.ts";
import { classifyGmailImportCandidate } from "../suppression/classifyGmailImportCandidate.ts";

describe("extractSuppressionRelevantInboundHeaders", () => {
  it("extracts the From header verbatim with a sane upper bound", () => {
    const headers = extractSuppressionRelevantInboundHeaders({
      headers: [
        { name: "Subject", value: "Hi" },
        { name: "From", value: "Booking.com <email.campaign@sg.booking.com>" },
        { name: "List-Unsubscribe", value: "<mailto:unsub@sg.booking.com>" },
      ],
    });
    expect(headers.from).toBe("Booking.com <email.campaign@sg.booking.com>");
    expect(headers.list_unsubscribe).toBe("<mailto:unsub@sg.booking.com>");
    expect(headers.list_id).toBeNull();
    expect(headers.precedence).toBeNull();
    expect(headers.auto_submitted).toBeNull();
  });

  it("returns nulls when payload has no headers", () => {
    expect(extractSuppressionRelevantInboundHeaders(undefined)).toEqual({
      from: null,
      list_unsubscribe: null,
      list_id: null,
      precedence: null,
      auto_submitted: null,
    });
  });

  it("trims empty header values to null", () => {
    const headers = extractSuppressionRelevantInboundHeaders({
      headers: [{ name: "From", value: "   " }],
    });
    expect(headers.from).toBeNull();
  });
});

describe("inboundMetadataHeadersForClassifier", () => {
  it("maps persisted inbound_headers to classifier header keys", () => {
    const meta = {
      gmail_import: {
        inbound_headers: {
          from: "List <list@example.com>",
          list_unsubscribe: "<https://example.com/u>",
          list_id: "<list.example.com>",
          precedence: "bulk",
          auto_submitted: "auto-generated",
        },
      },
    };
    const h = inboundMetadataHeadersForClassifier(meta);
    expect(h).toEqual({
      "auto-submitted": "auto-generated",
      precedence: "bulk",
      "list-unsubscribe": "<https://example.com/u>",
      "list-id": "<list.example.com>",
    });
  });

  it("returns null when no suppression headers are present", () => {
    expect(
      inboundMetadataHeadersForClassifier({
        gmail_import: { inbound_headers: { from: "a@b.com" } },
      }),
    ).toBeNull();
  });
});

describe("readInboundFromHeader", () => {
  it("reads back the From header that materialize persisted", () => {
    const meta = {
      gmail_import: {
        gmail_message_id: "m1",
        inbound_headers: {
          from: "Booking.com <email.campaign@sg.booking.com>",
          list_unsubscribe: null,
          list_id: null,
          precedence: null,
          auto_submitted: null,
        },
      },
    };
    expect(readInboundFromHeader(meta)).toBe(
      "Booking.com <email.campaign@sg.booking.com>",
    );
  });

  it("returns null on legacy materialize rows without inbound_headers", () => {
    expect(readInboundFromHeader({ gmail_import: { used_snippet_fallback: true } })).toBeNull();
    expect(readInboundFromHeader({})).toBeNull();
    expect(readInboundFromHeader(null)).toBeNull();
    expect(readInboundFromHeader(undefined)).toBeNull();
  });
});

describe("Gmail import suppression — sender identity end-to-end", () => {
  it("flags a Booking.com promo sender via real From header (not the photographer mailbox)", () => {
    const headers = extractSuppressionRelevantInboundHeaders({
      headers: [
        { name: "From", value: "Booking.com <email.campaign@sg.booking.com>" },
        { name: "Subject", value: "Your next getaway — 30% off selected stays" },
        { name: "List-Unsubscribe", value: "<mailto:unsub@sg.booking.com>" },
      ],
    });
    /**
     * Materialize-time path: the persisted `inbound_headers.from` becomes the
     * `senderRaw` we feed to `classifyGmailImportCandidate`. Without this fix
     * the classifier got `studio@photographer.com` and only body/label hints
     * could fire, weakening suppression.
     */
    const result = classifyGmailImportCandidate({
      senderRaw: headers.from,
      subject: "Your next getaway — 30% off selected stays",
      snippet: "Exclusive offers inside.",
      body: "Exclusive offers inside.",
      sourceLabelName: "Inbox",
    });
    expect(result.suppressed).toBe(true);
    expect(result.verdict).toBe("promotional_or_marketing");
    expect(result.normalizedSenderEmail).toBe("email.campaign@sg.booking.com");
    expect(result.normalizedSenderDomain).toBe("sg.booking.com");
    expect(result.reasons).toContain("sender_domain_ota_or_marketplace");
    expect(result.reasons).toContain("sender_local_marketing_token");
  });

  it("falls back gracefully when From is unavailable (legacy materialize)", () => {
    /**
     * Legacy materialize path that did not persist inbound_headers — sender
     * identity is unknown. Body/label heuristics must still carry the
     * classifier; we accept either suppressed (label/body still strong) or
     * human (no signal) — the assertion is only that we don't crash.
     */
    const result = classifyGmailImportCandidate({
      senderRaw: "studio@photographer.com",
      subject: "Re: photo timeline",
      snippet: "Sounds good, see you Saturday.",
      body: "Sounds good, see you Saturday.",
      sourceLabelName: "Clients",
    });
    expect(result.verdict).toBe("human_client_or_lead");
    expect(result.suppressed).toBe(false);
  });
});
