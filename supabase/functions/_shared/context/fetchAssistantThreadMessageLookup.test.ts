import { describe, expect, it } from "vitest";
import { fetchAssistantThreadMessageLookup } from "./fetchAssistantThreadMessageLookup.ts";
import type { AssistantOperatorQueryEntityResolution } from "../../../../src/types/assistantContext.types.ts";

const emptyEntity: AssistantOperatorQueryEntityResolution = {
  didRun: false,
  weddingSignal: "none",
  uniqueWeddingId: null,
  weddingCandidates: [],
  personMatches: [],
  queryResolvedProjectFacts: null,
};

type ThreadMock = {
  threadRows: unknown[];
  /** When set, `threads` table `then()` uses this on second and later resolves (hydrate by id). */
  threadHydrateRows?: unknown[];
  participantRows: unknown[];
  viewRows: unknown[];
};

function makeSupabase(mock: ThreadMock): typeof import("npm:@supabase/supabase-js@2").SupabaseClient {
  let threadsThenCount = 0;
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      let tableName = table;
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.ilike = () => chain;
      chain.neq = () => chain;
      chain.gte = () => chain;
      chain.lt = () => chain;
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (tableName === "threads") {
          threadsThenCount += 1;
          const data =
            threadsThenCount >= 2 && mock.threadHydrateRows != null
              ? mock.threadHydrateRows
              : mock.threadRows;
          return resolve({ data, error: null });
        }
        if (tableName === "thread_participants") {
          return resolve({ data: mock.participantRows, error: null });
        }
        if (tableName === "v_threads_inbox_latest_message") {
          return resolve({ data: mock.viewRows, error: null });
        }
        return resolve({ data: [], error: null });
      };
      return chain;
    },
  } as never;
}

const sampleThread = (id: string, weddingId: string | null) => ({
  id,
  title: "Re: Hello",
  wedding_id: weddingId,
  channel: "email",
  kind: "client",
  last_activity_at: "2025-10-01T12:00:00.000Z",
  last_inbound_at: "2025-10-01T10:00:00.000Z",
  last_outbound_at: "2025-10-01T11:00:00.000Z",
});

describe("fetchAssistantThreadMessageLookup", () => {
  it("returns idle without DB when there is no thread/message intent", async () => {
    const s = makeSupabase({ threadRows: [], participantRows: [], viewRows: [] });
    const r = await fetchAssistantThreadMessageLookup(s, "p1", {
      queryText: "What is the deposit amount?",
      weddingIdEffective: "w-1",
      personIdEffective: null,
      operatorQueryEntityResolution: {
        ...emptyEntity,
        didRun: true,
        weddingSignal: "unique",
        uniqueWeddingId: "w-1",
        weddingCandidates: [],
        personMatches: [],
        queryResolvedProjectFacts: null,
      },
    });
    expect(r).toEqual({
      didRun: false,
      selectionNote: "no thread/message intent",
      threads: [],
    });
  });

  it("fetches by wedding_id (scoped) and caps to bounded rows", async () => {
    const many = Array.from({ length: 20 }, (_, i) => sampleThread(`t${i}`, "w-1"));
    const s = makeSupabase({ threadRows: many, participantRows: [], viewRows: [] });
    const r = await fetchAssistantThreadMessageLookup(s, "p1", {
      queryText: "Did they email us about this project?",
      weddingIdEffective: "w-1",
      personIdEffective: null,
      operatorQueryEntityResolution: emptyEntity,
    });
    expect(r.didRun).toBe(true);
    expect(r.threads.length).toBe(8);
    expect(r.threads[0]!.weddingId).toBe("w-1");
    expect(r.selectionNote).toContain("wedding_id");
  });

  it("resolves threads via thread_participants for person-scoped email questions", async () => {
    const s = makeSupabase({
      threadRows: [sampleThread("ta", "w-1")],
      participantRows: [{ thread_id: "ta" }],
      viewRows: [],
    });
    const r = await fetchAssistantThreadMessageLookup(s, "p1", {
      queryText: "When did we last email the client?",
      weddingIdEffective: null,
      personIdEffective: "per-1",
      operatorQueryEntityResolution: emptyEntity,
    });
    expect(r.threads.length).toBe(1);
    expect(r.threads[0]!.threadId).toBe("ta");
  });

  it("uses bounded title search when there is intent, no project/person id, and a topic token (e.g. campaign name)", async () => {
    const s = makeSupabase({
      threadRows: [sampleThread("sk", null)],
      participantRows: [],
      viewRows: [],
    });
    const r = await fetchAssistantThreadMessageLookup(s, "p1", {
      queryText: "What about the skincare campaign email thread?",
      weddingIdEffective: null,
      personIdEffective: null,
      operatorQueryEntityResolution: emptyEntity,
    });
    expect(r.didRun).toBe(true);
    expect(r.threads.length).toBe(1);
    expect(r.selectionNote).toMatch(/title|inbox_scored/);
  });

  it("inbox scoring ranks sender + topic match (skincare / Miki-style)", async () => {
    const inboxThread = {
      id: "th-skincare",
      title: "Brand shoot inquiry for skincare campaign",
      wedding_id: null,
      channel: "email",
      kind: "client",
      last_activity_at: "2026-04-22T14:00:00.000Z",
      last_inbound_at: "2026-04-22T13:00:00.000Z",
      last_outbound_at: null,
    };
    const s = makeSupabase({
      threadRows: [],
      threadHydrateRows: [inboxThread],
      participantRows: [],
      viewRows: [
        {
          id: "th-skincare",
          title: "Brand shoot inquiry for skincare campaign",
          wedding_id: null,
          last_activity_at: "2026-04-22T14:00:00.000Z",
          kind: "client",
          latest_sender: "Miki Zmajce <miki@brand.test>",
          latest_body: "We are looking for a photographer for our skincare launch.",
        },
      ],
    });
    const r = await fetchAssistantThreadMessageLookup(s, "p1", {
      queryText:
        "I got a phone call today from Miki Zmajce about a skincare brand shoot — did they send an email too?",
      weddingIdEffective: null,
      personIdEffective: null,
      operatorQueryEntityResolution: emptyEntity,
      now: new Date("2026-04-22T16:00:00.000Z"),
    });
    expect(r.didRun).toBe(true);
    expect(r.threads.some((t) => t.threadId === "th-skincare")).toBe(true);
    expect(r.selectionNote).toContain("inbox_scored");
    expect(r.threads[0]!.threadId).toBe("th-skincare");
  });

  it("prefers scored inbox thread ahead of weaker wedding-scoped rows when topic + recency match", async () => {
    const wrongWeddingThread = sampleThread("th-wrong", "w-other");
    wrongWeddingThread.last_activity_at = "2026-04-22T15:00:00.000Z";
    const inboxThread = {
      id: "th-skincare",
      title: "Brand shoot inquiry for skincare campaign",
      wedding_id: null,
      channel: "email",
      kind: "client",
      last_activity_at: "2026-04-22T14:00:00.000Z",
      last_inbound_at: "2026-04-22T13:00:00.000Z",
      last_outbound_at: null,
    };
    const s = makeSupabase({
      threadRows: [wrongWeddingThread],
      threadHydrateRows: [inboxThread],
      participantRows: [],
      viewRows: [
        {
          id: "th-skincare",
          title: "Brand shoot inquiry for skincare campaign",
          wedding_id: null,
          last_activity_at: "2026-04-22T14:00:00.000Z",
          kind: "client",
          latest_sender: "miki@brand.test",
          latest_body: "Skincare campaign inquiry",
        },
      ],
    });
    const r = await fetchAssistantThreadMessageLookup(s, "p1", {
      queryText: "Did they email today about the skincare inquiry?",
      weddingIdEffective: null,
      personIdEffective: null,
      operatorQueryEntityResolution: {
        ...emptyEntity,
        didRun: true,
        weddingSignal: "unique",
        uniqueWeddingId: "w-other",
        weddingCandidates: [],
        personMatches: [],
        queryResolvedProjectFacts: null,
      },
      now: new Date("2026-04-22T18:00:00.000Z"),
    });
    expect(r.threads[0]!.threadId).toBe("th-skincare");
    expect(r.selectionNote).toContain("inbox_scored_preferred");
  });

  it("returns empty threads with didRun when nothing matches in scope", async () => {
    const s = makeSupabase({ threadRows: [], participantRows: [], viewRows: [] });
    const r = await fetchAssistantThreadMessageLookup(s, "p1", {
      queryText: "Any inbound email on this inquiry?",
      weddingIdEffective: "w-missing",
      personIdEffective: null,
      operatorQueryEntityResolution: emptyEntity,
    });
    expect(r.didRun).toBe(true);
    expect(r.threads).toHaveLength(0);
  });

  it("force:true runs bounded lookup without thread-intent phrasing (operator recovery tools)", async () => {
    const s = makeSupabase({
      threadRows: [sampleThread("t-forced", "w-1")],
      participantRows: [],
      viewRows: [],
    });
    const r = await fetchAssistantThreadMessageLookup(s, "p1", {
      queryText: "x",
      weddingIdEffective: "w-1",
      personIdEffective: null,
      operatorQueryEntityResolution: emptyEntity,
      force: true,
    });
    expect(r.didRun).toBe(true);
    expect(r.threads.length).toBeGreaterThanOrEqual(1);
    expect(r.threads[0]!.threadId).toBe("t-forced");
  });
});
