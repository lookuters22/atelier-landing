import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { OrchestratorProposalCandidate } from "../../../../src/types/decisionContext.types.ts";

vi.mock("../inngest.ts", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT: "operator/escalation.pending",
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION: 1,
}));

import { ORCHESTRATOR_DRAFT_SKIP_NO_DRAFTABLE_CANDIDATE } from "./attemptOrchestratorDraft.ts";
import {
  maybeRecordOrchestratorNoDraftableEscalation,
  ORCHESTRATOR_NO_DRAFTABLE_REASON_CODE,
  summarizeProposalsForNoDraftableEscalation,
} from "./recordOrchestratorNoDraftableEscalation.ts";

function opProposal(p: Partial<OrchestratorProposalCandidate>): OrchestratorProposalCandidate {
  return {
    id: p.id ?? "c1",
    action_family: p.action_family ?? "operator_notification_routing",
    action_key: p.action_key ?? "v3_compliance_review",
    rationale: p.rationale ?? "r",
    verifier_gating_required: p.verifier_gating_required ?? false,
    likely_outcome: p.likely_outcome ?? "draft",
    blockers_or_missing_facts: p.blockers_or_missing_facts ?? [],
  };
}

function buildMockSupabase(opts: { existingNoDraftableOpen?: boolean }): SupabaseClient {
  const filter = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.existingNoDraftableOpen ? { id: "existing" } : null,
      error: null,
    }),
  };
  const esc = {
    select: vi.fn().mockReturnValue(filter),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "ne1" }, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
  const threads = {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "escalation_requests") return esc;
      if (table === "threads") return threads;
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("summarizeProposalsForNoDraftableEscalation", () => {
  it("lists action families and keys", () => {
    const s = summarizeProposalsForNoDraftableEscalation([
      opProposal({ action_family: "operator_notification_routing", action_key: "a" }),
      opProposal({ action_family: "send_message", action_key: "b", likely_outcome: "block" }),
    ]);
    expect(s).toContain("operator_notification_routing:a");
    expect(s).toContain("send_message:b (blocked)");
  });
});

describe("maybeRecordOrchestratorNoDraftableEscalation", () => {
  const baseParams = {
    photographerId: "ph1",
    threadId: "th1",
    weddingId: "w1",
    verifierSuccess: true,
    orchestratorOutcome: "draft" as const,
    draftSkipReason: ORCHESTRATOR_DRAFT_SKIP_NO_DRAFTABLE_CANDIDATE,
    draftCreated: false,
    proposedActions: [opProposal({})],
    rawMessage: "NDA and buyout discussion.",
  };

  it("inserts escalation when no draft, verifier passed, draft/ask outcome, no_draftable skip", async () => {
    const sb = buildMockSupabase({});
    const r = await maybeRecordOrchestratorNoDraftableEscalation(sb, baseParams);
    expect(r).toEqual({ recorded: true, escalationId: "ne1" });
    expect(sb.from).toHaveBeenCalledWith("escalation_requests");
  });

  it("does not duplicate when open escalation with same reason exists", async () => {
    const sb = buildMockSupabase({ existingNoDraftableOpen: true });
    const r = await maybeRecordOrchestratorNoDraftableEscalation(sb, baseParams);
    expect(r).toEqual({ recorded: false, reason: "open_escalation_already_exists" });
  });

  it("skips when a draft was created", async () => {
    const sb = buildMockSupabase({});
    const r = await maybeRecordOrchestratorNoDraftableEscalation(sb, { ...baseParams, draftCreated: true });
    expect(r).toEqual({ recorded: false, reason: "draft_exists" });
  });

  it("skips when skip reason is not no_draftable", async () => {
    const sb = buildMockSupabase({});
    const r = await maybeRecordOrchestratorNoDraftableEscalation(sb, {
      ...baseParams,
      draftSkipReason: "verifier_blocked",
    });
    expect(r).toEqual({ recorded: false, reason: "skip_reason_not_no_draftable" });
  });

  it("skips when verifier failed", async () => {
    const sb = buildMockSupabase({});
    const r = await maybeRecordOrchestratorNoDraftableEscalation(sb, {
      ...baseParams,
      verifierSuccess: false,
    });
    expect(r).toEqual({ recorded: false, reason: "verifier_failed" });
  });

  it("skips auto outcome", async () => {
    const sb = buildMockSupabase({});
    const r = await maybeRecordOrchestratorNoDraftableEscalation(sb, {
      ...baseParams,
      orchestratorOutcome: "auto",
    });
    expect(r).toEqual({ recorded: false, reason: "outcome_not_draft_or_ask" });
  });

  it("includes reason_code on insert for Today/dedupe contract", async () => {
    const filter = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const esc = {
      select: vi.fn().mockReturnValue(filter),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "x" }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };
    const threads = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };
    const sb = {
      from: vi.fn().mockImplementation((t: string) => (t === "escalation_requests" ? esc : threads)),
    } as unknown as SupabaseClient;

    await maybeRecordOrchestratorNoDraftableEscalation(sb, baseParams);

    expect(esc.insert).toHaveBeenCalled();
    const row = esc.insert.mock.calls[0][0] as { reason_code: string };
    expect(row.reason_code).toBe(ORCHESTRATOR_NO_DRAFTABLE_REASON_CODE);
  });
});
