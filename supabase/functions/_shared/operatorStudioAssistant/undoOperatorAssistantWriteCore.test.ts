import { describe, expect, it, vi } from "vitest";
import { undoOperatorAssistantWrite } from "./undoOperatorAssistantWriteCore.ts";

describe("undoOperatorAssistantWrite", () => {
  it("returns 404 when audit row missing", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "operator_assistant_write_audit") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const out = await undoOperatorAssistantWrite({ from: fromMock } as never, "photo-1", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(out).toEqual({ ok: false, error: "audit record not found", status: 404 });
  });

  it("returns 409 when already undone", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "operator_assistant_write_audit") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "a1",
                      photographer_id: "photo-1",
                      operation: "calendar_event_create",
                      entity_id: "e1",
                      detail: {},
                      undone_at: "2026-01-01T00:00:00.000Z",
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const out = await undoOperatorAssistantWrite({ from: fromMock } as never, "photo-1", "a1");
    expect(out).toEqual({ ok: false, error: "already undone", status: 409 });
  });

  it("calendar_event_create deletes row and marks audit", async () => {
    const order: string[] = [];
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "operator_assistant_write_audit") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  order.push("audit_select");
                  return Promise.resolve({
                    data: {
                      id: "audit-1",
                      photographer_id: "photo-1",
                      operation: "calendar_event_create",
                      entity_id: "ce-1",
                      detail: {},
                      undone_at: null,
                    },
                    error: null,
                  });
                },
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => {
                order.push("audit_mark");
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "calendar_events") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  order.push("cal_lookup");
                  return Promise.resolve({ data: { id: "ce-1" }, error: null });
                },
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: () => {
                order.push("cal_delete");
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const out = await undoOperatorAssistantWrite({ from: fromMock } as never, "photo-1", "audit-1");
    expect(out).toEqual({ ok: true, kind: "calendar_event_deleted" });
    expect(order).toEqual(["audit_select", "cal_lookup", "cal_delete", "audit_mark"]);
  });

  it("calendar_event_reschedule restores prior times from detail.before", async () => {
    const order: string[] = [];
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "operator_assistant_write_audit") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  order.push("audit_select");
                  return Promise.resolve({
                    data: {
                      id: "audit-r",
                      photographer_id: "photo-1",
                      operation: "calendar_event_reschedule",
                      entity_id: "ce-2",
                      detail: {
                        before: { startTime: "2026-05-01T10:00:00.000Z", endTime: "2026-05-01T11:00:00.000Z" },
                        after: { startTime: "2026-05-02T10:00:00.000Z", endTime: "2026-05-02T11:00:00.000Z" },
                      },
                      undone_at: null,
                    },
                    error: null,
                  });
                },
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => {
                order.push("audit_mark");
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }
      if (table === "calendar_events") {
        return {
          update: (patch: { start_time?: string; end_time?: string }) => {
            expect(patch).toEqual({
              start_time: "2026-05-01T10:00:00.000Z",
              end_time: "2026-05-01T11:00:00.000Z",
            });
            order.push("cal_update");
            return {
              eq: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const out = await undoOperatorAssistantWrite({ from: fromMock } as never, "photo-1", "audit-r");
    expect(out).toEqual({ ok: true, kind: "calendar_event_times_restored" });
    expect(order).toEqual(["audit_select", "cal_update", "audit_mark"]);
  });

  it("returns 400 for unsupported operation", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "operator_assistant_write_audit") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "a2",
                      operation: "task_create",
                      entity_id: "t1",
                      detail: {},
                      undone_at: null,
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const out = await undoOperatorAssistantWrite({ from: fromMock } as never, "photo-1", "a2");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(400);
      expect(out.error).toContain("task_create");
    }
  });

  it("returns 400 when reschedule detail missing before times", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "operator_assistant_write_audit") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "a3",
                      operation: "calendar_event_reschedule",
                      entity_id: "ce-x",
                      detail: {},
                      undone_at: null,
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const out = await undoOperatorAssistantWrite({ from: fromMock } as never, "photo-1", "a3");
    expect(out).toEqual({
      ok: false,
      error: "audit detail missing before.startTime / before.endTime",
      status: 400,
    });
  });
});
