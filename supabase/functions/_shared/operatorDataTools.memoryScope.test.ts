import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const memoryInsert = vi.fn().mockResolvedValue({ error: null });
  const supabaseAdmin = {
    from: vi.fn((table: string) => {
      if (table === "memories") {
        return { insert: memoryInsert };
      }
      return {};
    }),
  };
  return { memoryInsert, supabaseAdmin };
});

vi.mock("./supabase.ts", () => ({ supabaseAdmin: mocks.supabaseAdmin }));

import { handleOperatorDataToolCall } from "./operatorDataTools.ts";

describe("handleOperatorDataToolCall capture_operator_context", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes explicit scope project when wedding_id is a string", async () => {
    await handleOperatorDataToolCall(
      "capture_operator_context",
      { summary: "Remember venue walkthrough", wedding_id: "w-aaa" },
      { photographerId: "p1", operatorThreadId: "t1" },
    );
    expect(mocks.memoryInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        photographer_id: "p1",
        wedding_id: "w-aaa",
        scope: "project",
        type: "operator_whatsapp_note",
      }),
    );
  });

  it("writes explicit scope studio when wedding_id is omitted", async () => {
    await handleOperatorDataToolCall(
      "capture_operator_context",
      { summary: "Studio-wide default turnaround note" },
      { photographerId: "p1", operatorThreadId: "t1" },
    );
    expect(mocks.memoryInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        wedding_id: null,
        scope: "studio",
      }),
    );
  });
});
