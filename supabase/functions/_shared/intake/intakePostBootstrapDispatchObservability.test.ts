import { describe, expect, it, vi } from "vitest";
import {
  buildIntakePostBootstrapDispatchObservabilityRecord,
  logIntakePostBootstrapDispatchObservabilityRecord,
} from "./intakePostBootstrapDispatchObservability.ts";

const ids = {
  photographerId: "photo-1",
  weddingId: "wed-1",
  threadId: "thread-1",
};

function assertNoMessageOrBodyLeak(
  record: ReturnType<typeof buildIntakePostBootstrapDispatchObservabilityRecord>,
): void {
  const json = JSON.stringify(record);
  expect(json).not.toMatch(/raw[_-]?message/i);
  expect(json).not.toContain("SECRET_BODY");
  expect(json).not.toContain("raw_facts");
  const forbiddenKeys = ["raw_message", "rawMessage", "body", "raw_facts", "rawFacts", "sender_email", "senderEmail"];
  for (const k of forbiddenKeys) {
    expect(Object.keys(record)).not.toContain(k);
  }
}

describe("buildIntakePostBootstrapDispatchObservabilityRecord", () => {
  it("live email branch", () => {
    const r = buildIntakePostBootstrapDispatchObservabilityRecord({
      ...ids,
      replyChannel: "email",
      downstreamChoice: "live_orchestrator_email",
      intakeLiveCorrelationId: "corr-email",
    });
    expect(r).toMatchObject({
      event: "intake_post_bootstrap_dispatch_v1",
      ...ids,
      replyChannel: "email",
      downstreamChoice: "live_orchestrator_email",
      intakeLiveCorrelationId: "corr-email",
    });
    expect(r.intakeLiveWebCorrelationId).toBeUndefined();
    expect(r.intakeParityCorrelationId).toBeUndefined();
    assertNoMessageOrBodyLeak(r);
  });

  it("live web branch", () => {
    const r = buildIntakePostBootstrapDispatchObservabilityRecord({
      ...ids,
      replyChannel: "web",
      downstreamChoice: "live_orchestrator_web",
      intakeLiveWebCorrelationId: "corr-web",
    });
    expect(r).toMatchObject({
      downstreamChoice: "live_orchestrator_web",
      replyChannel: "web",
      intakeLiveWebCorrelationId: "corr-web",
    });
    expect(r.intakeLiveCorrelationId).toBeUndefined();
    assertNoMessageOrBodyLeak(r);
  });

  it("parity / shadow orchestrator branch", () => {
    const r = buildIntakePostBootstrapDispatchObservabilityRecord({
      ...ids,
      replyChannel: "email",
      downstreamChoice: "shadow_orchestrator_parity",
      intakeParityCorrelationId: "corr-parity",
    });
    expect(r).toMatchObject({
      downstreamChoice: "shadow_orchestrator_parity",
      intakeParityCorrelationId: "corr-parity",
    });
    assertNoMessageOrBodyLeak(r);
  });

  it("legacy persona branch", () => {
    const r = buildIntakePostBootstrapDispatchObservabilityRecord({
      ...ids,
      replyChannel: undefined,
      downstreamChoice: "legacy_persona",
    });
    expect(r).toMatchObject({
      downstreamChoice: "legacy_persona",
      replyChannel: "unspecified",
    });
    expect(r.intakeLiveCorrelationId).toBeUndefined();
    expect(r.intakeLiveWebCorrelationId).toBeUndefined();
    expect(r.intakeParityCorrelationId).toBeUndefined();
    assertNoMessageOrBodyLeak(r);
  });
});

describe("logIntakePostBootstrapDispatchObservabilityRecord", () => {
  it("emits grep-friendly prefix and JSON body", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const record = buildIntakePostBootstrapDispatchObservabilityRecord({
      ...ids,
      replyChannel: "email",
      downstreamChoice: "legacy_persona",
    });
    logIntakePostBootstrapDispatchObservabilityRecord(record);
    expect(info).toHaveBeenCalledTimes(1);
    const [label, payload] = info.mock.calls[0] as [string, string];
    expect(label).toBe("[processIntakeExistingThread.dispatch_result]");
    expect(JSON.parse(payload)).toEqual(record);
    info.mockRestore();
  });
});
