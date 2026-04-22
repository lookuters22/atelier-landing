import { describe, expect, it } from "vitest";
import {
  resolveOperatorQueryEntitiesFromIndex,
  shouldRunOperatorQueryEntityResolution,
} from "./resolveOperatorQueryEntitiesFromIndex.ts";
import type { AssistantQueryEntityWeddingIndexRow } from "./resolveOperatorQueryEntitiesFromIndex.ts";

const baseW = (o: Partial<AssistantQueryEntityWeddingIndexRow> = {}): AssistantQueryEntityWeddingIndexRow => ({
  id: o.id ?? "w1",
  couple_names: o.couple_names ?? "A & B",
  location: o.location ?? "",
  stage: o.stage ?? "inquiry",
  project_type: o.project_type ?? "wedding",
  wedding_date: o.wedding_date ?? null,
});

describe("shouldRunOperatorQueryEntityResolution", () => {
  it("is false for very short questions (no index fetch in build)", () => {
    expect(shouldRunOperatorQueryEntityResolution("hi")).toBe(false);
    expect(shouldRunOperatorQueryEntityResolution("  ab ")).toBe(false);
  });

  it("is true for normal operator phrasing", () => {
    expect(shouldRunOperatorQueryEntityResolution("Elena and Marco")).toBe(true);
    expect(shouldRunOperatorQueryEntityResolution("Como")).toBe(true);
  });
});

describe("resolveOperatorQueryEntitiesFromIndex", () => {
  it("returns a unique wedding when a couple is named clearly in one project row", () => {
    const weddings = [baseW({ id: "w-em", couple_names: "Elena & Marco", location: "Milan" })];
    const r = resolveOperatorQueryEntitiesFromIndex("What is going on with the inquiry of Elena and Marco?", weddings, []);
    expect(r.weddingSignal).toBe("unique");
    expect(r.uniqueWeddingId).toBe("w-em");
    expect(r.weddingCandidates).toHaveLength(0);
  });

  it("resolves a location-based question when a place token is distinctive", () => {
    const weddings = [baseW({ id: "w-l1", couple_names: "Smith & Jones", location: "Lake Como", stage: "inquiry" })];
    const r = resolveOperatorQueryEntitiesFromIndex("inquiry in Como", weddings, []);
    expect(r.weddingSignal).toBe("unique");
    expect(r.uniqueWeddingId).toBe("w-l1");
  });

  it("returns ambiguous candidates when two projects score similarly (same place)", () => {
    const weddings = [
      baseW({ id: "w1", couple_names: "A & A", location: "Villa, Como", stage: "inquiry" }),
      baseW({ id: "w2", couple_names: "B & B", location: "Hotel Como", stage: "inquiry" }),
    ];
    const r = resolveOperatorQueryEntitiesFromIndex("What is the inquiry in Como?", weddings, []);
    expect(r.weddingSignal).toBe("ambiguous");
    expect(r.uniqueWeddingId).toBeNull();
    expect(r.weddingCandidates.length).toBeGreaterThanOrEqual(2);
    expect(r.weddingCandidates.map((c) => c.weddingId).sort()).toContain("w1");
    expect(r.weddingCandidates.map((c) => c.weddingId).sort()).toContain("w2");
  });

  it("returns no wedding signal when nothing in the index matches", () => {
    const r = resolveOperatorQueryEntitiesFromIndex("zzqx randomtokennomatch", [baseW()], []);
    expect(r.weddingSignal).toBe("none");
    expect(r.uniqueWeddingId).toBeNull();
    expect(r.weddingCandidates).toHaveLength(0);
  });

  it("does not pin a wedding on commercial / generic ‘inquiry’ phrasing without couple or place tokens", () => {
    const weddings = [
      baseW({ id: "w1", couple_names: "Taylor & Jordan", location: "NYC", stage: "inquiry" }),
    ];
    const r = resolveOperatorQueryEntitiesFromIndex(
      "i received a phone call about a skincare inquiry today. did they send an email too maybe?",
      weddings,
      [],
    );
    expect(r.weddingSignal).toBe("none");
    expect(r.uniqueWeddingId).toBeNull();
  });

  it("matches people by full display name against the query", () => {
    const r = resolveOperatorQueryEntitiesFromIndex("When did we talk to Rita James last?", [], [
      { id: "p1", display_name: "Rita James", kind: "client" },
    ]);
    expect(r.weddingSignal).toBe("none");
    expect(r.personMatches).toEqual([{ id: "p1", display_name: "Rita James", kind: "client" }]);
  });
});
