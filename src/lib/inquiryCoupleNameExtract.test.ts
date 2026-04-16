import { describe, expect, it } from "vitest";
import {
  extractCoupleNamesForNewInquiry,
  extractCoupleSegmentFromInquiryTitle,
  isWeakCouplePlaceholder,
} from "./inquiryCoupleNameExtract";

describe("extractCoupleSegmentFromInquiryTitle", () => {
  it("extracts names before em dash and strips Photography Inquiry prefix", () => {
    expect(
      extractCoupleSegmentFromInquiryTitle(
        "Photography Inquiry: Elena & Julian — July 14, 2027 — Villa del Balbianello",
      ),
    ).toBe("Elena & Julian");
  });

  it("handles Re: prefix", () => {
    expect(
      extractCoupleSegmentFromInquiryTitle(
        "Re: Photography Inquiry: Alex & Sam — June 1, 2028 — Lake Como",
      ),
    ).toBe("Alex & Sam");
  });

  it("returns null for weak fiancé-only phrasing", () => {
    expect(extractCoupleSegmentFromInquiryTitle("Elena and fiancé")).toBeNull();
  });
});

describe("isWeakCouplePlaceholder", () => {
  it("flags common placeholders", () => {
    expect(isWeakCouplePlaceholder("Elena and fiancé")).toBe(true);
    expect(isWeakCouplePlaceholder("foo and partner")).toBe(true);
  });
});

describe("extractCoupleNamesForNewInquiry", () => {
  it("prefers structured subject over weak body", () => {
    const r = extractCoupleNamesForNewInquiry({
      threadTitle: "Photography Inquiry: Elena & Julian — July 14, 2027 — Villa del Balbianello",
      latestInboundBody: "Hi, I'm Elena and my fiancé and I are planning…",
      snippet: "Elena and fiancé",
      sender: "Elena Test <elena@example.com>",
    });
    expect(r.coupleNames).toBe("Elena & Julian");
    expect(r.leadClientName).toContain("Elena");
  });

  it("falls back to New inquiry when all sources are weak", () => {
    const r = extractCoupleNamesForNewInquiry({
      threadTitle: "",
      latestInboundBody: "partner",
      snippet: "unknown",
      sender: "",
    });
    expect(r.coupleNames).toBe("New inquiry");
  });
});
