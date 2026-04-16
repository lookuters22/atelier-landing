import { describe, expect, it } from "vitest";
import { buildGmailRoutingSignalsFromMessage } from "./gmailRoutingSignals.ts";

describe("buildGmailRoutingSignalsFromMessage", () => {
  it("detects list-unsubscribe and no-reply sender", () => {
    const msg = {
      id: "m1",
      payload: {
        headers: [
          { name: "From", value: "Deals <no-reply@shop.example>" },
          { name: "List-Unsubscribe", value: "<mailto:unsub@shop.example>" },
          { name: "Precedence", value: "bulk" },
        ],
      },
    };
    const s = buildGmailRoutingSignalsFromMessage(msg as never);
    expect(s.has_list_unsubscribe).toBe(true);
    expect(s.precedence_bulk_or_junk).toBe(true);
    expect(s.sender_localpart_class).toBe("no_reply");
  });
});
