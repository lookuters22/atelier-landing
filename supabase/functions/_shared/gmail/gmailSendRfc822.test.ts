import { describe, expect, it } from "vitest";

import {
  GMAIL_REPLY_SUBJECT_BODY_MAX,
  GMAIL_REPLY_SUBJECT_LINE_MAX,
  normalizeGmailReplySubject,
  parseGmailMetadataReplyHeaders,
  resolveGmailReplySubjectLine,
} from "./gmailSendRfc822.ts";

describe("normalizeGmailReplySubject", () => {
  it("prefixes plain subject with Re:", () => {
    expect(normalizeGmailReplySubject("Venue deposit question")).toBe("Re: Venue deposit question");
  });

  it("keeps a single Re: (does not double-prefix)", () => {
    expect(normalizeGmailReplySubject("Re: Venue deposit question")).toBe("Re: Venue deposit question");
  });

  it("collapses chained Re: prefixes", () => {
    expect(normalizeGmailReplySubject("Re: Re: Venue deposit question")).toBe("Re: Venue deposit question");
  });

  it("normalizes RE: casing to Re:", () => {
    expect(normalizeGmailReplySubject("RE: Venue deposit question")).toBe("Re: Venue deposit question");
  });

  it("strips CR/LF", () => {
    expect(normalizeGmailReplySubject("Line one\r\nLine two")).toBe("Re: Line one Line two");
  });

  it("empty/null becomes Re: (no subject)", () => {
    expect(normalizeGmailReplySubject("")).toBe("Re: (no subject)");
    expect(normalizeGmailReplySubject(null)).toBe("Re: (no subject)");
    expect(normalizeGmailReplySubject(undefined)).toBe("Re: (no subject)");
  });

  it("bounds length", () => {
    const long = "x".repeat(GMAIL_REPLY_SUBJECT_BODY_MAX + 80);
    const out = normalizeGmailReplySubject(long);
    expect(out.length).toBeLessThanOrEqual(GMAIL_REPLY_SUBJECT_LINE_MAX);
    expect(out.startsWith("Re: ")).toBe(true);
  });
});

describe("resolveGmailReplySubjectLine", () => {
  it("prefers anchor Gmail subject over drifted thread.title and caller", () => {
    const r = resolveGmailReplySubjectLine({
      anchorSubjectFromGmail: "Real inquiry subject from Gmail",
      callerSubject: "Re: Wrong thread title from UI",
      threadTitle: "Wrong thread title",
    });
    expect(r.precedence).toBe("anchor");
    expect(r.subject).toBe("Re: Real inquiry subject from Gmail");
  });

  it("uses caller when anchor missing", () => {
    const r = resolveGmailReplySubjectLine({
      anchorSubjectFromGmail: null,
      callerSubject: "Custom reply subject",
      threadTitle: "Thread title",
    });
    expect(r.precedence).toBe("caller");
    expect(r.subject).toBe("Re: Custom reply subject");
  });

  it("falls back to thread.title when anchor and caller empty", () => {
    const r = resolveGmailReplySubjectLine({
      anchorSubjectFromGmail: "   ",
      callerSubject: "",
      threadTitle: "Only title",
    });
    expect(r.precedence).toBe("thread");
    expect(r.subject).toBe("Re: Only title");
  });

  it("uses empty precedence when all missing", () => {
    const r = resolveGmailReplySubjectLine({
      anchorSubjectFromGmail: null,
      callerSubject: "",
      threadTitle: "",
    });
    expect(r.precedence).toBe("empty");
    expect(r.subject).toBe("Re: (no subject)");
  });
});

describe("parseGmailMetadataReplyHeaders", () => {
  it("parses Message-ID, References, In-Reply-To, and Subject", () => {
    const headers = [
      { name: "Subject", value: "  Hello world  " },
      { name: "Message-ID", value: "<abc@mail.gmail.com>" },
      { name: "References", value: "<prev@x> <abc@mail.gmail.com>" },
      { name: "In-Reply-To", value: "<prev@x>" },
    ];
    expect(parseGmailMetadataReplyHeaders({ headers })).toEqual({
      messageIdRfc: "<abc@mail.gmail.com>",
      references: "<prev@x> <abc@mail.gmail.com>",
      inReplyTo: "<prev@x>",
      subject: "Hello world",
    });
  });

  it("is case-insensitive on header names", () => {
    expect(
      parseGmailMetadataReplyHeaders({
        headers: [{ name: "subject", value: "S" }],
      }).subject,
    ).toBe("S");
  });

  it("returns nulls for missing payload", () => {
    expect(parseGmailMetadataReplyHeaders(undefined)).toEqual({
      messageIdRfc: null,
      references: null,
      inReplyTo: null,
      subject: null,
    });
  });
});
