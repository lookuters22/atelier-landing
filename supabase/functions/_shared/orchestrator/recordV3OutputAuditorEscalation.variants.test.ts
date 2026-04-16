/**
 * Escalation artifact fields for output-auditor variants (including persona structured-output failure).
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { inngest } from "../inngest.ts";
import { recordV3OutputAuditorEscalation } from "./recordV3OutputAuditorEscalation.ts";

vi.mock("../inngest.ts", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined), setEnvVars: vi.fn() },
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT: "operator/escalation.pending_delivery.v1",
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION: 1,
}));

function buildSupabase(insertRow: Record<string, unknown>) {
  const insertSingle = vi.fn(async () => ({ data: { id: "esc-insert-1" }, error: null }));
  const insertFn = vi.fn((row: Record<string, unknown>) => {
    Object.assign(insertRow, row);
    return { select: () => ({ single: insertSingle }) };
  });
  return {
    from: vi.fn((table: string) => {
      if (table === "escalation_requests") {
        return {
          insert: insertFn,
          update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
        };
      }
      if (table === "threads") {
        return {
          update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("recordV3OutputAuditorEscalation — persona_structured_output variant", () => {
  it("inserts persona failure action_key and reason_code", async () => {
    const captured: Record<string, unknown> = {};
    const supabase = buildSupabase(captured);

    const out = await recordV3OutputAuditorEscalation(supabase, {
      photographerId: "photo-1",
      threadId: "thread-1",
      weddingId: "w-1",
      draftId: "draft-aaaaaaaa-bbbb-cccc-dddddddddddd",
      violations: ["persona_structured_output_failed:Bad control character"],
      variant: "persona_structured_output",
    });

    expect(out?.id).toBe("esc-insert-1");
    expect(captured.action_key).toBe("orchestrator.client.v1.persona_structured_output.v1");
    expect(captured.reason_code).toBe("persona_structured_output_failed");
    const dj = captured.decision_justification as Record<string, unknown>;
    expect(dj.risk_class).toBe("persona_structured_output_integrity");
    expect(dj.evidence_refs).toEqual(["draft:draft-aaaaaaaa-bbbb-cccc-dddddddddddd", "persona:draftPersonaStructuredResponse"]);
    expect(vi.mocked(inngest.send)).toHaveBeenCalled();
  });
});
