/**
 * Slice 6 — round-trip carry-forward pointer for the operator Ana widget (no DB; session transport only).
 * @see docs/v3/V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md
 */

export type OperatorAnaCarryForwardDomain =
  | "projects"
  | "threads"
  | "calendar"
  | "playbook"
  | "memories"
  | "studio_analysis"
  | "app_help"
  | "knowledge"
  | "none";

export type OperatorAnaCarryForwardProjectType = "wedding" | "commercial" | "video" | "other";

export type OperatorAnaCarryForwardAdvisoryReason =
  | "short_cue_detected"
  | "no_cue_detected"
  | "topic_change_shaped"
  | "fresh_session"
  | "age_expired"
  | "focus_changed"
  | null;

export type OperatorAnaAdvisoryFollowUp = true | false | null;

export type OperatorAnaAdvisoryConfidence = "high" | "medium" | "low";

export type OperatorAnaCarryForwardAdvisoryHint = {
  likelyFollowUp: OperatorAnaAdvisoryFollowUp;
  reason: OperatorAnaCarryForwardAdvisoryReason;
  confidence: OperatorAnaAdvisoryConfidence;
};

/**
 * Durable data fields (IDs + flags) for one turn, without `ageSeconds` or `advisoryHint`.
 */
export type OperatorAnaCarryForwardData = {
  lastDomain: OperatorAnaCarryForwardDomain;
  lastFocusedProjectId: string | null;
  lastFocusedProjectType: OperatorAnaCarryForwardProjectType | null;
  lastMentionedPersonId: string | null;
  lastThreadId: string | null;
  lastEntityAmbiguous: boolean;
};

/**
 * What the model sees in Context (advisory is computed per request, never a gate on IDs).
 */
export type OperatorAnaCarryForwardForLlm = OperatorAnaCarryForwardData & {
  ageSeconds: number;
  advisoryHint: OperatorAnaCarryForwardAdvisoryHint;
};

/**
 * Client↔server round-trip state (re-sent on the next request). Server recomputes `ageSeconds` and `advisoryHint` for the prompt.
 */
export type OperatorAnaCarryForwardClientState = OperatorAnaCarryForwardData & {
  /** When this pointer was last emitted; used to compute `ageSeconds` on the next call. */
  emittedAtEpochMs: number;
  /** Effective UI focus at emit time (Slice 6 — focus drift detection). */
  capturedFocusWeddingId: string | null;
  capturedFocusPersonId: string | null;
};
