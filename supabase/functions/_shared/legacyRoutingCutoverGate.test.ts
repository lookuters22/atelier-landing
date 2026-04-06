/**
 * execute_v3 Phase 12 Step 12D — gate module stays in "retain legacy" mode until cutover phase.
 */
import { describe, expect, it } from "vitest";
import { LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA } from "./legacyRoutingCutoverGate.ts";

describe("Step 12D — legacy routing retention gate", () => {
  it("remains true until an explicit cutover PR changes legacyRoutingCutoverGate.ts", () => {
    expect(LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA).toBe(true);
  });
});
