import { describe, expect, it } from "vitest";
import {
  fetchAssistantInquiryCountSnapshot,
  IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
} from "./fetchAssistantInquiryCountSnapshot.ts";

function mockSupabase(rows: Array<Record<string, unknown>>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          neq: () => ({
            gte: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe("fetchAssistantInquiryCountSnapshot", () => {
  it("exposes an idle shape when re-exported (fixtures)", () => {
    expect(IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT.didRun).toBe(false);
  });

  it("returns zeroes when there are no qualifying inquiry threads", async () => {
    const supabase = mockSupabase([]);
    const now = new Date("2026-04-21T12:00:00.000Z");
    const out = await fetchAssistantInquiryCountSnapshot(supabase as never, "p1", { now });
    expect(out.didRun).toBe(true);
    expect(out.windows.today.count).toBe(0);
    expect(out.comparison.todayMinusYesterday).toBe(0);
    expect(out.truncated).toBe(false);
  });

  it("buckets by first_inbound and inquiry semantics; comparison-ready", async () => {
    const supabase = mockSupabase([
      {
        thread_id: "a",
        first_inbound_at: "2026-04-21T08:00:00.000Z",
        wedding_id: "w1",
        wedding_stage: "inquiry",
        ai_routing_metadata: null,
        kind: "client",
      },
      {
        thread_id: "b",
        first_inbound_at: "2026-04-20T08:00:00.000Z",
        wedding_id: "w2",
        wedding_stage: "booked",
        ai_routing_metadata: null,
        kind: "client",
      },
    ]);
    const now = new Date("2026-04-21T12:00:00.000Z");
    const out = await fetchAssistantInquiryCountSnapshot(supabase as never, "p1", { now });
    expect(out.windows.today.count).toBe(1);
    expect(out.windows.yesterday.count).toBe(0);
    expect(out.comparison.todayMinusYesterday).toBe(1);
  });
});
