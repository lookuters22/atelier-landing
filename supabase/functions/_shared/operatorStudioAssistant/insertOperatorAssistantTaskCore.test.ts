import { describe, expect, it, vi } from "vitest";
import { insertTaskForOperatorAssistant } from "./insertOperatorAssistantTaskCore.ts";

describe("insertTaskForOperatorAssistant", () => {
  it("inserts into tasks (not playbook or memory tables)", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "tasks") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "task-1" },
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
                  data: { id: "audit-task-1" },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;

    const out = await insertTaskForOperatorAssistant(supabase, "photo-1", {
      title: "Remind to invoice",
      dueDate: "2026-04-21",
      dueDateNormalized: "2026-04-21",
      weddingId: null,
    });

    expect(out.id).toBe("task-1");
    expect(out.auditId).toBe("audit-task-1");
  });

  it("verifies wedding ownership before insert when weddingId is set", async () => {
    const order: string[] = [];
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "weddings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  order.push("weddings");
                  return Promise.resolve({ data: { id: "w1" }, error: null });
                },
              }),
            }),
          }),
        };
      }
      if (table === "tasks") {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                order.push("tasks");
                return Promise.resolve({ data: { id: "t2" }, error: null });
              },
            }),
          }),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                order.push("audit");
                return Promise.resolve({ data: { id: "audit-t2" }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    await insertTaskForOperatorAssistant(supabase, "photo-1", {
      title: "Call",
      dueDate: "2026-04-22",
      dueDateNormalized: "2026-04-22",
      weddingId: "w1",
    });
    expect(order).toEqual(["weddings", "tasks", "audit"]);
  });
});
