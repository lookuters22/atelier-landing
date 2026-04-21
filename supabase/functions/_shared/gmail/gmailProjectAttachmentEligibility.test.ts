/**
 * Grouped Gmail import — explicit project-attachment eligibility (Chunk 3).
 * Pure decision tests only; DB helpers are covered indirectly via worker/materialize.
 */
import { describe, expect, it } from "vitest";

import { evaluateGroupedImportAttachmentEligibility } from "./gmailProjectAttachmentEligibility.ts";

describe("evaluateGroupedImportAttachmentEligibility", () => {
  it("is eligible when known client email matches (inquiry signal)", () => {
    const r = evaluateGroupedImportAttachmentEligibility({
      normalizedSenderEmail: "alex@example.com",
      anchorNormalizedEmails: new Set(),
      knownClientEmailMatch: true,
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("known_client_email");
  });

  it("is eligible when sender matches a batch anchor (same inquiry / sender consistency)", () => {
    const r = evaluateGroupedImportAttachmentEligibility({
      normalizedSenderEmail: "alex@example.com",
      anchorNormalizedEmails: new Set(["alex@example.com"]),
      knownClientEmailMatch: false,
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("batch_sender_anchor_match");
  });

  it("normalizes sender email before anchor lookup", () => {
    const r = evaluateGroupedImportAttachmentEligibility({
      normalizedSenderEmail: "  Alex@EXAMPLE.COM ",
      anchorNormalizedEmails: new Set(["alex@example.com"]),
      knownClientEmailMatch: false,
    });
    expect(r.eligible).toBe(true);
  });

  it("is not eligible when only label batch membership could apply (no client, no anchor)", () => {
    const r = evaluateGroupedImportAttachmentEligibility({
      normalizedSenderEmail: "stranger@example.com",
      anchorNormalizedEmails: new Set(["alex@example.com"]),
      knownClientEmailMatch: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("no_positive_attachment_evidence");
    expect(r.evidence?.known_client_email_match).toBe(false);
    expect(r.evidence?.anchor_size).toBe(1);
  });

  it("is not eligible when sender cannot be normalized (weak identity)", () => {
    const r = evaluateGroupedImportAttachmentEligibility({
      normalizedSenderEmail: null,
      anchorNormalizedEmails: new Set(["alex@example.com"]),
      knownClientEmailMatch: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("no_positive_attachment_evidence");
  });

  it("prefers known client match over empty anchor set (first real inquiry in batch)", () => {
    const r = evaluateGroupedImportAttachmentEligibility({
      normalizedSenderEmail: "lead@example.com",
      anchorNormalizedEmails: new Set(),
      knownClientEmailMatch: true,
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("known_client_email");
  });
});
