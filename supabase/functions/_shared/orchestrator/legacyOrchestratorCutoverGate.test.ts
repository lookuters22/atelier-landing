/* Edge functions use `Deno.env`; Vitest runs in Node — mirror `process.env` for env reads. */
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { afterEach, describe, expect, it } from "vitest";
import {
  buildCut2WebWidgetD1ExecV2,
  getWebWidgetKnownWeddingOrchestratorLiveCutoverReadiness,
  isTriageD1Cut2WebWidgetLegacyConciergeDispatchWhenCut2OffAllowed,
  isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled,
  isTriageShadowOrchestratorClientV1Enabled,
  ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER_HOLD_REASON_CODE,
  TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV,
  TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV,
  TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1_ENV,
} from "./legacyOrchestratorCutoverGate.ts";
import { isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled as webWidgetGateFromCompatSurface } from "./triageShadowOrchestratorClientV1Gate.ts";

function deleteEnv(...keys: string[]) {
  for (const k of keys) delete process.env[k];
}

describe("legacyOrchestratorCutoverGate", () => {
  afterEach(() => {
    deleteEnv(
      TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV,
      TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV,
      TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1_ENV,
    );
  });

  it("CUT2 live gate: only 1/true enable", () => {
    delete process.env[TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV];
    expect(isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled()).toBe(false);
    process.env[TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV] = "1";
    expect(isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled()).toBe(true);
  });

  it("CUT2 D1 gate: 0/false/off/no disables legacy when CUT2 off", () => {
    delete process.env[TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV];
    expect(isTriageD1Cut2WebWidgetLegacyConciergeDispatchWhenCut2OffAllowed()).toBe(true);
    process.env[TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV] = "0";
    expect(isTriageD1Cut2WebWidgetLegacyConciergeDispatchWhenCut2OffAllowed()).toBe(false);
  });

  it("readiness builder: hold vs active CUT2 shape", () => {
    const hold = getWebWidgetKnownWeddingOrchestratorLiveCutoverReadiness(false);
    expect(hold.live_cutover_enabled).toBe(false);
    expect(hold.hold_reason_code).toBe(ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER_HOLD_REASON_CODE);

    const active = getWebWidgetKnownWeddingOrchestratorLiveCutoverReadiness(true);
    expect(active.live_cutover_enabled).toBe(true);
    if (active.live_cutover_enabled) {
      expect(active.narrow_cutover_branch).toBe("web_widget_known_wedding_v1");
      expect(active.cut2_requested_execution_mode).toBe("draft_only");
    }
  });

  it("buildCut2WebWidgetD1ExecV2: blocked when live off and D1 forbids legacy", () => {
    const v = buildCut2WebWidgetD1ExecV2({
      d1LegacyWhenCut2OffAllowed: false,
      cut2WebWidgetLive: false,
    });
    expect(v.blocked_no_dispatch).toBe(true);
    expect(v.schema_version).toBe(2);
  });

  it("shadow gate: 1/true enable", () => {
    delete process.env[TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1_ENV];
    expect(isTriageShadowOrchestratorClientV1Enabled()).toBe(false);
    process.env[TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1_ENV] = "true";
    expect(isTriageShadowOrchestratorClientV1Enabled()).toBe(true);
  });
});

describe("triageShadowOrchestratorClientV1Gate compatibility", () => {
  it("re-exports legacy CUT2 live gate reader", () => {
    expect(webWidgetGateFromCompatSurface).toBe(isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled);
  });
});
