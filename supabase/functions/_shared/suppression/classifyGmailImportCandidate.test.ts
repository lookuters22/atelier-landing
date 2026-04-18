/**
 * Tests for the Gmail-import-specific suppression wrapper.
 *
 * We deliberately test three axes:
 *   1. Base classifier signal alone (no label hint) — should pass through.
 *   2. Label hint alone upgrading an otherwise-human body — label wins.
 *   3. Label hint + body both agreeing — verdict stays promo/system with high confidence.
 */
import { describe, expect, it } from "vitest";

import {
  classifyGmailImportCandidate,
  gmailLabelLooksLikeBulkOrSystem,
} from "./classifyGmailImportCandidate.ts";

describe("gmailLabelLooksLikeBulkOrSystem", () => {
  it("detects promo labels via substring match, case-insensitive", () => {
    expect(gmailLabelLooksLikeBulkOrSystem("Promotions")).toEqual({
      promo: true,
      system: false,
    });
    expect(gmailLabelLooksLikeBulkOrSystem("My Newsletters / Digest")).toEqual({
      promo: true,
      system: false,
    });
    expect(gmailLabelLooksLikeBulkOrSystem("CRM/Campaigns")).toEqual({
      promo: true,
      system: false,
    });
  });

  it("detects system labels separately from promo labels", () => {
    expect(gmailLabelLooksLikeBulkOrSystem("Notifications")).toEqual({
      promo: false,
      system: true,
    });
    expect(gmailLabelLooksLikeBulkOrSystem("Automated Alerts")).toEqual({
      promo: false,
      system: true,
    });
  });

  it("does not flag neutral client labels", () => {
    expect(gmailLabelLooksLikeBulkOrSystem("Clients")).toEqual({
      promo: false,
      system: false,
    });
    expect(gmailLabelLooksLikeBulkOrSystem("Inquiries 2026")).toEqual({
      promo: false,
      system: false,
    });
    expect(gmailLabelLooksLikeBulkOrSystem("Pipeline / Hot Leads")).toEqual({
      promo: false,
      system: false,
    });
    expect(gmailLabelLooksLikeBulkOrSystem(null)).toEqual({
      promo: false,
      system: false,
    });
  });
});

describe("classifyGmailImportCandidate", () => {
  it("passes through a clean human lead when label is neutral", () => {
    const result = classifyGmailImportCandidate({
      senderRaw: "Sarah Tan <sarah.tan@gmail.com>",
      subject: "Our October wedding — checking availability",
      snippet: "Hi, we loved your portfolio and wanted to ask…",
      body: "Hi, we loved your portfolio and wanted to ask about availability for our October wedding. Could we hop on a call?",
      sourceLabelName: "Inquiries",
    });
    expect(result.verdict).toBe("human_client_or_lead");
    expect(result.suppressed).toBe(false);
  });

  it("upgrades a human-looking body to promo when Gmail label is Promotions", () => {
    const result = classifyGmailImportCandidate({
      senderRaw: "Newsletter <hello@studiobrand.com>",
      subject: "New offering from our studio",
      snippet: "Hello friends, thanks for subscribing!",
      body: "Hello friends, thanks for subscribing! We wanted to share our new offering.",
      sourceLabelName: "Promotions",
    });
    expect(result.verdict).toBe("promotional_or_marketing");
    expect(result.suppressed).toBe(true);
    expect(result.reasons).toContain("sender_domain_marketing_subdomain");
  });

  it("keeps promo verdict when body + label both scream promo (Booking.com style)", () => {
    const result = classifyGmailImportCandidate({
      senderRaw: "Booking.com <email.campaign@sg.booking.com>",
      subject: "Your next getaway — 30% off selected stays",
      snippet: "Exclusive offers inside. Unsubscribe anytime.",
      body: "Exclusive offers inside. View in browser. Unsubscribe anytime. Do not reply to this email.",
      sourceLabelName: "Promotions",
    });
    expect(result.verdict).toBe("promotional_or_marketing");
    expect(result.suppressed).toBe(true);
    expect(result.confidence === "medium" || result.confidence === "high").toBe(
      true,
    );
  });

  it("upgrades to system when label is Automated Alerts and body is neutral", () => {
    const result = classifyGmailImportCandidate({
      senderRaw: "Status <alerts@vendor.example.com>",
      subject: "Scheduled maintenance on Thursday",
      snippet: "This is an automated notification about a maintenance window.",
      body: "This is an automated notification about a maintenance window. No action required.",
      sourceLabelName: "Automated Alerts",
    });
    expect(
      result.verdict === "system_or_notification" ||
        result.verdict === "promotional_or_marketing",
    ).toBe(true);
    expect(result.suppressed).toBe(true);
  });

  it("falls back to snippet when body is empty", () => {
    const result = classifyGmailImportCandidate({
      senderRaw: "noreply@notifications.example.com",
      subject: "Your report is ready",
      snippet: "Do not reply to this email. View it online.",
      body: null,
      sourceLabelName: null,
    });
    expect(result.suppressed).toBe(true);
  });
});
