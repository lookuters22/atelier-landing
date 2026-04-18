import { describe, expect, it } from "vitest";
import {
  classifyInboundSuppression,
  domainIsOtaOrMarketplace,
  domainLooksLikeMarketingSubdomain,
  extractSenderEmailFromRaw,
  formatInboundSuppressionTag,
  isSuppressedInboundVerdict,
} from "./inboundSuppressionClassifier";

describe("extractSenderEmailFromRaw", () => {
  it("unwraps angle-bracketed addresses", () => {
    expect(extractSenderEmailFromRaw('Booking.com <email.campaign@sg.booking.com>')).toBe(
      "email.campaign@sg.booking.com",
    );
  });

  it("returns bare emails lower-cased", () => {
    expect(extractSenderEmailFromRaw("Alice@EXAMPLE.com")).toBe("alice@example.com");
  });

  it("returns null for empty / malformed", () => {
    expect(extractSenderEmailFromRaw(null)).toBeNull();
    expect(extractSenderEmailFromRaw("no email here")).toBeNull();
  });
});

describe("domainIsOtaOrMarketplace", () => {
  it("matches root and subdomains of known OTAs", () => {
    expect(domainIsOtaOrMarketplace("booking.com")).toBe(true);
    expect(domainIsOtaOrMarketplace("sg.booking.com")).toBe(true);
    expect(domainIsOtaOrMarketplace("mail.news.booking.com")).toBe(true);
    expect(domainIsOtaOrMarketplace("airbnb.com")).toBe(true);
  });

  it("does not match unrelated domains", () => {
    expect(domainIsOtaOrMarketplace("example.com")).toBe(false);
    expect(domainIsOtaOrMarketplace("gmail.com")).toBe(false);
    expect(domainIsOtaOrMarketplace("notbooking.com")).toBe(false);
  });
});

describe("domainLooksLikeMarketingSubdomain", () => {
  it("flags typical marketing subdomains", () => {
    expect(domainLooksLikeMarketingSubdomain("email.brand.com")).toBe(true);
    expect(domainLooksLikeMarketingSubdomain("mail.brand.com")).toBe(true);
    expect(domainLooksLikeMarketingSubdomain("news.brand.com")).toBe(true);
    expect(domainLooksLikeMarketingSubdomain("e.brand.com")).toBe(true);
  });

  it("does not flag bare domains or unrelated prefixes", () => {
    expect(domainLooksLikeMarketingSubdomain("brand.com")).toBe(false);
    expect(domainLooksLikeMarketingSubdomain("api.brand.com")).toBe(false);
  });
});

describe("classifyInboundSuppression — Booking.com OTA example", () => {
  it("classifies email.campaign@sg.booking.com as promotional_or_marketing", () => {
    const c = classifyInboundSuppression({
      senderRaw: "Booking.com <email.campaign@sg.booking.com>",
      subject: "Recommendations for your search",
      body: "Hey — here are the best prices for your dates. Unsubscribe at any time.",
      headers: {
        "list-unsubscribe": "<https://booking.com/u/>",
        precedence: "bulk",
      },
    });
    expect(c.verdict).toBe("promotional_or_marketing");
    expect(c.suppressed).toBe(true);
    expect(c.normalizedSenderEmail).toBe("email.campaign@sg.booking.com");
    expect(c.normalizedSenderDomain).toBe("sg.booking.com");
    expect(c.reasons).toContain("sender_domain_ota_or_marketplace");
    expect(c.reasons).toContain("sender_local_marketing_token");
    expect(c.reasons).toContain("body_ota_promo_copy");
    expect(c.reasons).toContain("body_unsubscribe_language");
    expect(c.reasons).toContain("header_list_unsubscribe");
    expect(c.reasons).toContain("header_precedence_bulk");
    expect(c.confidence).toBe("high");
  });
});

describe("classifyInboundSuppression — no-reply system", () => {
  it("classifies noreply@stripe.com with 'do not reply' copy as system_or_notification", () => {
    const c = classifyInboundSuppression({
      senderRaw: "Stripe <noreply@stripe.com>",
      subject: "Your payout has been scheduled",
      body: "This is an automated message. Please do not reply to this email.",
      headers: {
        "auto-submitted": "auto-generated",
      },
    });
    expect(c.verdict).toBe("system_or_notification");
    expect(c.suppressed).toBe(true);
    expect(c.reasons).toContain("sender_local_system_token");
    expect(c.reasons).toContain("header_auto_submitted");
    expect(c.reasons).toContain("body_do_not_reply_language");
  });
});

describe("classifyInboundSuppression — legitimate wedding lead", () => {
  it("leaves a normal human wedding inquiry as human_client_or_lead", () => {
    const c = classifyInboundSuppression({
      senderRaw: '"Jane Doe" <jane.doe@gmail.com>',
      subject: "Photography for our wedding on June 14",
      body: "Hi! My fiancé and I are getting married on June 14 next year in Tuscany. Are you available? We love your portfolio.",
    });
    expect(c.verdict).toBe("human_client_or_lead");
    expect(c.suppressed).toBe(false);
    expect(c.reasons).toEqual([]);
  });

  it("leaves a planner RFQ as human_client_or_lead", () => {
    const c = classifyInboundSuppression({
      senderRaw: "Planner Agency <agnes@plannerstudio.co>",
      subject: "RFQ: Villa Cipressi, 22 guests, 14 Sept",
      body: "Hi — on behalf of a client we are collecting quotes for a wedding in Lake Como. Budget is flexible. Could you share your availability and a sample timeline?",
    });
    expect(c.verdict).toBe("human_client_or_lead");
    expect(c.suppressed).toBe(false);
  });
});

describe("classifyInboundSuppression — newsletter", () => {
  it("suppresses a newsletter blast from a marketing subdomain", () => {
    const c = classifyInboundSuppression({
      senderRaw: "Brand Weekly <newsletter@email.brand.com>",
      subject: "This week's highlights",
      body: "In this issue: featured this week\nTop stories\nManage your preferences or unsubscribe.",
      headers: {
        "list-unsubscribe": "<https://brand.com/u>",
      },
    });
    expect(c.verdict).toBe("promotional_or_marketing");
    expect(c.suppressed).toBe(true);
    expect(c.reasons).toContain("sender_local_marketing_token");
    expect(c.reasons).toContain("sender_domain_marketing_subdomain");
    expect(c.reasons).toContain("body_newsletter_markers");
    expect(c.reasons).toContain("body_unsubscribe_language");
  });
});

describe("classifyInboundSuppression — single-signal conservatism", () => {
  it("does not suppress a single weak signal (unsubscribe link in a human reply)", () => {
    // E.g. vendor reply that happens to carry a footer marketing link.
    const c = classifyInboundSuppression({
      senderRaw: '"Venue" <anna@venue-italy.it>',
      subject: "Re: Our wedding inquiry",
      body: "Yes, we have the date available. Please see brochure attached. Unsubscribe here if you like.",
    });
    expect(c.verdict).toBe("human_client_or_lead");
    expect(c.suppressed).toBe(false);
  });
});

describe("classifyInboundSuppression — empty / unparseable input", () => {
  it("returns unknown_review_needed for empty input", () => {
    const c = classifyInboundSuppression({ senderRaw: "", body: "", subject: "" });
    expect(c.verdict).toBe("unknown_review_needed");
    expect(c.reasons).toContain("empty_or_unparseable");
  });
});

describe("isSuppressedInboundVerdict", () => {
  it("returns true for all non-human verdicts", () => {
    expect(isSuppressedInboundVerdict("promotional_or_marketing")).toBe(true);
    expect(isSuppressedInboundVerdict("system_or_notification")).toBe(true);
    expect(isSuppressedInboundVerdict("transactional_non_client")).toBe(true);
    expect(isSuppressedInboundVerdict("unknown_review_needed")).toBe(true);
    expect(isSuppressedInboundVerdict("human_client_or_lead")).toBe(false);
  });
});

describe("formatInboundSuppressionTag", () => {
  it("produces a stable compact audit tag", () => {
    const c = classifyInboundSuppression({
      senderRaw: "noreply@example.com",
      body: "this is an automated message. do not reply to this email",
    });
    const tag = formatInboundSuppressionTag(c);
    expect(tag.startsWith("system_or_notification:")).toBe(true);
    expect(tag).toContain("sender_local_system_token");
  });
});
