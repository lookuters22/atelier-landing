/**
 * Real DB integration test — skipped unless ONBOARDING_FINALIZE_VERIFY=1.
 * @see docs/v3/ONBOARDING_RUNTIME_FINALIZATION_SLICE4_VERIFICATION.md
 */
import { describe, it } from "vitest";
import "../../scripts/loadRootEnv.ts";
import { runOnboardingFinalizeLiveVerify } from "./onboardingFinalizeLiveVerifyRunner.ts";

describe.skipIf(process.env.ONBOARDING_FINALIZE_VERIFY !== "1")(
  "finalize_onboarding_briefing_v1 (live Supabase)",
  () => {
    it(
      "runs full onboardingFinalizeLiveVerify runner against the configured project",
      async () => {
        await runOnboardingFinalizeLiveVerify();
      },
      120_000,
    );
  },
);
