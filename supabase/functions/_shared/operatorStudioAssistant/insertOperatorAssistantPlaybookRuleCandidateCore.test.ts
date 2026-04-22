import { describe, expect, it, vi } from "vitest";
import { insertPlaybookRuleCandidateForOperatorAssistant } from "./insertOperatorAssistantPlaybookRuleCandidateCore.ts";

describe("insertPlaybookRuleCandidateForOperatorAssistant", () => {
  it("inserts into playbook_rule_candidates with service client (not playbook_rules)", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      expect(table).toBe("playbook_rule_candidates");
      return {
        insert: (row: { proposed_action_key?: string }) => {
          expect((row as { proposed_action_key: string }).proposed_action_key).toBe("key_a");
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "cand-1" },
                  error: null,
                }),
            }),
          };
        },
      };
    });

    const supabase = { from: fromMock } as never;

    const out = await insertPlaybookRuleCandidateForOperatorAssistant(supabase, "photo-1", {
      proposedActionKey: "key_a",
      topic: "T",
      proposedInstruction: "I",
      proposedDecisionMode: "forbidden",
      proposedScope: "global",
      proposedChannel: null,
      weddingId: null,
    });

    expect(out.id).toBe("cand-1");
  });

  it("verifies wedding ownership before insert when weddingId is set", async () => {
    const order: string[] = [];
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "weddings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  order.push("weddings");
                  return Promise.resolve({ data: { id: "w1" }, error: null });
                },
              }),
            }),
          }),
        };
      }
      if (table === "playbook_rule_candidates") {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                order.push("candidates");
                return Promise.resolve({ data: { id: "c2" }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    await insertPlaybookRuleCandidateForOperatorAssistant(supabase, "photo-1", {
      proposedActionKey: "k",
      topic: "T",
      proposedInstruction: "I",
      proposedDecisionMode: "auto",
      proposedScope: "global",
      proposedChannel: null,
      weddingId: "w1",
    });
    expect(order).toEqual(["weddings", "candidates"]);
  });
});
