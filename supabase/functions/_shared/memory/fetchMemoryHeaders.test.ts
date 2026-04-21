import { describe, expect, it } from "vitest";
import {
  fetchMemoryHeaders,
  replyModeMemoriesOrFilter,
  unscopedReplyModeMemoriesOrFilter,
} from "./fetchMemoryHeaders.ts";

describe("replyModeMemoriesOrFilter", () => {
  it("restricts project rows to the current wedding_id and ORs studio rows", () => {
    const wid = "11111111-1111-1111-1111-111111111111";
    expect(replyModeMemoriesOrFilter(wid)).toBe(
      `and(scope.eq.project,wedding_id.eq.${wid}),scope.eq.studio`,
    );
  });

  it("adds person scope for listed participant ids", () => {
    const wid = "11111111-1111-1111-1111-111111111111";
    const p1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const p2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    expect(replyModeMemoriesOrFilter(wid, [p2, p1])).toBe(
      `and(scope.eq.project,wedding_id.eq.${wid}),scope.eq.studio,and(scope.eq.person,person_id.in.(${p1},${p2}))`,
    );
  });
});

describe("unscopedReplyModeMemoriesOrFilter", () => {
  it("ORs person, project, and studio for listed ids", () => {
    const p1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(unscopedReplyModeMemoriesOrFilter([p1])).toBe(
      `and(scope.eq.person,person_id.in.(${p1})),scope.eq.project,scope.eq.studio`,
    );
  });
});

describe("fetchMemoryHeaders query shape", () => {
  it("with wedding + no participants: archived, neq person omitted; or project+studio only", async () => {
    const calls: string[] = [];
    const builder: Record<string, unknown> = {};
    builder.from = () => {
      calls.push("from");
      return builder;
    };
    builder.select = () => {
      calls.push("select");
      return builder;
    };
    builder.eq = () => builder;
    builder.is = (col: string, val: unknown) => {
      calls.push(`is:${col}:${String(val)}`);
      return builder;
    };
    builder.or = (expr: string) => {
      calls.push(`or:${expr}`);
      return builder;
    };
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null });

    await fetchMemoryHeaders({ from: () => builder } as never, "photo-1", "wedding-a", {
      replyModeParticipantPersonIds: [],
    });

    expect(calls).toContain("is:archived_at:null");
    const hasProjectWeddingOr = calls.some((c) =>
      c.startsWith("or:and(scope.eq.project,wedding_id.eq."),
    );
    expect(hasProjectWeddingOr).toBe(true);
    expect(calls.some((c) => c.includes("scope.eq.person"))).toBe(false);
  });

  it("with wedding + participants: or includes person_id.in", async () => {
    const calls: string[] = [];
    const builder: Record<string, unknown> = {};
    builder.from = () => builder;
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.is = () => builder;
    builder.or = (expr: string) => {
      calls.push(`or:${expr}`);
      return builder;
    };
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null });

    const pid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await fetchMemoryHeaders({ from: () => builder } as never, "photo-1", "wedding-a", {
      replyModeParticipantPersonIds: [pid],
    });

    expect(calls.some((c) => c.includes("person_id.in"))).toBe(true);
    expect(calls.some((c) => c.includes("scope.eq.person"))).toBe(true);
  });

  it("without wedding + participants: unscoped or", async () => {
    const calls: string[] = [];
    const builder: Record<string, unknown> = {};
    builder.from = () => builder;
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.is = () => builder;
    builder.or = (expr: string) => {
      calls.push(`or:${expr}`);
      return builder;
    };
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null });

    const pid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await fetchMemoryHeaders({ from: () => builder } as never, "photo-1", null, {
      replyModeParticipantPersonIds: [pid],
    });

    expect(calls.some((c) => c.includes("scope.eq.person"))).toBe(true);
  });

  it("without wedding + no participants: neq person", async () => {
    const calls: string[] = [];
    const builder: Record<string, unknown> = {};
    builder.from = () => builder;
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.is = () => builder;
    builder.neq = (col: string, val: string) => {
      calls.push(`neq:${col}:${val}`);
      return builder;
    };
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: [], error: null });

    await fetchMemoryHeaders({ from: () => builder } as never, "photo-1", null);

    expect(calls).toContain("neq:scope:person");
  });
});
