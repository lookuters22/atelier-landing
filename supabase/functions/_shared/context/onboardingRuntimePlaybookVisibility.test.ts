/**
 * Slice 4 — runtime read path: onboarding-derived rules live in the same table/query
 * as other tenant playbook rules (`fetchActivePlaybookRulesForDecisionContext`).
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchActivePlaybookRulesForDecisionContext } from "./fetchActivePlaybookRulesForDecisionContext.ts";

function mockSupabaseWithPlaybookRows(rows: Array<{ source_type: string; is_active: boolean }>) {
  const resolved = Promise.resolve({ data: rows, error: null });
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              order: () => resolved,
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("fetchActivePlaybookRulesForDecisionContext", () => {
  it("returns onboarding-owned source_type rows alongside other tenant rules (canonical path)", async () => {
    const rows = [
      { source_type: "onboarding_briefing_v1", is_active: true },
      { source_type: "manual_operator", is_active: true },
    ];
    const supabase = mockSupabaseWithPlaybookRows(rows);
    const out = await fetchActivePlaybookRulesForDecisionContext(supabase, "pid");
    expect(out.map((r) => r.source_type).sort()).toEqual(["manual_operator", "onboarding_briefing_v1"]);
  });
});
