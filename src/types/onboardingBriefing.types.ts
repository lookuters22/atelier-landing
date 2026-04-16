import type { OnboardingPayloadV4 } from "../lib/onboardingV4Payload.ts";

/** Ordered briefing steps (shell); forms land in later slices. */
export const ONBOARDING_BRIEFING_STEPS = [
  "identity",
  "scope",
  "voice",
  "authority",
  "vault",
  "review",
] as const;

export type OnboardingBriefingStepId = (typeof ONBOARDING_BRIEFING_STEPS)[number];

export function isOnboardingBriefingStepId(s: string): s is OnboardingBriefingStepId {
  return (ONBOARDING_BRIEFING_STEPS as readonly string[]).includes(s);
}

/** Short labels for the briefing shell (not persisted). */
export const ONBOARDING_BRIEFING_STEP_LABELS: Record<OnboardingBriefingStepId, string> = {
  identity: "Studio identity",
  scope: "Business scope",
  voice: "Voice & knowledge",
  authority: "Authority",
  vault: "The vault",
  review: "Review",
};

/** Version key stored under `photographers.settings`. */
export const ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY = "onboarding_briefing_v1" as const;

/** ISO timestamp of last editor save for the briefing snapshot. */
export const ONBOARDING_BRIEFING_UPDATED_AT_SETTINGS_KEY =
  "onboarding_briefing_updated_at" as const;

/**
 * Editor-only draft/resume snapshot for the onboarding briefing UI.
 * Runtime policy and business scope must read canonical tables, not this object.
 */
export type OnboardingBriefingSnapshotV1 = {
  schema_version: 1;
  status: "draft" | "completed";
  completed_steps: string[];
  /** ISO 8601 */
  last_saved_at: string;
  /** Last focused step — used to resume the shell (editor-only). */
  current_step?: OnboardingBriefingStepId;
  payload: OnboardingPayloadV4;
};
