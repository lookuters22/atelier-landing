/**
 * execute_v3 Phase 12 Step 12D — pre-ingress email/web retired; gate reflects completed cutover.
 */
import { describe, expect, it } from "vitest";
import {
  LEGACY_PRE_INGRESS_ROUTING_RETIRED_STATE_SUMMARY,
  LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA,
} from "./legacyRoutingCutoverGate.ts";

describe("Step 12D — legacy routing cutover gate", () => {
  it("exit criteria satisfied after pre-ingress email/web retirement PR", () => {
    expect(LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA).toBe(false);
  });

  it("exports stable retired-state summary for audits/docs", () => {
    expect(LEGACY_PRE_INGRESS_ROUTING_RETIRED_STATE_SUMMARY).toBe(
      "pre_ingress_routing_retired_gmail_thread_path_primary",
    );
  });
});
