/**
 * Phase 4 Step 4D.1 — explicit action-permission matrix (one narrow family: **scheduling**).
 *
 * execute_v3: resolve do-alone / draft-only / ask-first / never-do via `playbook_rules.decision_mode`,
 * not implied prose. Each matrix row becomes one global rule with machine-readable `instruction` JSON.
 *
 * DATABASE_SCHEMA §5.17 suggested action families include `schedule_call`, `move_call`; topic `scheduling`.
 */
import type {
  OnboardingPlaybookSeed,
  PlaybookRuleInsert,
} from "./onboardingV4Payload.ts";

/** Four runtime-resolvable modes (matches `playbook_rules.decision_mode`). */
export type ActionPermissionDecisionMode =
  | "auto"
  | "draft_only"
  | "ask_first"
  | "forbidden";

/** Canonical keys in this slice — complete matrix must assign each. */
export const SCHEDULING_ACTION_MATRIX_KEYS = [
  "schedule_call",
  "move_call",
] as const;

export type SchedulingActionKey = (typeof SCHEDULING_ACTION_MATRIX_KEYS)[number];

/**
 * Explicit permission matrix: every family key maps to exactly one `decision_mode`
 * queryable at runtime (no prose-only policy).
 */
export type SchedulingActionPermissionMatrix = Record<
  SchedulingActionKey,
  ActionPermissionDecisionMode
>;

/** Suggested defaults aligned with execute_v3 Step 4D (`schedule_call = auto`). */
export const DEFAULT_SCHEDULING_ACTION_PERMISSION_MATRIX: SchedulingActionPermissionMatrix =
  {
    schedule_call: "auto",
    move_call: "ask_first",
  };

const SCHEDULING_KEY_SET = new Set<string>(SCHEDULING_ACTION_MATRIX_KEYS);

/**
 * When a scheduling matrix is supplied, drop **global** seeds for those `action_key`s
 * so matrix rows are the single global source of truth for this family.
 */
export function filterGlobalSeedsSupersededBySchedulingMatrix(
  seeds: OnboardingPlaybookSeed[],
  matrix: SchedulingActionPermissionMatrix | undefined,
): OnboardingPlaybookSeed[] {
  if (!matrix) return seeds;
  return seeds.filter(
    (s) =>
      !(
        s.scope === "global" &&
        SCHEDULING_KEY_SET.has(s.action_key)
      ),
  );
}

export function schedulingActionPermissionMatrixToPlaybookRules(
  photographerId: string,
  matrix: SchedulingActionPermissionMatrix,
): PlaybookRuleInsert[] {
  return SCHEDULING_ACTION_MATRIX_KEYS.map((action_key) => {
    const decision_mode = matrix[action_key];
    return {
      photographer_id: photographerId,
      scope: "global",
      channel: null,
      action_key,
      topic: "scheduling",
      decision_mode,
      instruction: JSON.stringify({
        kind: "action_permission_matrix_v1",
        family: "scheduling",
        action_key,
        decision_mode,
      }),
      source_type: "onboarding_matrix",
      confidence_label: "explicit",
      is_active: true,
    } satisfies PlaybookRuleInsert;
  });
}
