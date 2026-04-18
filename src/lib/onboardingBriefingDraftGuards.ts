/**
 * Pure guards for onboarding briefing autosave / draft snapshot writes (Slice 3–4).
 * Keeps hook logic testable without mounting React.
 *
 * `hasPendingDraftEdits` is set on a **completed** briefing only when the user changes
 * payload (`updatePayload`); step navigation does not set it.
 */
export function shouldAllowDraftSnapshotWrites(
  briefingStatus: "draft" | "completed",
  hasPendingDraftEdits: boolean,
): boolean {
  if (briefingStatus === "completed" && !hasPendingDraftEdits) return false;
  return true;
}
