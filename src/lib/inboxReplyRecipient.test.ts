import { describe, expect, it } from "vitest";
import { findMostRecentReplyableExternalParticipant } from "./inboxReplyRecipient";

describe("findMostRecentReplyableExternalParticipant", () => {
  const connected = "photographer@gmail.com";

  it("skips latest outbound and uses prior inbound external", () => {
    const messages = [
      { direction: "in" as const, sender: "client@example.com" },
      { direction: "out" as const, sender: connected },
    ];
    const r = findMostRecentReplyableExternalParticipant(messages, connected);
    expect(r?.normalizedMailbox).toBe("client@example.com");
  });

  it("skips noreply addresses", () => {
    const messages = [
      { direction: "in" as const, sender: "No Reply <noreply@corp.com>" },
      { direction: "in" as const, sender: "Human <human@corp.com>" },
    ];
    const r = findMostRecentReplyableExternalParticipant(messages, connected);
    expect(r?.normalizedMailbox).toBe("human@corp.com");
  });

  it("returns null when only operator outbound exists", () => {
    const messages = [{ direction: "out" as const, sender: connected }];
    expect(findMostRecentReplyableExternalParticipant(messages, connected)).toBeNull();
  });
});
