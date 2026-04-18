import type { OnboardingSettingsIdentity } from "./onboardingV4Payload.ts";
import type { OnboardingPlaybookSeed } from "./onboardingV4Payload.ts";
import type { ActionPermissionDecisionMode } from "./onboardingActionPermissionMatrixScheduling.ts";
import type { SchedulingActionKey } from "./onboardingActionPermissionMatrixScheduling.ts";
import type { SchedulingActionPermissionMatrix } from "./onboardingActionPermissionMatrixScheduling.ts";
import { SCHEDULING_DECISION_CHIP_OPTIONS } from "./onboardingBriefingAuthorityScheduling.ts";
import { BUSINESS_SCOPE_JSON_SCHEMA_VERSION } from "./onboardingBusinessScopeDeterministic.ts";
import type { BusinessScopeDeterministicV2 } from "./onboardingBusinessScopeDeterministic.ts";
import type { NonSchedulingAuthorityActionKey } from "./onboardingBriefingAuthorityPlaybook.ts";

/** Plain-language chip labels for `decision_mode` (matches Authority step). */
export function decisionModeToPlainLabel(mode: ActionPermissionDecisionMode): string {
  return SCHEDULING_DECISION_CHIP_OPTIONS.find((o) => o.mode === mode)?.label ?? "Ana asks me";
}

/**
 * When the operator has not saved Business scope yet, resolver-only geography / travel / lead
 * values are labeled as defaults so they are not mistaken for explicit choices.
 */
export function formatReviewDecision(
  plainLabel: string,
  isExplicitChoice: boolean,
): string {
  if (isExplicitChoice) return plainLabel;
  return `Default: ${plainLabel}`;
}

export function isBlank(s: string | undefined): boolean {
  return !s?.trim();
}

export function isIdentitySectionEmpty(id: OnboardingSettingsIdentity): boolean {
  return (
    isBlank(id.studio_name) &&
    isBlank(id.manager_name) &&
    isBlank(id.photographer_names) &&
    isBlank(id.timezone) &&
    isBlank(id.currency) &&
    isBlank(id.admin_mobile_number)
  );
}

/** True when `business_scope_deterministic` was saved with the expected schema version. */
export function hasExplicitBusinessScopeSnapshot(
  raw: BusinessScopeDeterministicV2 | undefined,
): boolean {
  return Boolean(raw && raw.schema_version === BUSINESS_SCOPE_JSON_SCHEMA_VERSION);
}

/** Per scheduling row: explicit only if the draft matrix includes that key. */
export function schedulingMatrixKeyIsExplicit(
  matrix: SchedulingActionPermissionMatrix | undefined,
  key: SchedulingActionKey,
): boolean {
  return matrix?.[key] !== undefined;
}

/** True when a global playbook seed exists for this action (Authority step touched this key). */
export function nonSchedulingAuthorityIsExplicit(
  seeds: OnboardingPlaybookSeed[] | undefined,
  action_key: NonSchedulingAuthorityActionKey,
): boolean {
  return (seeds ?? []).some((s) => s.scope === "global" && s.action_key === action_key);
}
