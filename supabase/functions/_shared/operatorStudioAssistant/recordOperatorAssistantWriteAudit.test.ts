import { describe, expect, it, vi } from "vitest";
import { recordOperatorAssistantWriteAudit } from "./recordOperatorAssistantWriteAudit.ts";

describe("recordOperatorAssistantWriteAudit", () => {
  it("inserts audit row and returns auditId", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      expect(table).toBe("operator_assistant_write_audit");
      return {
        insert: (row: Record<string, unknown>) => {
          expect(row.operation).toBe("task_create");
          expect(row.entity_table).toBe("tasks");
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "audit-x" },
                  error: null,
                }),
            }),
          };
        },
      };
    });

    const out = await recordOperatorAssistantWriteAudit({ from: fromMock } as never, "photo-1", {
      operation: "task_create",
      entityTable: "tasks",
      entityId: "task-uuid",
      detail: { title: "T" },
    });

    expect(out.auditId).toBe("audit-x");
  });
});
