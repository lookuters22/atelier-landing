import { describe, expect, it } from "vitest";
import { assistantMemoriesOrFilter } from "./fetchAssistantMemoryHeaders.ts";

describe("assistantMemoriesOrFilter", () => {
  it("defaults to studio only", () => {
    expect(assistantMemoriesOrFilter(null, null)).toBe("scope.eq.studio");
  });

  it("adds project segment when wedding focused", () => {
    const wid = "11111111-1111-1111-1111-111111111111";
    expect(assistantMemoriesOrFilter(wid, null)).toBe(
      `scope.eq.studio,and(scope.eq.project,wedding_id.eq.${wid})`,
    );
  });

  it("adds person segment when person focused", () => {
    const pid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(assistantMemoriesOrFilter(null, pid)).toBe(
      `scope.eq.studio,and(scope.eq.person,person_id.eq.${pid})`,
    );
  });

  it("combines wedding and person when both set", () => {
    const wid = "11111111-1111-1111-1111-111111111111";
    const pid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(assistantMemoriesOrFilter(wid, pid)).toBe(
      `scope.eq.studio,and(scope.eq.project,wedding_id.eq.${wid}),and(scope.eq.person,person_id.eq.${pid})`,
    );
  });
});
