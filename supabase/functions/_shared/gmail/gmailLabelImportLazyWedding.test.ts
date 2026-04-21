/**
 * Tests for the lazy batch-wedding creation contract for Gmail label
 * grouped approval.
 *
 * Backstory:
 *   The original `import-candidate-review` edge handler eagerly created an
 *   inquiry-stage wedding for every approved batch — even Promotions /
 *   Newsletter / OTA batches where every candidate ended up suppressed. That
 *   poisoned CRM with phantom inquiries.
 *
 * Fix locked in here:
 *   - `ensureBatchWeddingForGroup` is the single chokepoint where the wedding
 *     gets created. The worker only calls it when a candidate is both not
 *     suppressed and attachment-eligible (positive evidence), so an all-
 *     suppressed or all-ineligible batch never reaches it and no wedding is
 *     created. (Tested at the worker call-site contract: static gate check.)
 *   - When called, it claims the wedding race-safely under
 *     `materialized_wedding_id IS NULL`. Concurrent chunks see the persisted
 *     id and reuse it.
 *   - `state.weddingId` is updated in place so subsequent calls within the
 *     same run short-circuit without hitting the DB.
 *
 * We test the helper in isolation with a hand-rolled Supabase mock (Deno
 * `npm:@supabase/...` types are not resolvable under Vitest, so the worker
 * file itself isn't directly importable — we stub `createGmailLabelImportWedding`
 * with `vi.mock`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./gmailImportMaterialize.ts", () => ({
  createGmailLabelImportWedding: vi.fn(),
}));

import { createGmailLabelImportWedding } from "./gmailImportMaterialize.ts";
import {
  ensureBatchWeddingForGroup,
  type LazyWeddingState,
} from "./gmailLabelImportLazyWedding.ts";

type GroupRow = { materialized_wedding_id: string | null };

type GroupTableMock = {
  current: GroupRow;
  selectCalls: number;
  updateCalls: Array<{ patch: Record<string, unknown> }>;
  /**
   * Optional override: simulate a competing chunk winning the race by
   * mutating `current.materialized_wedding_id` in between the helper's
   * existing-row read and its claim update.
   */
  beforeUpdateHook?: () => void;
};

function makeSupabaseMock(table: GroupTableMock) {
  return {
    from(name: string) {
      if (name !== "gmail_label_import_groups") {
        throw new Error(`unexpected table: ${name}`);
      }
      return {
        select(_cols: string) {
          return {
            eq(_c: string, _v: unknown) {
              return {
                async maybeSingle() {
                  table.selectCalls += 1;
                  return { data: { ...table.current }, error: null };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          table.updateCalls.push({ patch });
          return {
            eq(_c: string, _v: unknown) {
              return {
                is(_c2: string, _v2: unknown) {
                  return {
                    select(_cols: string) {
                      return {
                        async maybeSingle() {
                          if (table.beforeUpdateHook) table.beforeUpdateHook();
                          /**
                           * `materialized_wedding_id IS NULL` predicate: only
                           * succeeds when the row is still empty.
                           */
                          if (table.current.materialized_wedding_id) {
                            return { data: null, error: null };
                          }
                          table.current.materialized_wedding_id = patch.materialized_wedding_id as string;
                          return { data: { ...table.current }, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

const NOW = "2026-04-17T00:00:00.000Z";

beforeEach(() => {
  vi.mocked(createGmailLabelImportWedding).mockReset();
});

describe("ensureBatchWeddingForGroup — lazy creation contract", () => {
  it("returns the cached id and does NOT touch the DB when state already has weddingId", async () => {
    const table: GroupTableMock = {
      current: { materialized_wedding_id: null },
      selectCalls: 0,
      updateCalls: [],
    };
    const supabase = makeSupabaseMock(table);
    const state: LazyWeddingState = { weddingId: "w-cached", labelName: "Promotions" };

    const r = await ensureBatchWeddingForGroup(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "g1",
      "p1",
      state,
      NOW,
    );

    expect("weddingId" in r && r.weddingId).toBe("w-cached");
    expect(table.selectCalls).toBe(0);
    expect(table.updateCalls).toHaveLength(0);
    expect(createGmailLabelImportWedding).not.toHaveBeenCalled();
  });

  it("reuses the persisted wedding id when another chunk already claimed the row", async () => {
    const table: GroupTableMock = {
      current: { materialized_wedding_id: "w-already" },
      selectCalls: 0,
      updateCalls: [],
    };
    const supabase = makeSupabaseMock(table);
    const state: LazyWeddingState = { weddingId: null, labelName: "Promotions" };

    const r = await ensureBatchWeddingForGroup(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "g1",
      "p1",
      state,
      NOW,
    );

    expect("weddingId" in r && r.weddingId).toBe("w-already");
    expect(state.weddingId).toBe("w-already");
    expect(createGmailLabelImportWedding).not.toHaveBeenCalled();
    /** No update path because the row already had a wedding id. */
    expect(table.updateCalls).toHaveLength(0);
  });

  it("creates a wedding and claims the row when both state and group row are empty", async () => {
    const table: GroupTableMock = {
      current: { materialized_wedding_id: null },
      selectCalls: 0,
      updateCalls: [],
    };
    const supabase = makeSupabaseMock(table);
    const state: LazyWeddingState = { weddingId: null, labelName: "Inbox/Booking" };

    vi.mocked(createGmailLabelImportWedding).mockResolvedValueOnce({ weddingId: "w-new" });

    const r = await ensureBatchWeddingForGroup(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "g1",
      "p1",
      state,
      NOW,
    );

    expect("weddingId" in r && r.weddingId).toBe("w-new");
    expect(state.weddingId).toBe("w-new");
    expect(createGmailLabelImportWedding).toHaveBeenCalledTimes(1);
    /**
     * The label name in state flows through to wedding creation —
     * proves the eventual `couple_names` derives from the label, not from a
     * hard-coded fallback.
     */
    expect(vi.mocked(createGmailLabelImportWedding).mock.calls[0]?.[1]?.labelName).toBe("Inbox/Booking");

    expect(table.updateCalls).toHaveLength(1);
    expect(table.updateCalls[0]?.patch.materialized_wedding_id).toBe("w-new");
  });

  it("falls back to a default label name when state.labelName is null", async () => {
    const table: GroupTableMock = {
      current: { materialized_wedding_id: null },
      selectCalls: 0,
      updateCalls: [],
    };
    const supabase = makeSupabaseMock(table);
    const state: LazyWeddingState = { weddingId: null, labelName: null };

    vi.mocked(createGmailLabelImportWedding).mockResolvedValueOnce({ weddingId: "w-fallback" });

    await ensureBatchWeddingForGroup(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "g1",
      "p1",
      state,
      NOW,
    );

    expect(vi.mocked(createGmailLabelImportWedding).mock.calls[0]?.[1]?.labelName).toBe("Gmail label");
  });

  it("loses the claim race gracefully and reuses the winner's wedding id", async () => {
    const table: GroupTableMock = {
      current: { materialized_wedding_id: null },
      selectCalls: 0,
      updateCalls: [],
      /**
       * Simulate another chunk completing its claim between our
       * existing-row read and our update attempt.
       */
      beforeUpdateHook: () => {
        table.current.materialized_wedding_id = "w-winner";
      },
    };
    const supabase = makeSupabaseMock(table);
    const state: LazyWeddingState = { weddingId: null, labelName: "Promotions" };

    /**
     * We still create our own wedding row first (insert), then discover the
     * race was lost. The orphan wedding id is intentionally left dangling —
     * an acceptable trade-off for race-safety; the row is empty and not
     * surfaced anywhere because nothing links to it.
     */
    vi.mocked(createGmailLabelImportWedding).mockResolvedValueOnce({ weddingId: "w-orphan" });

    const r = await ensureBatchWeddingForGroup(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "g1",
      "p1",
      state,
      NOW,
    );

    expect("weddingId" in r && r.weddingId).toBe("w-winner");
    expect(state.weddingId).toBe("w-winner");
  });

  it("propagates createGmailLabelImportWedding errors as { error }", async () => {
    const table: GroupTableMock = {
      current: { materialized_wedding_id: null },
      selectCalls: 0,
      updateCalls: [],
    };
    const supabase = makeSupabaseMock(table);
    const state: LazyWeddingState = { weddingId: null, labelName: "Promotions" };

    vi.mocked(createGmailLabelImportWedding).mockResolvedValueOnce({ error: "wedding_insert_failed" });

    const r = await ensureBatchWeddingForGroup(
      // deno-lint-ignore no-explicit-any
      supabase as any,
      "g1",
      "p1",
      state,
      NOW,
    );
    expect("error" in r && r.error).toBe("wedding_insert_failed");
    expect(state.weddingId).toBeNull();
    expect(table.updateCalls).toHaveLength(0);
  });
});

/**
 * Worker-level contract test: the worker only calls
 * `ensureBatchWeddingForGroup` when a non-suppressed candidate is met. This
 * is enforced by reading the source file as text and asserting the gate is
 * present. This is intentionally a lightweight static check — the full
 * worker is not importable under Vitest because of `npm:inngest` resolution.
 */
describe("processChunk — call-site gate for lazy wedding creation", () => {
  it("only invokes ensureBatchWeddingForGroup behind suppression + attachment-eligibility + lazy-wedding gates", async () => {
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
     * Lock in the textual gate around the lazy creation call. Any future
     * refactor that drops the suppression or attachment-eligibility check
     * will fail this assertion, preventing CRM pollution from regressing.
     */
    expect(src).toMatch(
      /if\s*\(\s*!suppressed\s*&&\s*attachmentEligible\s*&&\s*!lazyWedding\.weddingId\s*\)\s*\{[\s\S]*?ensureBatchWeddingForGroup\s*\(/,
    );
    /**
     * Defensive: there must be exactly one call to ensureBatchWeddingForGroup
     * in the worker — if a second un-gated call appears, this fails.
     */
    const callCount = (src.match(/ensureBatchWeddingForGroup\s*\(/g) ?? []).length;
    expect(callCount).toBe(1);
  });

  it("merges DB anchors with a chunk overlay and passes them into materializeGmailImportCandidate", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(
        process.cwd(),
        "supabase/functions/inngest/functions/processGmailLabelGroupApproval.ts",
      ),
      "utf-8",
    );
    expect(src).toMatch(/loadAnchorEmailsForGroupedImportWedding\s*\(/);
    expect(src).toMatch(/groupedAttachmentAnchorEmails/);
    expect(src).toMatch(
      /threadWeddingId:\s*[\s\S]*?attachmentEligible\s*\?/,
    );
  });
});
