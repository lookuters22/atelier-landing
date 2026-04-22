import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchAssistantStudioAnalysisSnapshot } from "./fetchAssistantStudioAnalysisSnapshot.ts";

describe("fetchAssistantStudioAnalysisSnapshot (Slice 12)", () => {
  it("builds tenant aggregates, stage mix, and head counts (mocked Supabase)", async () => {
    const weddingRows = [
      {
        id: "a1",
        couple_names: "A & B",
        stage: "inquiry",
        wedding_date: "2019-06-10",
        event_start_date: null,
        project_type: "wedding",
        package_name: null,
        contract_value: null,
        balance_due: null,
        location: "Local Hall",
      },
      {
        id: "a2",
        couple_names: "C & D",
        stage: "booked",
        wedding_date: "2019-08-20",
        event_start_date: null,
        project_type: "wedding",
        package_name: "Signature",
        contract_value: 5000,
        balance_due: 500,
        location: "",
      },
    ];

    const supabase = {
      from: (table: string) => {
        if (table === "weddings") {
          const lim = { limit: () => Promise.resolve({ data: weddingRows, error: null }) };
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => lim,
                }),
              }),
            }),
          };
        }
        if (table === "tasks") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: null, count: 2, error: null }),
              }),
            }),
          };
        }
        if (table === "escalation_requests") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: null, count: 1, error: null }),
              }),
            }),
          };
        }
        throw new Error("unexpected " + table);
      },
    } as SupabaseClient;

    const s = await fetchAssistantStudioAnalysisSnapshot(supabase, "photo-1", new Date("2020-01-15T00:00:00.000Z"));
    expect(s.projectCount).toBe(2);
    expect(s.openTasksCount).toBe(2);
    expect(s.openEscalationsCount).toBe(1);
    expect(s.byStage.find((x) => x.stage === "inquiry")?.count).toBe(1);
    expect(s.packageMixBooked).toHaveLength(1);
    expect(s.packageMixBooked[0]!.package_name).toBe("Signature");
    expect(s.contractStats?.avg).toBe(5000);
  });
});
