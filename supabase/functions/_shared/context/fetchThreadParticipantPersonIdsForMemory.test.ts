import { describe, expect, it } from "vitest";
import { fetchThreadParticipantPersonIdsForMemory } from "./fetchThreadParticipantPersonIdsForMemory.ts";

describe("fetchThreadParticipantPersonIdsForMemory", () => {
  it("returns empty when threadId is null or blank", async () => {
    const supabase = {} as never;
    expect(await fetchThreadParticipantPersonIdsForMemory(supabase, "p", null)).toEqual([]);
    expect(await fetchThreadParticipantPersonIdsForMemory(supabase, "p", "")).toEqual([]);
  });

  it("returns sorted distinct person_id values", async () => {
    const payload = {
      data: [
        { person_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
        { person_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
        { person_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
      ],
      error: null,
    };
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => resolve(payload);
    const supabase = { from: () => chain } as never;

    const ids = await fetchThreadParticipantPersonIdsForMemory(
      supabase,
      "photo-1",
      "thread-1",
    );
    expect(ids).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
  });
});
