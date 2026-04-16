import { describe, expect, it } from "vitest";
import {
  extractFirstMailboxFromRecipientField,
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
