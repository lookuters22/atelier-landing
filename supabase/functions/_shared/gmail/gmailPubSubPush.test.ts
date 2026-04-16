import { describe, expect, it } from "vitest";
import {
  gmailMailboxLookupVariants,
  parseGmailPubSubNotification,
} from "./gmailPubSubPush.ts";
import { gmailMessageHasSentLabel } from "./gmailDeltaInboundMessage.ts";
import type { GmailFullThreadMessage } from "./gmailThreads.ts";

describe("parseGmailPubSubNotification", () => {
  it("decodes Pub/Sub envelope with standard base64 Gmail payload", () => {
    const inner = JSON.stringify({ emailAddress: "u@gmail.com", historyId: "999" });
    const data = btoa(inner);
    const body = { message: { data } };
    const out = parseGmailPubSubNotification(body);
    expect(out?.emailAddress).toBe("u@gmail.com");
    expect(out?.historyId).toBe("999");
  });

  it("returns null for invalid input", () => {
    expect(parseGmailPubSubNotification(null)).toBeNull();
    expect(parseGmailPubSubNotification({})).toBeNull();
  });

  it("coerces numeric historyId from Gmail JSON", () => {
    const inner = JSON.stringify({ emailAddress: "u@gmail.com", historyId: 2747544 });
    const data = btoa(inner);
    const out = parseGmailPubSubNotification({ message: { data } });
    expect(out?.historyId).toBe("2747544");
  });
});

describe("gmailMailboxLookupVariants", () => {
  it("includes gmail.com and googlemail.com alias pair", () => {
    expect(gmailMailboxLookupVariants("a@gmail.com").sort()).toEqual(
      ["a@gmail.com", "a@googlemail.com"].sort(),
    );
    expect(gmailMailboxLookupVariants("a@googlemail.com").sort()).toEqual(
      ["a@gmail.com", "a@googlemail.com"].sort(),
    );
  });
});

describe("gmailMessageHasSentLabel", () => {
  it("detects SENT label", () => {
    const msg: GmailFullThreadMessage = {
      id: "m1",
      labelIds: ["INBOX", "SENT"],
    };
    expect(gmailMessageHasSentLabel(msg)).toBe(true);
  });

  it("false without SENT", () => {
    const msg: GmailFullThreadMessage = { id: "m1", labelIds: ["INBOX"] };
    expect(gmailMessageHasSentLabel(msg)).toBe(false);
  });
});
