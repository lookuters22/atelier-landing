import { describe, expect, it, vi } from "vitest";
import { insertMemoryForOperatorAssistant } from "./insertOperatorAssistantMemoryCore.ts";

describe("insertMemoryForOperatorAssistant", () => {
  it("inserts into memories (not tasks or playbook tables)", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "memories") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "mem-1" },
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
                  data: { id: "audit-mem-1" },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;

    const out = await insertMemoryForOperatorAssistant(supabase, "photo-1", {
      memoryScope: "studio",
      title: "Studio default",
      summary: "S".repeat(20),
      fullContent: "Full body",
      weddingId: null,
    });

    expect(out.id).toBe("mem-1");
    expect(out.auditId).toBe("audit-mem-1");
  });

  it("verifies wedding ownership before insert when memoryScope is project", async () => {
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
      if (table === "memories") {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                order.push("memories");
                return Promise.resolve({ data: { id: "m2" }, error: null });
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
                return Promise.resolve({ data: { id: "audit-m2" }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    await insertMemoryForOperatorAssistant(supabase, "photo-1", {
      memoryScope: "project",
      title: "On site",
      summary: "Summary text here",
      fullContent: "Longer content",
      weddingId: "w1",
    });
    expect(order).toEqual(["weddings", "memories", "audit"]);
  });

  it("verifies people ownership before insert when memoryScope is person", async () => {
    const order: string[] = [];
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "people") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  order.push("people");
                  return Promise.resolve({ data: { id: "p1" }, error: null });
                },
              }),
            }),
          }),
        };
      }
      if (table === "memories") {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                order.push("memories");
                return Promise.resolve({ data: { id: "m3" }, error: null });
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
                return Promise.resolve({ data: { id: "audit-m3" }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    await insertMemoryForOperatorAssistant(supabase, "photo-1", {
      memoryScope: "person",
      title: "Planner pref",
      summary: "Likes email",
      fullContent: "Likes email summaries",
      weddingId: null,
      personId: "p1",
    });
    expect(order).toEqual(["people", "memories", "audit"]);
  });
});
