/**
 * Regression tests for the lazy grouped Gmail-import wedding-link backpatch.
 *
 * What this test file locks:
 *   1. The TS wrapper now routes through ONE atomic RPC call
 *      (`backpatch_lazy_grouped_import_wedding_link`) — no more two separate
 *      `.update(...)` writes. This is the atomicity guarantee the previous
 *      design lacked.
 *   2. Pure-merge contract is preserved (mirror of the SQL function's
 *      jsonb merge):
 *        - missing `materialized_wedding_id` is added,
 *        - missing `gmail_label_import_group_id` is added,
 *        - existing differing values are NEVER overwritten (forensics),
 *        - all other keys (including `suppression`) are preserved.
 *   3. RPC-side failure surfaces as a single `lazy_backpatch_rpc_failed:*`
 *      error string. There is no path where a partial write could be
 *      committed by the helper itself; the SQL transaction handles the
 *      atomicity.
 *   4. Worker call-site invariants: only the `!suppressed &&
 *      !lazyWedding.weddingId && result.finalizedCore` branch invokes the
 *      helper, and there is exactly ONE call site.
 *   5. The migration file actually creates an atomic SQL function with
 *      `FOR UPDATE` row locks and a single non-divisible UPDATE pair.
 */
import { describe, expect, it } from "vitest";

import {
  backpatchLazyGroupedImportWeddingLink,
  mergeLazyWeddingProvenance,
} from "./backpatchLazyGroupedImportWeddingLink.ts";

// ---------------------------------------------------------------------------
// Pure merge — locks the contract that is mirrored on the SQL side.
// ---------------------------------------------------------------------------
describe("mergeLazyWeddingProvenance — pure merge (mirror of SQL contract)", () => {
  it("adds materialized_wedding_id and gmail_label_import_group_id when both missing", () => {
    const out = mergeLazyWeddingProvenance(
      {
        source: "gmail_label_import",
        gmail_thread_id: "gt-1",
        materialized_at: "2026-04-17T00:00:00.000Z",
      },
      "wed-1",
      "grp-1",
    );
    expect(out).toEqual({
      source: "gmail_label_import",
      gmail_thread_id: "gt-1",
      materialized_at: "2026-04-17T00:00:00.000Z",
      materialized_wedding_id: "wed-1",
      gmail_label_import_group_id: "grp-1",
    });
  });

  it("preserves all existing keys including arbitrary nested objects", () => {
    const out = mergeLazyWeddingProvenance(
      {
        source: "gmail_label_import",
        gmail_thread_id: "gt-1",
        gmail_label_import_group_id: "grp-1",
        connected_account_id: "ca-1",
        custom_extension: { tag: "keep-me", level: 7 },
      },
      "wed-1",
      "grp-1",
    );
    expect(out.connected_account_id).toBe("ca-1");
    expect(out.custom_extension).toEqual({ tag: "keep-me", level: 7 });
    expect(out.materialized_wedding_id).toBe("wed-1");
  });

  it("does not overwrite a pre-existing different materialized_wedding_id (forensics)", () => {
    const out = mergeLazyWeddingProvenance(
      { materialized_wedding_id: "wed-original" },
      "wed-different-late-arrival",
      "grp-1",
    );
    expect(out.materialized_wedding_id).toBe("wed-original");
    expect(out.gmail_label_import_group_id).toBe("grp-1");
  });

  it("does not overwrite a pre-existing different gmail_label_import_group_id", () => {
    const out = mergeLazyWeddingProvenance(
      { gmail_label_import_group_id: "grp-original" },
      "wed-1",
      "grp-different",
    );
    expect(out.gmail_label_import_group_id).toBe("grp-original");
    expect(out.materialized_wedding_id).toBe("wed-1");
  });

  it("treats null / non-object input as an empty base", () => {
    expect(mergeLazyWeddingProvenance(null, "wed-1", "grp-1")).toEqual({
      materialized_wedding_id: "wed-1",
      gmail_label_import_group_id: "grp-1",
    });
    expect(mergeLazyWeddingProvenance(undefined, "wed-1", "grp-1")).toEqual({
      materialized_wedding_id: "wed-1",
      gmail_label_import_group_id: "grp-1",
    });
    expect(
      mergeLazyWeddingProvenance(
        // deno-lint-ignore no-explicit-any
        ["bad", "value"] as any,
        "wed-1",
        "grp-1",
      ),
    ).toEqual({
      materialized_wedding_id: "wed-1",
      gmail_label_import_group_id: "grp-1",
    });
  });

  it("preserves an existing suppression block exactly", () => {
    const supp = {
      verdict: "promotional_or_marketing",
      reasons: ["sender_domain_ota_or_marketplace"],
      confidence: "high",
      at: "2026-04-17T00:00:00.000Z",
      origin: "gmail_import_materialize",
      original_grouped_wedding_id: null,
    };
    const out = mergeLazyWeddingProvenance(
      { source: "gmail_label_import", suppression: supp },
      "wed-1",
      "grp-1",
    );
    expect(out.suppression).toEqual(supp);
    expect(out.materialized_wedding_id).toBe("wed-1");
  });
});

// ---------------------------------------------------------------------------
// TS wrapper — proves the helper is now a thin RPC call (no two-step write).
// ---------------------------------------------------------------------------
type RpcCall = { name: string; args: Record<string, unknown> };

function makeSupabaseRpcMock(opts: {
  rpcError?: { message: string } | null;
  /** Records every `.from(...).update(...)` mutation; must be empty. */
  mutationsObserver?: string[];
}) {
  const calls: RpcCall[] = [];
  return {
    calls,
    supabase: {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        if (opts.rpcError) {
          return { data: null, error: opts.rpcError };
        }
        return { data: null, error: null };
      },
      /**
       * Trip wire: the helper must not perform any direct table writes.
       * If a future refactor accidentally re-introduces the non-atomic
       * `.from('threads').update(...)` path, this proxy records the call
       * and the assertion below fails.
       */
      from(name: string) {
        opts.mutationsObserver?.push(name);
        return {
          update() {
            opts.mutationsObserver?.push(`update:${name}`);
            return {
              eq() {
                return {
                  async eq() {
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

describe("backpatchLazyGroupedImportWeddingLink — atomic RPC wrapper", () => {
  it("calls the atomic SQL RPC exactly once with the expected argument shape", async () => {
    const mutationsObserver: string[] = [];
    const { supabase, calls } = makeSupabaseRpcMock({ mutationsObserver });

    const r = await backpatchLazyGroupedImportWeddingLink({
      // deno-lint-ignore no-explicit-any
      supabaseAdmin: supabase as any,
      photographerId: "p-1",
      threadId: "t-1",
      importCandidateId: "ic-1",
      groupId: "grp-1",
      weddingId: "wed-1",
    });

    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("backpatch_lazy_grouped_import_wedding_link");
    expect(calls[0]?.args).toEqual({
      p_photographer_id: "p-1",
      p_thread_id: "t-1",
      p_import_candidate_id: "ic-1",
      p_gmail_label_import_group_id: "grp-1",
      p_wedding_id: "wed-1",
    });

    /**
     * The atomicity guarantee: the helper MUST NOT perform direct
     * table writes (the old non-atomic two-update path). Any
     * `.from('threads').update(...)` or
     * `.from('import_candidates').update(...)` from inside the helper
     * would show up here.
     */
    expect(mutationsObserver).toEqual([]);
  });

  it("surfaces RPC failure as a single lazy_backpatch_rpc_failed:* error and writes nothing", async () => {
    const mutationsObserver: string[] = [];
    const { supabase, calls } = makeSupabaseRpcMock({
      rpcError: { message: "thread_not_found" },
      mutationsObserver,
    });

    const r = await backpatchLazyGroupedImportWeddingLink({
      // deno-lint-ignore no-explicit-any
      supabaseAdmin: supabase as any,
      photographerId: "p-1",
      threadId: "t-1",
      importCandidateId: "ic-1",
      groupId: "grp-1",
      weddingId: "wed-1",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("lazy_backpatch_rpc_failed:thread_not_found");
    }
    expect(calls).toHaveLength(1);
    /** No direct writes attempted on the TS side either. */
    expect(mutationsObserver).toEqual([]);
  });

  it("surfaces an identity-mismatch RPC error cleanly (candidate/thread/group mismatch)", async () => {
    /**
     * The SQL RPC raises
     * `candidate_not_linked_to_expected_thread_or_group` when the
     * candidate exists for the photographer but its
     * `materialized_thread_id` or `gmail_label_import_group_id` does not
     * match the args. The wrapper must surface that exact message under
     * the `lazy_backpatch_rpc_failed:` prefix so observability can route
     * it as an identity-integrity event rather than a generic failure.
     */
    const mutationsObserver: string[] = [];
    const { supabase, calls } = makeSupabaseRpcMock({
      rpcError: {
        message:
          "backpatch_lazy_grouped_import_wedding_link: candidate_not_linked_to_expected_thread_or_group",
      },
      mutationsObserver,
    });

    const r = await backpatchLazyGroupedImportWeddingLink({
      // deno-lint-ignore no-explicit-any
      supabaseAdmin: supabase as any,
      photographerId: "p-1",
      threadId: "t-1",
      importCandidateId: "ic-mismatched",
      groupId: "grp-1",
      weddingId: "wed-1",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe(
        "lazy_backpatch_rpc_failed:backpatch_lazy_grouped_import_wedding_link: candidate_not_linked_to_expected_thread_or_group",
      );
      expect(r.error).toContain("candidate_not_linked_to_expected_thread_or_group");
    }
    expect(calls).toHaveLength(1);
    expect(mutationsObserver).toEqual([]);
  });

  it("rejects missing required args without hitting the RPC", async () => {
    const mutationsObserver: string[] = [];
    const { supabase, calls } = makeSupabaseRpcMock({ mutationsObserver });

    const r = await backpatchLazyGroupedImportWeddingLink({
      // deno-lint-ignore no-explicit-any
      supabaseAdmin: supabase as any,
      photographerId: "",
      threadId: "t-1",
      importCandidateId: "ic-1",
      groupId: "grp-1",
      weddingId: "wed-1",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("lazy_backpatch_invalid_args");
    }
    expect(calls).toHaveLength(0);
    expect(mutationsObserver).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Worker call-site — text inspection (worker is not importable under Vitest
// because of npm:inngest@3 resolution).
// ---------------------------------------------------------------------------
describe("processGmailLabelGroupApproval worker — call-site invariants", () => {
  it("only calls backpatchLazyGroupedImportWeddingLink behind attachmentEligible + lazy + finalizedCore gate", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(
        process.cwd(),
        "supabase/functions/inngest/functions/processGmailLabelGroupApproval.ts",
      ),
      "utf-8",
    );

    /**
     * The lazy gate must wrap the helper invocation: `!suppressed &&
     * attachmentEligible && !lazyWedding.weddingId` then `result.finalizedCore`.
     * If a future refactor pulls the call out of the gate, the regex stops matching.
     */
    expect(src).toMatch(
      /if\s*\(\s*!suppressed\s*&&\s*attachmentEligible\s*&&\s*!lazyWedding\.weddingId\s*\)\s*\{[\s\S]*?if\s*\(\s*result\.finalizedCore\s*\)\s*\{[\s\S]*?backpatchLazyGroupedImportWeddingLink\s*\(/,
    );

    /**
     * Defensive: there must be exactly ONE call to the helper outside of
     * import lines. A second call site would risk overwriting suppression
     * state.
     */
    const stripped = src.replace(/import\s*\{[\s\S]*?\}\s*from[^;]+;/g, "");
    const callCountStripped = (stripped.match(/backpatchLazyGroupedImportWeddingLink\s*\(/g) ?? []).length;
    expect(callCountStripped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Migration shape — confirms the SQL function actually performs an atomic,
// row-locked, single-transaction merge + double UPDATE. We do not run the
// function (no DB harness here) but we lock its structural invariants so a
// future migration cannot silently weaken atomicity.
// ---------------------------------------------------------------------------
describe("backpatch_lazy_grouped_import_wedding_link migration — atomicity invariants", () => {
  it("creates the SQL function with FOR UPDATE row locks and a single transactional body", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const sql = await fs.readFile(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260508000000_backpatch_lazy_grouped_import_wedding_link_rpc.sql",
      ),
      "utf-8",
    );

    /** Function declared with the right name and signature. */
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.backpatch_lazy_grouped_import_wedding_link\s*\(/,
    );
    expect(sql).toMatch(/p_photographer_id uuid/);
    expect(sql).toMatch(/p_thread_id uuid/);
    expect(sql).toMatch(/p_import_candidate_id uuid/);
    expect(sql).toMatch(/p_gmail_label_import_group_id uuid/);
    expect(sql).toMatch(/p_wedding_id uuid/);

    /**
     * Atomicity invariants:
     *   - Both reads use FOR UPDATE row locks (so a concurrent run cannot
     *     race-mutate the same JSON between read and write).
     *   - Both UPDATEs are present in the same plpgsql body (single txn).
     *   - Body is `LANGUAGE plpgsql` with `SECURITY DEFINER` for tenant
     *     guard centralization.
     */
    const forUpdateMatches = sql.match(/FOR UPDATE/g) ?? [];
    expect(forUpdateMatches.length).toBeGreaterThanOrEqual(2);

    const updateThread = /UPDATE public\.threads[\s\S]*?wedding_id\s*=\s*p_wedding_id[\s\S]*?ai_routing_metadata\s*=\s*v_thread_meta/;
    const updateCandidate = /UPDATE public\.import_candidates[\s\S]*?import_provenance\s*=\s*v_cand_prov/;
    expect(sql).toMatch(updateThread);
    expect(sql).toMatch(updateCandidate);

    expect(sql).toMatch(/LANGUAGE plpgsql/);
    expect(sql).toMatch(/SECURITY DEFINER/);

    /**
     * Non-clobbering merge: each surface's `materialized_wedding_id` and
     * `gmail_label_import_group_id` is gated on the field being NULL or
     * empty before being set.
     */
    const guardedSet = sql.match(
      /IF v_existing_wedding IS NULL OR length\(v_existing_wedding\) = 0 THEN[\s\S]*?jsonb_set\([\s\S]*?'\{materialized_wedding_id\}'/g,
    ) ?? [];
    expect(guardedSet.length).toBeGreaterThanOrEqual(2);

    const guardedGroup = sql.match(
      /IF v_existing_group IS NULL OR length\(v_existing_group\) = 0 THEN[\s\S]*?jsonb_set\([\s\S]*?'\{gmail_label_import_group_id\}'/g,
    ) ?? [];
    expect(guardedGroup.length).toBeGreaterThanOrEqual(2);

    /** Service-role-only execution (no public access). */
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.backpatch_lazy_grouped_import_wedding_link/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.backpatch_lazy_grouped_import_wedding_link[\s\S]*?TO service_role/);
  });

  it("contains no two-step partial-write fallback (no .update outside the atomic body)", async () => {
    /**
     * Sanity: the migration introduces the function only — it must not
     * sneak in a fallback that does a non-atomic separate write. We assert
     * that the only UPDATE statements live INSIDE the function body
     * between BEGIN and END.
     */
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const sql = await fs.readFile(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260508000000_backpatch_lazy_grouped_import_wedding_link_rpc.sql",
      ),
      "utf-8",
    );

    const bodyStart = sql.indexOf("AS $$");
    const bodyEnd = sql.indexOf("$$;", bodyStart);
    expect(bodyStart).toBeGreaterThan(0);
    expect(bodyEnd).toBeGreaterThan(bodyStart);

    /**
     * Strip SQL comments before/after the body so prose words like
     * "Edge updates" in the file header don't confuse the regex. We're
     * specifically guarding against an actual SQL `UPDATE public.X` /
     * `UPDATE X SET` statement living outside the atomic function body.
     */
    const stripSqlComments = (s: string): string =>
      s
        .replace(/--[^\n]*\n/g, "\n")
        .replace(/\/\*[\s\S]*?\*\//g, " ");
    const before = stripSqlComments(sql.slice(0, bodyStart));
    const after = stripSqlComments(sql.slice(bodyEnd + 3));

    expect(before).not.toMatch(/\bUPDATE\s+(public\.|"?[a-z_][a-z0-9_]*"?\s+SET\b)/i);
    expect(after).not.toMatch(/\bUPDATE\s+(public\.|"?[a-z_][a-z0-9_]*"?\s+SET\b)/i);
  });

  // -------------------------------------------------------------------------
  // Identity invariants — the RPC is now authoritative about row identity,
  // not just atomicity. A same-tenant but mismatched candidate/thread/group
  // triple MUST be rejected. We lock the SQL structure that enforces this.
  // -------------------------------------------------------------------------
  it("locks the candidate row only when materialized_thread_id AND gmail_label_import_group_id match", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const sql = await fs.readFile(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260508000000_backpatch_lazy_grouped_import_wedding_link_rpc.sql",
      ),
      "utf-8",
    );

    /**
     * The candidate `SELECT ... FOR UPDATE` must require all four
     * columns: the candidate id, the photographer (tenant), the
     * materialized thread linkage, AND the import-group linkage. If any
     * of those four is dropped from the predicate, the lock is too
     * permissive and a mismatched triple could be backpatched.
     */
    const candidateSelectLock =
      /SELECT\s+ic\.import_provenance[\s\S]*?FROM\s+public\.import_candidates\s+ic[\s\S]*?WHERE\s+ic\.id\s*=\s*p_import_candidate_id[\s\S]*?AND\s+ic\.photographer_id\s*=\s*p_photographer_id[\s\S]*?AND\s+ic\.materialized_thread_id\s*=\s*p_thread_id[\s\S]*?AND\s+ic\.gmail_label_import_group_id\s*=\s*p_gmail_label_import_group_id[\s\S]*?FOR UPDATE/;
    expect(sql).toMatch(candidateSelectLock);

    /**
     * The candidate UPDATE predicate must mirror the lock predicate
     * (defense in depth). If a future refactor widens the UPDATE back to
     * `id + photographer_id` only, this assertion fails.
     */
    const candidateUpdateGuarded =
      /UPDATE\s+public\.import_candidates\s+ic[\s\S]*?WHERE\s+ic\.id\s*=\s*p_import_candidate_id[\s\S]*?AND\s+ic\.photographer_id\s*=\s*p_photographer_id[\s\S]*?AND\s+ic\.materialized_thread_id\s*=\s*p_thread_id[\s\S]*?AND\s+ic\.gmail_label_import_group_id\s*=\s*p_gmail_label_import_group_id/;
    expect(sql).toMatch(candidateUpdateGuarded);

    /**
     * Both the lock + the UPDATE must include the strict identity
     * predicate. There must be NO surviving candidate-touching SELECT
     * or UPDATE that is gated only on `id + photographer_id` without
     * also requiring `materialized_thread_id = p_thread_id` AND
     * `gmail_label_import_group_id = p_gmail_label_import_group_id`.
     *
     * We deliberately scan every SELECT/UPDATE statement that targets
     * `public.import_candidates ic` (NOT `PERFORM` — the PERFORM probe
     * after the strict lock is intentional and only needs id +
     * photographer_id to disambiguate "row missing" from "row exists
     * but wrong link"). Each such statement must carry the strict
     * identity predicate.
     */
    const candidateStatementRegex =
      /(SELECT\s+ic\.[\s\S]*?FROM\s+public\.import_candidates\s+ic[\s\S]*?FOR UPDATE\s*;|UPDATE\s+public\.import_candidates\s+ic[\s\S]*?;)/g;
    const candidateStatements = Array.from(sql.matchAll(candidateStatementRegex)).map((m) => m[0]);

    /** At minimum: the strict SELECT lock + the strict UPDATE write. */
    expect(candidateStatements.length).toBeGreaterThanOrEqual(2);

    for (const stmt of candidateStatements) {
      expect(stmt).toMatch(/ic\.id\s*=\s*p_import_candidate_id/);
      expect(stmt).toMatch(/ic\.photographer_id\s*=\s*p_photographer_id/);
      expect(stmt).toMatch(/ic\.materialized_thread_id\s*=\s*p_thread_id/);
      expect(stmt).toMatch(/ic\.gmail_label_import_group_id\s*=\s*p_gmail_label_import_group_id/);
    }
  });

  it("raises a specific identity-mismatch exception, not a generic candidate_not_found", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const sql = await fs.readFile(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20260508000000_backpatch_lazy_grouped_import_wedding_link_rpc.sql",
      ),
      "utf-8",
    );

    /**
     * A specific failure code for the mismatch path is required so the
     * observability layer can distinguish "row really missing" from "row
     * exists but linked to a different thread/group". A combined error
     * blob would erase that signal.
     */
    expect(sql).toMatch(
      /RAISE EXCEPTION\s+'backpatch_lazy_grouped_import_wedding_link:\s*candidate_not_linked_to_expected_thread_or_group'/,
    );

    /** Genuine missing-row path is preserved as a distinct error. */
    expect(sql).toMatch(
      /RAISE EXCEPTION\s+'backpatch_lazy_grouped_import_wedding_link:\s*candidate_not_found'/,
    );

    /**
     * The strict-vs-genuine split is implemented by a fallback existence
     * probe (PERFORM 1 ... import_candidates ... id + photographer_id)
     * AFTER the strict lock fails to find a row. This is what lets the
     * function distinguish the two failure modes without ever locking
     * a wrong-linkage row.
     */
    expect(sql).toMatch(
      /PERFORM\s+1[\s\S]*?FROM\s+public\.import_candidates\s+ic[\s\S]*?WHERE\s+ic\.id\s*=\s*p_import_candidate_id[\s\S]*?AND\s+ic\.photographer_id\s*=\s*p_photographer_id/,
    );
  });
});
