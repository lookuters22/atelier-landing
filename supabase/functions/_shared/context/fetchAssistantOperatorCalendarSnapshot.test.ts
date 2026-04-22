import { describe, expect, it } from "vitest";
import {
  fetchAssistantOperatorCalendarSnapshot,
  OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS,
} from "./fetchAssistantOperatorCalendarSnapshot.ts";
import { buildOperatorCalendarLookupPlan } from "../../../../src/lib/operatorAssistantCalendarLookupPlan.ts";

const emptyEntity = {
  weddingSignal: "none" as const,
  uniqueWeddingId: null,
  queryResolvedProjectFacts: null,
};

describe("fetchAssistantOperatorCalendarSnapshot", () => {
  it("returns ordered events and wedding names (read-only, bounded)", async () => {
    const t0 = new Date("2026-04-20T10:00:00.000Z");
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What's on my calendar?",
      now: t0,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    const e1 = {
      id: "e1",
      title: "Consult",
      start_time: "2026-04-21T14:00:00.000Z",
      end_time: "2026-04-21T15:00:00.000Z",
      event_type: "about_call" as const,
      wedding_id: "w-1",
      meeting_link: null,
    };
    const e2 = {
      id: "e2",
      title: "Later",
      start_time: "2026-04-25T09:00:00.000Z",
      end_time: "2026-04-25T10:00:00.000Z",
      event_type: "other" as const,
      wedding_id: null,
      meeting_link: null,
    };
    const supabase = {
      from: (table: string) => {
        if (table === "calendar_events") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.gte = () => chain;
          chain.lt = () => chain;
          chain.in = () => chain;
          chain.ilike = () => chain;
          chain.order = () => chain;
          chain.limit = () => Promise.resolve({ data: [e1, e2], error: null });
          return chain;
        }
        if (table === "weddings") {
          return {
            select: () => ({
              eq: () => ({
                in: () =>
                  Promise.resolve({
                    data: [{ id: "w-1", couple_names: "A & B" }],
                    error: null,
                  }),
              }),
            }),
          };
        }
        return {};
      },
    } as never;

    const snap = await fetchAssistantOperatorCalendarSnapshot(supabase, "photo-1", { now: t0, plan });
    expect(snap.didRun).toBe(true);
    expect(snap.lookupMode).toBe(plan.lookupMode);
    expect(snap.events).toHaveLength(2);
    expect(snap.events[0]!.id).toBe("e1");
    expect(snap.events[0]!.coupleNames).toBe("A & B");
    expect(snap.events[1]!.coupleNames).toBeNull();
    expect(snap.truncated).toBe(false);
    expect(snap.orderAscending).toBe(true);
    expect(OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS).toBeGreaterThan(0);
  });

  it("marks truncated when the query returns more than the row cap", async () => {
    const t0 = new Date("2026-04-20T10:00:00.000Z");
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What was on the calendar last month?",
      now: t0,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    const many = Array.from({ length: OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS + 1 }, (_, i) => ({
      id: `e${i}`,
      title: "T",
      start_time: "2026-04-10T10:00:00.000Z",
      end_time: "2026-04-10T11:00:00.000Z",
      event_type: "other" as const,
      wedding_id: null as string | null,
      meeting_link: null as string | null,
    }));
    const supabase = {
      from: (table: string) => {
        if (table === "calendar_events") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.gte = () => chain;
          chain.lt = () => chain;
          chain.in = () => chain;
          chain.ilike = () => chain;
          chain.order = () => chain;
          chain.limit = () => Promise.resolve({ data: many, error: null });
          return chain;
        }
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
      },
    } as never;

    const snap = await fetchAssistantOperatorCalendarSnapshot(supabase, "photo-1", { now: t0, plan });
    expect(snap.truncated).toBe(true);
    expect(snap.rowCountReturned).toBe(OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS);
  });

  it("applies wedding_id and ilike filters from the plan", async () => {
    const t0 = new Date("2026-04-20T10:00:00.000Z");
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "Anything in Capri that week?",
      now: t0,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.titleContains).toBe("capri");

    const calls: string[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "calendar_events") {
          const chain: Record<string, unknown> = {};
          chain.select = () => {
            calls.push("select");
            return chain;
          };
          chain.eq = (col: string, v: unknown) => {
            calls.push(`eq:${col}=${v}`);
            return chain;
          };
          chain.gte = () => chain;
          chain.lt = () => chain;
          chain.ilike = (col: string, pat: string) => {
            calls.push(`ilike:${col}:${pat}`);
            return chain;
          };
          chain.in = () => chain;
          chain.order = () => chain;
          chain.limit = () => Promise.resolve({ data: [], error: null });
          return chain;
        }
        return {};
      },
    } as never;

    await fetchAssistantOperatorCalendarSnapshot(supabase, "photo-1", { now: t0, plan });
    expect(calls.some((c) => c.startsWith("ilike:title"))).toBe(true);
  });
});
