import type { OnboardingPayloadV4 } from "./onboardingV4Payload.ts";

/** Minimal valid v4 payload for a new or reset editor draft (shell-only). */
export function createEmptyOnboardingPayloadV4(): OnboardingPayloadV4 {
  return {
    settings_identity: {},
    studio_scope: {},
    playbook_seeds: [],
    knowledge_seeds: [],
  };
}
