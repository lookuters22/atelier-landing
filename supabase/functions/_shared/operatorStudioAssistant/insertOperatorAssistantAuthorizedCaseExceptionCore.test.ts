import { describe, expect, it, vi } from "vitest";
import { insertAuthorizedCaseExceptionForOperatorAssistant } from "./insertOperatorAssistantAuthorizedCaseExceptionCore.ts";

describe("insertAuthorizedCaseExceptionForOperatorAssistant", () => {
  it("verifies wedding, resolves target rule id, revokes competing rows, inserts with escalation id null (no playbook_rules writes)", async () => {
    const tables: string[] = [];
    const fromMock = vi.fn().mockImplementation((table: string) => {
      tables.push(table);
      if (table === "weddings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: "w1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "playbook_rules") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: { id: "pr-fetch" }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "authorized_case_exceptions") {
        const afterUpdate: any = {
          eq: () => afterUpdate,
          is: () => Promise.resolve({ error: null }),
          or: () => Promise.resolve({ error: null }),
        };
        return {
          update: () => afterUpdate,
          insert: (row: Record<string, unknown>) => {
            expect(row).toMatchObject({
              status: "active",
              approved_via_escalation_id: null,
            });
            expect(row).not.toHaveProperty("playbook_rule");
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "ace-1", effective_until: "2026-12-31T00:00:00.000Z" },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    const out = await insertAuthorizedCaseExceptionForOperatorAssistant(supabase, "photo-1", {
      overridesActionKey: "travel_fee",
      overridePayload: { decision_mode: "ask_first" },
      weddingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clientThreadId: null,
      targetPlaybookRuleId: null,
      effectiveUntil: null,
      notes: "operator note",
    });

    expect(out.id).toBe("ace-1");
    expect(tables[0]).toBe("weddings");
    expect(tables).toContain("playbook_rules");
    expect(tables.filter((t) => t === "authorized_case_exceptions").length).toBeGreaterThanOrEqual(2);
  });
});
