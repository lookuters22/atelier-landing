/**
 * Live DB verification for `finalize_onboarding_briefing_v1` (no mocks).
 *
 * Prerequisites:
 * - `supabase db push` / migrations applied (including `20260430200000_finalize_onboarding_briefing_v1.sql`)
 * - `.env` with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   npx tsx --env-file=.env scripts/onboarding_finalize_live_verify.ts
 *
 * Optional env:
 *   ONBOARDING_FINALIZE_VERIFY_EMAIL_A / ONBOARDING_FINALIZE_VERIFY_EMAIL_B / ONBOARDING_FINALIZE_VERIFY_PASSWORD
 */
import "./loadRootEnv.ts";
import { runOnboardingFinalizeLiveVerify } from "../src/lib/onboardingFinalizeLiveVerifyRunner.ts";

void runOnboardingFinalizeLiveVerify()
  .then(() => {
    console.log("[onboarding_finalize_live_verify] OK");
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
