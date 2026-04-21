import { describe, expect, it } from "vitest";
import type { MemoryHeader } from "./fetchMemoryHeaders.ts";
import { selectAssistantMemoryIdsDeterministic } from "./selectAssistantMemoryIdsDeterministic.ts";

function h(
  partial: Partial<MemoryHeader> & Pick<MemoryHeader, "id" | "scope">,
): MemoryHeader {
  return {
    wedding_id: null,
    person_id: null,
    type: "",
    title: "",
    summary: "",
    ...partial,
  };
}

describe("selectAssistantMemoryIdsDeterministic", () => {
  it("with no focus: only studio headers are eligible", () => {
    const headers: MemoryHeader[] = [
      h({ id: "s1", scope: "studio", title: "studio note" }),
      h({
        id: "p1",
        scope: "project",
        wedding_id: "w1",
        title: "project note",
      }),
    ];
    const ids = selectAssistantMemoryIdsDeterministic({
      queryText: "note",
      memoryHeaders: headers,
      focusedWeddingId: null,
      focusedPersonId: null,
    });
    expect(ids).toEqual(["s1"]);
  });

  it("with focusedWeddingId: includes matching project and studio", () => {
    const wid = "11111111-1111-1111-1111-111111111111";
    const headers: MemoryHeader[] = [
      h({ id: "s1", scope: "studio", title: "alpha studio" }),
      h({
        id: "p1",
        scope: "project",
        wedding_id: wid,
        title: "alpha project",
      }),
      h({
        id: "p2",
        scope: "project",
        wedding_id: "99999999-9999-9999-9999-999999999999",
        title: "other wedding",
      }),
    ];
    const ids = selectAssistantMemoryIdsDeterministic({
      queryText: "alpha",
      memoryHeaders: headers,
      focusedWeddingId: wid,
      focusedPersonId: null,
    });
    expect(ids).toContain("p1");
    expect(ids).toContain("s1");
    expect(ids).not.toContain("p2");
  });

  it("with focusedPersonId: includes matching person and studio", () => {
    const pid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const headers: MemoryHeader[] = [
      h({ id: "s1", scope: "studio" }),
      h({ id: "per1", scope: "person", person_id: pid, title: "marco scout" }),
      h({
        id: "per2",
        scope: "person",
        person_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        title: "other",
      }),
    ];
    const ids = selectAssistantMemoryIdsDeterministic({
      queryText: "marco scout",
      memoryHeaders: headers,
      focusedWeddingId: null,
      focusedPersonId: pid,
    });
    expect(ids).toContain("per1");
    expect(ids).toContain("s1");
    expect(ids).not.toContain("per2");
  });
});
