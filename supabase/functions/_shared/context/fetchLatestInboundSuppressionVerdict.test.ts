/**
 * Regression tests for the inbound-suppression DB lookup that powers
 * `audience.inboundSuppression` on the orchestrator.
 *
 * The bug being locked down here:
 *   The earlier patch filtered `messages.direction = 'inbound'` while the
 *   actual `message_direction` enum is `'in' | 'out' | 'internal'`. The
 *   newest inbound row was therefore never found, `inboundSuppression`
 *   silently became `null`, and orchestrator-side blocking for
 *   already-linked legacy promo threads regressed.
 *
 * These tests assert the canonical `'in'` enum is used and that the helper
 * (a) returns a real classification when an inbound row exists,
 * (b) returns `null` (without throwing) on DB error or missing data.
 */
import { describe, expect, it } from "vitest";

import {
  extractOpportunisticHeaders,
  fetchLatestInboundSuppressionVerdict,
} from "./fetchLatestInboundSuppressionVerdict.ts";

type EqCall = { col: string; val: unknown };

/**
 * Minimal builder mock — records every `.eq()` call on the messages query so
 * the test can assert `direction = 'in'` (and never `'inbound'`).
 */
function makeMessagesBuilder(returnRow: unknown, eqCalls: EqCall[]) {
  const chain = {
    select: (_cols: string) => chain,
    eq: (col: string, val: unknown) => {
      eqCalls.push({ col, val });
      return chain;
    },
    order: (_col: string, _opts: unknown) => chain,
    limit: (_n: number) => chain,
    maybeSingle: async () => ({ data: returnRow, error: null }),
  };
  return chain;
}

function makeThreadsBuilder(title: string | null) {
  const chain = {
    select: (_cols: string) => chain,
    eq: (_col: string, _val: unknown) => chain,
    maybeSingle: async () => ({ data: title === null ? null : { title }, error: null }),
  };
  return chain;
}

function makeSupabaseMock(opts: {
  messageRow: unknown;
  threadTitle: string | null;
  eqCalls: EqCall[];
}): unknown {
  return {
    from: (table: string) => {
      if (table === "messages") return makeMessagesBuilder(opts.messageRow, opts.eqCalls);
      if (table === "threads") return makeThreadsBuilder(opts.threadTitle);
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("fetchLatestInboundSuppressionVerdict — canonical inbound enum", () => {
  it("filters messages.direction with the real enum value 'in' (not 'inbound')", async () => {
    const eqCalls: EqCall[] = [];
    const supabase = makeSupabaseMock({
      messageRow: {
        sender: "Booking.com <email.campaign@sg.booking.com>",
        body: "Exclusive offers inside. Unsubscribe anytime.",
        metadata: {},
      },
      threadTitle: "Your next getaway — 30% off selected stays",
      eqCalls,
    });

    const result = await fetchLatestInboundSuppressionVerdict(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "photographer-uuid",
      "thread-uuid",
      1,
    );

    expect(result).not.toBeNull();
    expect(result?.suppressed).toBe(true);
    expect(result?.verdict).toBe("promotional_or_marketing");

    /**
     * The crux: if this assertion ever fails because someone refactored the
     * helper to use `'inbound'`, suppression silently regresses.
     */
    const directionCall = eqCalls.find((c) => c.col === "direction");
    expect(directionCall?.val).toBe("in");
    expect(directionCall?.val).not.toBe("inbound");
  });

  it("returns null when no inbound message exists", async () => {
    const eqCalls: EqCall[] = [];
    const supabase = makeSupabaseMock({
      messageRow: null,
      threadTitle: "Some thread",
      eqCalls,
    });
    const result = await fetchLatestInboundSuppressionVerdict(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "p",
      "t",
      1,
    );
    expect(result).toBeNull();
  });

  it("returns null (not throws) when DB call errors", async () => {
    const supabase = {
      from: () => {
        throw new Error("transient db");
      },
    };
    const result = await fetchLatestInboundSuppressionVerdict(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "p",
      "t",
      1,
    );
    expect(result).toBeNull();
  });

  it("uses thread.title as the subject proxy and feeds it to the classifier", async () => {
    const eqCalls: EqCall[] = [];
    const supabase = makeSupabaseMock({
      messageRow: {
        /**
         * Deliberately neutral sender + body: nothing here triggers a
         * suppression reason on its own. The ONLY suppression-relevant
         * signal in this fixture is the subject. If `fetchLatestInboundSuppressionVerdict`
         * stops proxying `threads.title` into `classifyInboundSuppression`,
         * `subject_promo_markers` will not appear and this test will fail.
         */
        sender: "Newsletter <hello@studiobrand.com>",
        body: "Hi friends, new offering this week.",
        metadata: {},
      },
      threadTitle: "Spring deals 30% off — view in browser",
      eqCalls,
    });
    const result = await fetchLatestInboundSuppressionVerdict(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "p",
      "t",
      1,
    );
    /**
     * We assert on the reason list, not the final verdict: marketing threshold
     * is 3 independent signals, so subject alone won't suppress. But proving
     * that `subject_promo_markers` appears in `reasons` is exactly what
     * locks in "the subject WAS proxied through `threads.title` and reached
     * the classifier" — which is the regression we care about.
     */
    expect(result).not.toBeNull();
    expect(result?.reasons).toContain("subject_promo_markers");
  });
});

describe("extractOpportunisticHeaders — Gmail import shapes", () => {
  it("reads the structured `inbound_headers` slice persisted by materialize", () => {
    const headers = extractOpportunisticHeaders({
      gmail_import: {
        inbound_headers: {
          from: "Booking.com <email.campaign@sg.booking.com>",
          list_unsubscribe: "<mailto:unsub@sg.booking.com>",
          list_id: null,
          precedence: null,
          auto_submitted: null,
        },
      },
    });
    expect(headers?.["list-unsubscribe"]).toBe("<mailto:unsub@sg.booking.com>");
  });

  it("reads the legacy gmail-array shape when present", () => {
    const headers = extractOpportunisticHeaders({
      gmail_import: {
        headers: [
          { name: "Precedence", value: "bulk" },
          { name: "List-Unsubscribe", value: "<mailto:unsub@example.com>" },
        ],
      },
    });
    expect(headers?.precedence).toBe("bulk");
    expect(headers?.["list-unsubscribe"]).toBe("<mailto:unsub@example.com>");
  });

  it("returns null when nothing recognised is present", () => {
    expect(extractOpportunisticHeaders({})).toBeNull();
    expect(extractOpportunisticHeaders(null)).toBeNull();
  });
});
