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
    expect(order).toEqual(["weddings", "memories"]);
  });
});
