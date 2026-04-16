/**
 * Read/write the versioned onboarding briefing editor snapshot in `photographers.settings`.
 * Preserves unrelated keys. Does not merge into `PhotographerSettings` contract parsing.
 */
import type { OnboardingPayloadV4 } from "./onboardingV4Payload.ts";
import {
  isOnboardingBriefingStepId,
  ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY,
  ONBOARDING_BRIEFING_UPDATED_AT_SETTINGS_KEY,
  type OnboardingBriefingSnapshotV1,
} from "../types/onboardingBriefing.types.ts";

export {
  ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY,
  ONBOARDING_BRIEFING_UPDATED_AT_SETTINGS_KEY,
  type OnboardingBriefingSnapshotV1,
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isOnboardingPayloadShape(v: unknown): v is OnboardingPayloadV4 {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  const id = p.settings_identity;
  const scope = p.studio_scope;
  const seeds = p.playbook_seeds;
  if (!id || typeof id !== "object" || Array.isArray(id)) return false;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return false;
  if (!Array.isArray(seeds)) return false;
  return true;
}

/**
 * Returns the snapshot if `raw` contains a valid `onboarding_briefing_v1` object (schema_version 1).
 */
export function parseOnboardingBriefingSnapshotV1(
  raw: Record<string, unknown> | null | undefined,
): OnboardingBriefingSnapshotV1 | null {
  if (!raw) return null;
  const blob = raw[ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY];
  if (!blob || typeof blob !== "object" || Array.isArray(blob)) return null;

  const o = blob as Record<string, unknown>;
  if (o.schema_version !== 1) return null;
  if (o.status !== "draft" && o.status !== "completed") return null;
  if (!Array.isArray(o.completed_steps) || !o.completed_steps.every((s) => typeof s === "string")) {
    return null;
  }
  if (!isNonEmptyString(o.last_saved_at)) return null;
  if (!isOnboardingPayloadShape(o.payload)) return null;

  let current_step: OnboardingBriefingSnapshotV1["current_step"];
  const rawStep = o.current_step;
  if (typeof rawStep === "string" && isOnboardingBriefingStepId(rawStep)) {
    current_step = rawStep;
  }

  const base: OnboardingBriefingSnapshotV1 = {
    schema_version: 1,
    status: o.status,
    completed_steps: o.completed_steps,
    last_saved_at: o.last_saved_at,
    payload: o.payload,
  };
  if (current_step !== undefined) base.current_step = current_step;
  return base;
}

export type MergeOnboardingBriefingSnapshotOptions = {
  /** When omitted, `onboarding_briefing_updated_at` is not written. */
  updatedAtIso?: string;
};

/**
 * Writes `onboarding_briefing_v1` and optionally `onboarding_briefing_updated_at`.
 * Shallow-copies `existing` then assigns keys — does not remove other settings keys.
 */
export function mergeOnboardingBriefingSnapshotIntoSettings(
  existing: Record<string, unknown> | null | undefined,
  snapshot: OnboardingBriefingSnapshotV1,
  options?: MergeOnboardingBriefingSnapshotOptions,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};

  base[ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY] = snapshot;

  const at = options?.updatedAtIso;
  if (at !== undefined) {
    base[ONBOARDING_BRIEFING_UPDATED_AT_SETTINGS_KEY] = at;
  }

  return base;
}
