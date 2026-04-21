/**
 * Deterministic case-memory id selection — no DB; tenant hydration is enforced in fetchSelectedMemoriesFull.
 */
import { describe, expect, it } from "vitest";
import type { MemoryHeader } from "./fetchMemoryHeaders.ts";
import {
  MAX_SELECTED_MEMORIES,
  MAX_STUDIO_MEMORIES_IN_REPLY,
  selectRelevantMemoryIdsDeterministic,
} from "./selectRelevantMemoriesForDecisionContext.ts";

function h(partial: Partial<MemoryHeader> & Pick<MemoryHeader, "id">): MemoryHeader {
  const wedding_id = partial.wedding_id ?? null;
  const defaultScope: MemoryHeader["scope"] =
    partial.scope ??
    (wedding_id != null && String(wedding_id).trim() !== "" ? "project" : "studio");
  return {
    wedding_id,
    person_id: partial.person_id ?? null,
    scope: partial.scope ?? defaultScope,
    type: partial.type ?? "note",
    title: partial.title ?? "",
    summary: partial.summary ?? "",
    id: partial.id,
  };
}

describe("selectRelevantMemoryIdsDeterministic", () => {
  const baseIn = {
    photographerId: "photo-1",
    threadId: "thread-1",
    rawMessage: "Hello",
    threadSummary: null as string | null,
    replyModeParticipantPersonIds: [] as string[],
  };

  it("prefers in-scope project rows over studio when weddingId is set", () => {
    const weddingId = "w-a";
    const headers: MemoryHeader[] = [
      h({
        id: "tenant-wide",
        wedding_id: null,
        scope: "studio",
        title: "Venue policy",
        summary: "matches keyword venue everywhere",
      }),
      h({
        id: "wedding-scoped",
        wedding_id: weddingId,
        scope: "project",
        title: "Our venue",
        summary: "same keyword venue for overlap",
      }),
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId,
      rawMessage: "venue question about the day",
      memoryHeaders: headers,
    });
    expect(ids[0]).toBe("wedding-scoped");
    expect(ids).toContain("tenant-wide");
  });

  it("never selects project memory from another wedding even with stronger keyword overlap", () => {
    const weddingA = "w-a";
    const headers: MemoryHeader[] = [
      h({
        id: "in-a",
        wedding_id: weddingA,
        scope: "project",
        title: "Our note",
        summary: "mild overlap venue",
      }),
      h({
        id: "in-b",
        wedding_id: "w-b",
        scope: "project",
        title: "Other wedding",
        summary: "venue venue venue exclusive venue keyword",
      }),
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: weddingA,
      rawMessage: "venue venue venue exclusive venue keyword",
      memoryHeaders: headers,
    });
    expect(ids).not.toContain("in-b");
    expect(ids).toContain("in-a");
  });

  it("does not promote headers that are not in the input list (no cross-tenant injection)", () => {
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: "w",
      rawMessage: "x",
      memoryHeaders: [h({ id: "only-one", wedding_id: "w", title: "a", summary: "b" })],
    });
    expect(ids).toEqual(["only-one"]);
    expect(ids).not.toContain("foreign-id");
  });

  it("caps at MAX_SELECTED_MEMORIES", () => {
    const headers: MemoryHeader[] = Array.from({ length: 8 }, (_, i) =>
      h({
        id: `m-${i}`,
        wedding_id: "w",
        scope: "project",
        title: `t${i}`,
        summary: `venue ${i}`,
      }),
    );
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: "w",
      rawMessage: "venue",
      memoryHeaders: headers,
    });
    expect(ids.length).toBe(MAX_SELECTED_MEMORIES);
  });

  it("when weddingId is set, caps studio-scoped memories at MAX_STUDIO_MEMORIES_IN_REPLY", () => {
    const w = "w-a";
    const headers: MemoryHeader[] = [
      h({ id: "p1", wedding_id: w, scope: "project", title: "a", summary: "venue" }),
      ...Array.from({ length: 5 }, (_, i) =>
        h({ id: `s${i}`, wedding_id: null, scope: "studio", title: `st${i}`, summary: "venue" }),
      ),
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: w,
      rawMessage: "venue",
      memoryHeaders: headers,
    });
    const studioCount = ids.filter((id) => headers.find((x) => x.id === id)?.scope === "studio").length;
    expect(studioCount).toBeLessThanOrEqual(MAX_STUDIO_MEMORIES_IN_REPLY);
    expect(ids.length).toBeLessThanOrEqual(MAX_SELECTED_MEMORIES);
  });

  it("when weddingId is null, does not apply studio sub-cap (legacy breadth)", () => {
    const headers: MemoryHeader[] = Array.from({ length: 5 }, (_, i) =>
      h({ id: `s${i}`, wedding_id: null, scope: "studio", title: `t${i}`, summary: "venue" }),
    );
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: null,
      rawMessage: "venue",
      memoryHeaders: headers,
    });
    expect(ids.length).toBe(5);
  });

  it("stable ordering: same input yields same ids", () => {
    const headers: MemoryHeader[] = [
      h({ id: "b", wedding_id: "w", title: "x", summary: "y" }),
      h({ id: "a", wedding_id: "w", title: "x", summary: "y" }),
    ];
    const input = { ...baseIn, weddingId: "w", rawMessage: "nomatch", memoryHeaders: headers };
    expect(selectRelevantMemoryIdsDeterministic(input)).toEqual(selectRelevantMemoryIdsDeterministic(input));
  });

  it("ranks provisional strong substring above weak exception word when scope equal", () => {
    const headers: MemoryHeader[] = [
      h({
        id: "weak-exception",
        wedding_id: null,
        scope: "studio",
        type: "note",
        title: "Something with exception in body",
        summary: "no strong cue",
      }),
      h({
        id: "strong-cue",
        wedding_id: null,
        scope: "studio",
        type: "v3_verify_case_note",
        title: "QA",
        summary: "fixture",
      }),
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      weddingId: null,
      rawMessage: "unrelated text",
      memoryHeaders: headers,
    });
    expect(ids[0]).toBe("strong-cue");
  });

  it("selects person-scoped memory when person_id is in replyModeParticipantPersonIds", () => {
    const w = "w-a";
    const marcoId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const headers: MemoryHeader[] = [
      h({
        id: "person-marco",
        wedding_id: null,
        scope: "person",
        person_id: marcoId,
        title: "Marco",
        summary: "venue scout requirement keywordscout",
      }),
      h({ id: "proj-1", wedding_id: w, scope: "project", title: "x", summary: "other" }),
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      replyModeParticipantPersonIds: [marcoId],
      weddingId: w,
      rawMessage: "keywordscout planning",
      memoryHeaders: headers,
    });
    expect(ids).toContain("person-marco");
    expect(ids).toContain("proj-1");
  });

  it("does not select person-scoped memory when person_id is not in replyModeParticipantPersonIds", () => {
    const w = "w-a";
    const headers: MemoryHeader[] = [
      h({
        id: "person-1",
        wedding_id: null,
        scope: "person",
        person_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        title: "Marco",
        summary: "venue venue venue scout",
      }),
      h({ id: "proj-1", wedding_id: w, scope: "project", title: "x", summary: "venue" }),
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      ...baseIn,
      replyModeParticipantPersonIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      weddingId: w,
      rawMessage: "venue venue venue",
      memoryHeaders: headers,
    });
    expect(ids).not.toContain("person-1");
    expect(ids).toContain("proj-1");
  });
});
