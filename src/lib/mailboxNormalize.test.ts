import { describe, expect, it } from "vitest";
import {
  extractFirstMailboxFromRecipientField,
  isLikelyNonReplyableSystemLocalPart,
  mailboxesAreSameMailbox,
  normalizeMailboxForComparison,
} from "./mailboxNormalize";

describe("normalizeMailboxForComparison", () => {
  it("lowercases and strips Gmail +tag", () => {
    expect(normalizeMailboxForComparison("User+work@gmail.com")).toBe("user@gmail.com");
    expect(normalizeMailboxForComparison("User@Gmail.com")).toBe("user@gmail.com");
  });

  it("parses angle-addr", () => {
    expect(normalizeMailboxForComparison('Jane <Jane+tag@gmail.com>')).toBe("jane@gmail.com");
  });
});

describe("mailboxesAreSameMailbox", () => {
  it("treats Gmail aliases as same", () => {
    expect(mailboxesAreSameMailbox("me@gmail.com", "me+lists@gmail.com")).toBe(true);
  });
});

describe("extractFirstMailboxFromRecipientField", () => {
  it("takes first address from a list", () => {
    expect(extractFirstMailboxFromRecipientField("a@x.com, b@y.com")).toBe("a@x.com");
  });
});

describe("isLikelyNonReplyableSystemLocalPart", () => {
  it("flags classic no-reply forms", () => {
    expect(isLikelyNonReplyableSystemLocalPart("noreply")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("no-reply")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("donotreply")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("mailer-daemon")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("postmaster")).toBe(true);
  });

  it("flags marketing / bulk local parts", () => {
    expect(isLikelyNonReplyableSystemLocalPart("campaign")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("newsletter")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("marketing")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("promo")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("offers")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("deals")).toBe(true);
  });

  it("flags compound marketing local parts (email.campaign, brand.newsletter)", () => {
    expect(isLikelyNonReplyableSystemLocalPart("email.campaign")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("brand.newsletter")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("hello-marketing")).toBe(true);
    expect(isLikelyNonReplyableSystemLocalPart("no-reply-billing")).toBe(true);
  });

  it("does not flag normal human local parts", () => {
    expect(isLikelyNonReplyableSystemLocalPart("alice.smith")).toBe(false);
    expect(isLikelyNonReplyableSystemLocalPart("hello")).toBe(false);
    expect(isLikelyNonReplyableSystemLocalPart("info")).toBe(false);
    expect(isLikelyNonReplyableSystemLocalPart("studio")).toBe(false);
    expect(isLikelyNonReplyableSystemLocalPart("jane")).toBe(false);
    expect(isLikelyNonReplyableSystemLocalPart("bookings")).toBe(false);
  });

  it("treats empty local parts as non-replyable", () => {
    expect(isLikelyNonReplyableSystemLocalPart("")).toBe(true);
  });
});
