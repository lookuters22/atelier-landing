import { describe, expect, it } from "vitest";
import { hasOperatorInquiryCountIntent } from "./operatorAssistantInquiryCountIntent.ts";

describe("hasOperatorInquiryCountIntent", () => {
  it("returns true for count / comparison / time-window phrasing on inquiries", () => {
    expect(hasOperatorInquiryCountIntent("How many inquiries did I receive this week?")).toBe(true);
    expect(
      hasOperatorInquiryCountIntent("Did I get more new inquiries today than yesterday?"),
    ).toBe(true);
    expect(
      hasOperatorInquiryCountIntent("Inquiry count: last week vs this week?"),
    ).toBe(true);
  });

  it("returns false for thread-history or CRM questions without count semantics (regression)", () => {
    expect(hasOperatorInquiryCountIntent("What is the inquiry in Como about?")).toBe(false);
    expect(
      hasOperatorInquiryCountIntent("Did the client send another email on this inquiry?"),
    ).toBe(false);
    expect(hasOperatorInquiryCountIntent("inquiry this week by email?")).toBe(false);
  });

  it("returns true for comparative day/week inquiry or lead count phrasing (incl. than / then yesterday typo)", () => {
    expect(
      hasOperatorInquiryCountIntent("did I receive more inquiries today than yesterday?"),
    ).toBe(true);
    expect(
      hasOperatorInquiryCountIntent("did I receive more inquiries today then yesterday?"),
    ).toBe(true);
    expect(
      hasOperatorInquiryCountIntent("were there more inquiries this week than last week?"),
    ).toBe(true);
    expect(hasOperatorInquiryCountIntent("did we get fewer leads today than yesterday?")).toBe(true);
    expect(
      hasOperatorInquiryCountIntent("did more leads come in this week than last week?"),
    ).toBe(true);
  });
});
