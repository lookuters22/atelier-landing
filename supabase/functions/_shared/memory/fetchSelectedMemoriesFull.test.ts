import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchSelectedMemoriesFull } from "./fetchSelectedMemoriesFull.ts";

/**
 * execute_v3 Step 5E — focused verification: header scan stays light; promotion fills
 * `selectedMemories` with `full_content` only for chosen IDs (tenant-scoped).
 */
describe("fetchSelectedMemoriesFull — selectedMemories promotion", () => {
  it("loads full_content for requested memory ids under photographer_id", async () => {
    const supabase = {
      from(_table: string) {
        return {
          select(_cols: string) {
            return {
              eq(col: string, photographerId: string) {
                expect(col).toBe("photographer_id");
                expect(photographerId).toBe("tenant-a");
                return {
                  in(col2: string, ids: string[]) {
                    expect(col2).toBe("id");
                    expect(ids).toEqual(["mem-1"]);
                    return Promise.resolve({
                      data: [
                        {
                          id: "mem-1",
                          type: "preference",
                          title: "Reply tone",
                          summary: "Short header",
                          full_content: "LONG DURABLE BODY ONLY AFTER PROMOTION",
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      },
    };

    const rows = await fetchSelectedMemoriesFull(
      supabase as unknown as SupabaseClient,
      "tenant-a",
      ["mem-1"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("mem-1");
    expect(rows[0].summary).toBe("Short header");
    expect(rows[0].full_content).toBe(
      "LONG DURABLE BODY ONLY AFTER PROMOTION",
    );
  });
});
