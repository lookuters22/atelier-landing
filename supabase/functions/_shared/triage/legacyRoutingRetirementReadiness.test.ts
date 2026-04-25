import { describe, expect, it, vi } from "vitest";
import {
  buildLegacyRoutingRetirementReadinessRecord,
  LEGACY_ROUTING_RETIREMENT_READINESS_EVENT,
  logLegacyRoutingRetirementReadinessRecord,
  TRIAGE_RETIREMENT_BLOCKING_EMAIL_EXTERNAL_NOT_RULED_OUT,
  TRIAGE_RETIREMENT_BLOCKING_TRIAGE_STILL_REGISTERED,
  TRIAGE_RETIREMENT_BLOCKING_WEB_EMITTER_IN_REPO,
} from "./legacyRoutingRetirementReadiness.ts";

const clearedBase = {
  triageRegistered: false,
  consumesCommsEmailReceived: false,
  consumesCommsWebReceived: false,
  webEmitterPresentInRepo: false,
  emailEmitterPresentInRepo: true,
};

describe("buildLegacyRoutingRetirementReadinessRecord", () => {
  it("not ready when triage is still registered", () => {
    const r = buildLegacyRoutingRetirementReadinessRecord({
      ...clearedBase,
      triageRegistered: true,
    });
    expect(r.retirementReady).toBe(false);
    expect(r.blockingReasons).toContain(TRIAGE_RETIREMENT_BLOCKING_TRIAGE_STILL_REGISTERED);
  });

  it("not ready when web in-repo emitter is still present", () => {
    const r = buildLegacyRoutingRetirementReadinessRecord({
      ...clearedBase,
      webEmitterPresentInRepo: true,
    });
    expect(r.retirementReady).toBe(false);
    expect(r.blockingReasons).toContain(TRIAGE_RETIREMENT_BLOCKING_WEB_EMITTER_IN_REPO);
    expect(r.blockingReasons).not.toContain(TRIAGE_RETIREMENT_BLOCKING_TRIAGE_STILL_REGISTERED);
  });

  it("not ready when email pre-ingress is consumed but no in-repo emitter is observed", () => {
    const r = buildLegacyRoutingRetirementReadinessRecord({
      ...clearedBase,
      consumesCommsEmailReceived: true,
      emailEmitterPresentInRepo: false,
    });
    expect(r.retirementReady).toBe(false);
    expect(r.blockingReasons).toContain(TRIAGE_RETIREMENT_BLOCKING_EMAIL_EXTERNAL_NOT_RULED_OUT);
  });

  it("ready only when all blocking conditions are cleared", () => {
    const r = buildLegacyRoutingRetirementReadinessRecord(clearedBase);
    expect(r.retirementReady).toBe(true);
    expect(r.blockingReasons).toEqual([]);
    expect(r.event).toBe(LEGACY_ROUTING_RETIREMENT_READINESS_EVENT);
  });

  it("email blocker omitted when comms/email is not consumed", () => {
    const r = buildLegacyRoutingRetirementReadinessRecord({
      triageRegistered: false,
      consumesCommsEmailReceived: false,
      consumesCommsWebReceived: true,
      webEmitterPresentInRepo: false,
      emailEmitterPresentInRepo: false,
    });
    expect(r.blockingReasons).not.toContain(TRIAGE_RETIREMENT_BLOCKING_EMAIL_EXTERNAL_NOT_RULED_OUT);
    expect(r.retirementReady).toBe(true);
  });

  it("post web-retirement triage audit: only triage + email external blockers (no web)", () => {
    const r = buildLegacyRoutingRetirementReadinessRecord({
      triageRegistered: true,
      consumesCommsEmailReceived: true,
      consumesCommsWebReceived: true,
      webEmitterPresentInRepo: false,
      emailEmitterPresentInRepo: false,
    });
    expect(r.retirementReady).toBe(false);
    expect(r.blockingReasons).toEqual([
      TRIAGE_RETIREMENT_BLOCKING_TRIAGE_STILL_REGISTERED,
      TRIAGE_RETIREMENT_BLOCKING_EMAIL_EXTERNAL_NOT_RULED_OUT,
    ]);
    expect(r.blockingReasons).not.toContain(TRIAGE_RETIREMENT_BLOCKING_WEB_EMITTER_IN_REPO);
  });
});

describe("logLegacyRoutingRetirementReadinessRecord", () => {
  it("uses stable grep prefix and JSON body", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const record = buildLegacyRoutingRetirementReadinessRecord(clearedBase);
    logLegacyRoutingRetirementReadinessRecord(record);
    expect(info).toHaveBeenCalledTimes(1);
    const [label, payload] = info.mock.calls[0] as [string, string];
    expect(label).toBe("[triage.legacy_retirement_readiness]");
    expect(JSON.parse(payload)).toEqual(record);
    info.mockRestore();
  });
});
