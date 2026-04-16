import { describe, expect, it } from "vitest";
import { evaluatePreLlmInboundEmail } from "./preLlmEmailRouting.ts";

describe("evaluatePreLlmInboundEmail", () => {
  it("returns needs_llm when no signals", () => {
    expect(evaluatePreLlmInboundEmail({ messageMetadata: {} })).toEqual({ kind: "needs_llm" });
  });

  it("flags precedence bulk", () => {
    const r = evaluatePreLlmInboundEmail({
      messageMetadata: {
        gmail_import: {
          routing_signals: {
            version: 1,
            has_list_unsubscribe: false,
            precedence_bulk_or_junk: true,
            auto_submitted_present: false,
            has_feedback_id: false,
            sender_localpart_class: "looks_human",
          },
        },
      },
    });
    expect(r.kind).toBe("automated_or_bulk");
    if (r.kind === "automated_or_bulk") {
      expect(r.reasons).toContain("precedence_bulk_or_junk");
    }
  });

  it("flags list-unsubscribe + no-reply", () => {
    const r = evaluatePreLlmInboundEmail({
      messageMetadata: {
        gmail_import: {
          routing_signals: {
            version: 1,
            has_list_unsubscribe: true,
            precedence_bulk_or_junk: false,
            auto_submitted_present: false,
            has_feedback_id: false,
            sender_localpart_class: "no_reply",
          },
        },
      },
    });
    expect(r.kind).toBe("automated_or_bulk");
    if (r.kind === "automated_or_bulk") {
      expect(r.reasons).toContain("list_unsubscribe_and_no_reply_sender");
    }
  });

  it("falls back to sender line when routing_signals missing (no-reply local part)", () => {
    const r = evaluatePreLlmInboundEmail({
      messageMetadata: {},
      senderRaw: "No Reply <no-reply@example.com>",
    });
    expect(r).toEqual({
      kind: "automated_or_bulk",
      reasons: ["sender_local_part_automated"],
    });
  });

  it("needs_llm when routing_signals missing and sender looks human", () => {
    expect(
      evaluatePreLlmInboundEmail({
        messageMetadata: {},
        senderRaw: "Jane Bride <jane@example.com>",
      }),
    ).toEqual({ kind: "needs_llm" });
  });

  it("header-based reasons unchanged when routing_signals present (no sender_local_part reason)", () => {
    const r = evaluatePreLlmInboundEmail({
      messageMetadata: {
        gmail_import: {
          routing_signals: {
            version: 1,
            has_list_unsubscribe: false,
            precedence_bulk_or_junk: true,
            auto_submitted_present: false,
            has_feedback_id: false,
            sender_localpart_class: "looks_human",
          },
        },
      },
      senderRaw: "No Reply <no-reply@example.com>",
    });
    expect(r.kind).toBe("automated_or_bulk");
    if (r.kind === "automated_or_bulk") {
      expect(r.reasons).toEqual(["precedence_bulk_or_junk"]);
      expect(r.reasons).not.toContain("sender_local_part_automated");
    }
  });
});
