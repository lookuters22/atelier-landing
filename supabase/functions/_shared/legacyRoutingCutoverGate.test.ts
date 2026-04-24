/**
 * execute_v3 Phase 12 Step 12D — gate module stays in "retain legacy" mode until cutover phase.
 */
import { describe, expect, it } from "vitest";
import {
  LEGACY_PRE_INGRESS_ROUTING_RETENTION_STATUS_SUMMARY,
  LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA,
} from "./legacyRoutingCutoverGate.ts";

describe("Step 12D — legacy routing retention gate", () => {
  it("remains true until an explicit cutover PR changes legacyRoutingCutoverGate.ts", () => {
    expect(LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA).toBe(true);
  });

  it("exports stable pre-ingress retention summary for audits/docs", () => {
    expect(LEGACY_PRE_INGRESS_ROUTING_RETENTION_STATUS_SUMMARY).toBe(
      "pre_ingress_routing_intentionally_retained_pending_explicit_ops_retirement",
    );
  });
});
