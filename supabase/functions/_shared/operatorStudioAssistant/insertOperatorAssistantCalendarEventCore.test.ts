import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../inngest.ts", () => ({
  inngest: { send: sendMock },
}));

import { insertOrUpdateCalendarEventForOperatorAssistant } from "./insertOperatorAssistantCalendarEventCore.ts";

describe("insertOrUpdateCalendarEventForOperatorAssistant", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  it("creates event, fires Inngest when weddingId set, records audit", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "weddings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: "w1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "calendar_events") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "ev-1" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "audit-cal-1" },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    const out = await insertOrUpdateCalendarEventForOperatorAssistant(supabase, "photo-1", {
      operation: "create",
      title: "Shoot",
      startTime: "2026-05-01T10:00:00.000Z",
      endTime: "2026-05-01T11:00:00.000Z",
      eventType: "other",
      weddingId: "w1",
    });

    expect(out.calendarEventId).toBe("ev-1");
    expect(out.operation).toBe("create");
    expect(out.auditId).toBe("audit-cal-1");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("reschedule captures before times in audit detail", async () => {
    let auditDetail: Record<string, unknown> | null = null;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "calendar_events") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "ev-2",
                      wedding_id: "w1",
                      start_time: "2026-05-01T10:00:00.000Z",
                      end_time: "2026-05-01T11:00:00.000Z",
                    },
                    error: null,
                  }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          }),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: (row: { detail?: unknown }) => {
            auditDetail = row.detail as Record<string, unknown>;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "audit-cal-r1" },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    const out = await insertOrUpdateCalendarEventForOperatorAssistant(supabase, "photo-1", {
      operation: "reschedule",
      calendarEventId: "ev-2",
      startTime: "2026-05-02T10:00:00.000Z",
      endTime: "2026-05-02T11:00:00.000Z",
    });

    expect(out.operation).toBe("reschedule");
    expect(out.auditId).toBe("audit-cal-r1");
    expect(auditDetail).toMatchObject({
      before: { startTime: "2026-05-01T10:00:00.000Z", endTime: "2026-05-01T11:00:00.000Z" },
      after: { startTime: "2026-05-02T10:00:00.000Z", endTime: "2026-05-02T11:00:00.000Z" },
    });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
