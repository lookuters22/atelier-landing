import {
  DEFAULT_SCHEDULING_ACTION_PERMISSION_MATRIX,
  type ActionPermissionDecisionMode,
  type SchedulingActionKey,
  type SchedulingActionPermissionMatrix,
} from "./onboardingActionPermissionMatrixScheduling.ts";

/** Plain-language row copy for the scheduling matrix (UI only). */
export const SCHEDULING_AUTHORITY_ROW_LABELS: Record<SchedulingActionKey, string> = {
  schedule_call: "Schedule a discovery call",
  move_call: "Move a scheduled discovery call",
};

/** Chip order and labels — maps 1:1 to `decision_mode`. */
export const SCHEDULING_DECISION_CHIP_OPTIONS: readonly {
  mode: ActionPermissionDecisionMode;
  label: string;
}[] = [
  { mode: "auto", label: "Ana handles it" },
  { mode: "draft_only", label: "Ana drafts it" },
  { mode: "ask_first", label: "Ana asks me" },
  { mode: "forbidden", label: "Never do this" },
];

/** Merge defaults so both keys are always present for draft UI + snapshot. */
export function resolveSchedulingActionPermissionMatrix(
  raw: SchedulingActionPermissionMatrix | undefined,
): SchedulingActionPermissionMatrix {
  return {
    schedule_call:
      raw?.schedule_call ?? DEFAULT_SCHEDULING_ACTION_PERMISSION_MATRIX.schedule_call,
    move_call: raw?.move_call ?? DEFAULT_SCHEDULING_ACTION_PERMISSION_MATRIX.move_call,
  };
}
