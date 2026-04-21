import { describe, expect, it, vi } from "vitest";
import { buildAssistantContext } from "./buildAssistantContext.ts";

describe("buildAssistantContext", () => {
  it("returns clientFacingForbidden true and studio-only memory scope when no focus", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    let weddingsCalls = 0;
    let memoriesThenCalls = 0;
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings") {
            weddingsCalls += 1;
            if (weddingsCalls === 1) {
              return Promise.resolve({ data: null, error: null });
            }
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: "w1", couple_names: "A & B", stage: "booked", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({
              data: [{ id: "p1", display_name: "Pat", kind: "client" }],
              error: null,
            });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-studio",
                    wedding_id: null,
                    scope: "studio",
                    person_id: null,
                    type: "note",
                    title: "turnaround",
                    summary: "four weeks",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-studio",
                  type: "note",
                  title: "turnaround",
                  summary: "four weeks",
                  full_content: "Default turnaround is four weeks.",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "",
    });

    expect(ctx.clientFacingForbidden).toBe(true);
    expect(ctx.focusedWeddingId).toBeNull();
    expect(ctx.focusedPersonId).toBeNull();
    expect(ctx.retrievalLog.queryTextScopeExpansion).toBe("none");
    expect(ctx.retrievalLog.focus.weddingIdEffective).toBeNull();
    expect(ctx.retrievalLog.scopesQueried).toContain("studio_memory");
    expect(ctx.retrievalLog.scopesQueried).not.toContain("project_memory");
    expect(ctx.retrievalLog.scopesQueried).not.toContain("person_memory");
    expect(ctx.selectedMemories.map((m) => m.id)).toContain("m-studio");
    expect(ctx.crmDigest.recentWeddings.length).toBe(1);

    vi.restoreAllMocks();
  });

  it("applies effective focusedWeddingId for memory headers and logs project_memory scope", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const wid = "11111111-1111-1111-1111-111111111111";
    let weddingsMaybeSingle = 0;
    let memoriesThenCalls = 0;

    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings") {
            weddingsMaybeSingle += 1;
            if (weddingsMaybeSingle === 1) {
              return Promise.resolve({ data: { id: wid }, error: null });
            }
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "authorized_case_exceptions") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: wid, couple_names: "X", stage: "inquiry", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({ data: [], error: null });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-proj",
                    wedding_id: wid,
                    scope: "project",
                    person_id: null,
                    type: "t",
                    title: "venue",
                    summary: "s",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-proj",
                  type: "t",
                  title: "venue",
                  summary: "s",
                  full_content: "full",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "venue",
      focusedWeddingId: wid,
    });

    expect(ctx.focusedWeddingId).toBe(wid);
    expect(ctx.retrievalLog.scopesQueried).toContain("project_memory");
    expect(ctx.memoryHeaders.some((h) => h.id === "m-proj")).toBe(true);

    vi.restoreAllMocks();
  });

  it("applies effective focusedPersonId and logs person_memory scope", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const pid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let memoriesThenCalls = 0;

    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings") return Promise.resolve({ data: null, error: null });
          if (table === "people") {
            return Promise.resolve({ data: { id: pid }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "people") {
            return resolve({
              data: [{ id: pid, display_name: "Marco", kind: "vendor" }],
              error: null,
            });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-person",
                    wedding_id: null,
                    scope: "person",
                    person_id: pid,
                    type: "t",
                    title: "scout",
                    summary: "four hour",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-person",
                  type: "t",
                  title: "scout",
                  summary: "four hour",
                  full_content: "Scout block is four hours.",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "scout",
      focusedPersonId: pid,
    });

    expect(ctx.focusedPersonId).toBe(pid);
    expect(ctx.retrievalLog.scopesQueried).toContain("person_memory");
    expect(ctx.selectedMemories.some((m) => m.id === "m-person")).toBe(true);

    vi.restoreAllMocks();
  });

  it("drops invalid focusedWeddingId (not owned by tenant) for memory OR and scopesQueried", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const requested = "11111111-1111-1111-1111-111111111111";
    let memoriesThenCalls = 0;

    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings") {
            return Promise.resolve({ data: null, error: null });
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "people") {
            return resolve({ data: [], error: null });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "only-studio",
                    wedding_id: null,
                    scope: "studio",
                    person_id: null,
                    type: "t",
                    title: "x",
                    summary: "y",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "only-studio",
                  type: "t",
                  title: "x",
                  summary: "y",
                  full_content: "z",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "",
      focusedWeddingId: requested,
    });

    expect(ctx.focusedWeddingId).toBeNull();
    expect(ctx.retrievalLog.focus.weddingIdRequested).toBe(requested);
    expect(ctx.retrievalLog.focus.weddingIdEffective).toBeNull();
    expect(ctx.retrievalLog.scopesQueried).not.toContain("project_memory");

    vi.restoreAllMocks();
  });
});
