import { describe, expect, it } from "vitest";
import {
  emailSubjectFromGmailMessage,
  threadTitleFromGmailMessage,
} from "./gmailDeltaInboundMessage.ts";
import type { GmailFullThreadMessage } from "./gmailThreads.ts";

function msg(partial: Partial<GmailFullThreadMessage>): GmailFullThreadMessage {
  return {
    id: "m1",
    threadId: "t1",
    labelIds: [],
    ...partial,
  } as GmailFullThreadMessage;
}

describe("threadTitleFromGmailMessage", () => {
  it("uses Subject when present", () => {
    const m = msg({
      payload: {
        headers: [
          { name: "Subject", value: "  Venue deposit question  " },
          { name: "From", value: "a@b.com" },
        ],
      },
      snippet: "short",
    });
    expect(threadTitleFromGmailMessage(m)).toBe("Venue deposit question");
  });

  it("falls back to snippet when Subject empty", () => {
    const m = msg({
      payload: { headers: [{ name: "From", value: "a@b.com" }] },
      snippet: "  snippet line  ",
    });
    expect(threadTitleFromGmailMessage(m)).toBe("snippet line");
  });

  it("uses minimal placeholder when no subject or snippet", () => {
    const m = msg({ payload: { headers: [] } });
    expect(threadTitleFromGmailMessage(m)).toBe("(no subject)");
  });
});

describe("emailSubjectFromGmailMessage", () => {
  it("returns null when Subject missing", () => {
    const m = msg({
      payload: { headers: [{ name: "From", value: "x@y.com" }] },
      snippet: "only snippet",
    });
    expect(emailSubjectFromGmailMessage(m)).toBeNull();
  });
});
