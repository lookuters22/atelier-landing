import { describe, expect, it, vi } from "vitest";
import type { MainPathEmailDispatchResult } from "./runMainPathEmailDispatch.ts";
import {
  buildPostIngestDispatchObservabilityRecord,
  logPostIngestDispatchObservabilityRecord,
} from "./postIngestDispatchObservability.ts";

const ctx = {
  threadId: "t-1",
  photographerId: "p-1",
  dispatchIntent: "concierge" as const,
  replyChannel: "email" as const,
  traceId: "trace-xyz",
};

function assertNoMessageLeak(record: ReturnType<typeof buildPostIngestDispatchObservabilityRecord>): void {
  const json = JSON.stringify(record);
  expect(json).not.toMatch(/raw[_-]?message/i);
  expect(json).not.toContain("SECRET_BODY");
  expect(json).not.toContain("sender_email");
  const forbiddenKeys = ["raw_message", "rawMessage", "body", "sender_email", "senderEmail"];
  for (const k of forbiddenKeys) {
    expect(Object.keys(record)).not.toContain(k);
  }
}

describe("buildPostIngestDispatchObservabilityRecord", () => {
  it("legacy: includes legacyEvent", () => {
    const dispatchResult: MainPathEmailDispatchResult = {
      kind: "legacy",
      legacyEvent: "ai/intent.concierge",
    };
    const r = buildPostIngestDispatchObservabilityRecord({ ...ctx, dispatchResult });
    expect(r).toMatchObject({
      event: "post_ingest_dispatch_v1",
      resultKind: "legacy",
      legacyEvent: "ai/intent.concierge",
      threadId: "t-1",
      photographerId: "p-1",
      traceId: "trace-xyz",
    });
    assertNoMessageLeak(r);
  });

  it("intake: stable core fields only", () => {
    const dispatchResult: MainPathEmailDispatchResult = { kind: "intake" };
    const r = buildPostIngestDispatchObservabilityRecord({
      ...ctx,
      dispatchIntent: "intake",
      dispatchResult,
    });
    expect(r).toMatchObject({
      event: "post_ingest_dispatch_v1",
      resultKind: "intake",
      dispatchIntent: "intake",
    });
    expect(r.legacyEvent).toBeUndefined();
    expect(r.escalationId).toBeUndefined();
    expect(r.orchestratorLiveCorrelationId).toBeUndefined();
    expect(r.blocked).toBeUndefined();
    assertNoMessageLeak(r);
  });

  it("near_match_approval_escalation: includes escalationId", () => {
    const dispatchResult: MainPathEmailDispatchResult = {
      kind: "near_match_approval_escalation",
      escalationId: "esc-99",
    };
    const r = buildPostIngestDispatchObservabilityRecord({ ...ctx, dispatchResult });
    expect(r).toMatchObject({
      resultKind: "near_match_approval_escalation",
      escalationId: "esc-99",
    });
    assertNoMessageLeak(r);
  });

  it("cut4_live: includes orchestratorLiveCorrelationId", () => {
    const dispatchResult: MainPathEmailDispatchResult = {
      kind: "cut4_live",
      cut4LiveCorrelationId: "corr-cut4",
    };
    const r = buildPostIngestDispatchObservabilityRecord({ ...ctx, dispatchResult });
    expect(r).toMatchObject({
      resultKind: "cut4_live",
      orchestratorLiveCorrelationId: "corr-cut4",
    });
    assertNoMessageLeak(r);
  });

  it("cut5_d1_blocked_no_dispatch: blocked true", () => {
    const dispatchResult: MainPathEmailDispatchResult = { kind: "cut5_d1_blocked_no_dispatch" };
    const r = buildPostIngestDispatchObservabilityRecord({
      ...ctx,
      dispatchIntent: "project_management",
      dispatchResult,
    });
    expect(r).toMatchObject({
      resultKind: "cut5_d1_blocked_no_dispatch",
      blocked: true,
    });
    assertNoMessageLeak(r);
  });

  it("omits traceId when null or empty", () => {
    const dispatchResult: MainPathEmailDispatchResult = { kind: "intake" };
    const r = buildPostIngestDispatchObservabilityRecord({
      ...ctx,
      traceId: null,
      dispatchIntent: "intake",
      dispatchResult,
    });
    expect(r.traceId).toBeUndefined();
  });
});

describe("logPostIngestDispatchObservabilityRecord", () => {
  it("emits grep-friendly prefix and JSON body", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const record = buildPostIngestDispatchObservabilityRecord({
      ...ctx,
      dispatchResult: { kind: "intake" },
      dispatchIntent: "intake",
    });
    logPostIngestDispatchObservabilityRecord(record);
    expect(info).toHaveBeenCalledTimes(1);
    const [label, payload] = info.mock.calls[0] as [string, string];
    expect(label).toBe("[processInboxThreadRequiresTriage.dispatch_result]");
    expect(JSON.parse(payload)).toEqual(record);
    info.mockRestore();
  });
});
