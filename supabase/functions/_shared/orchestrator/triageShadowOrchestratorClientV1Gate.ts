/**
 * **Compatibility re-export surface only** — do not add new logic here.
 *
 * - **Legacy CUT2–CUT8 + shadow scaffolding:** implemented in {@link legacyOrchestratorCutoverGate.ts}; imported here
 *   via `export *` for backward compatibility with existing import paths.
 * - **Neutral triage routing flags** (bounded matchmaker, inquiry dedup, QA synthetic confidence): live in
 *   `../triage/triageRoutingFlags.ts` and are re-exported below for the same reason.
 *
 * New code should import `legacyOrchestratorCutoverGate.ts` and/or `triageRoutingFlags.ts` directly.
 */

export * from "./legacyOrchestratorCutoverGate.ts";

export {
  BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE,
  BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE,
  getTriageQaBoundedNearMatchSyntheticConfidenceScore,
  isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled,
  isTriageBoundedUnresolvedEmailMatchmakerEnabled,
  isTriageDeterministicInquiryDedupV1Enabled,
  TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1_ENV,
  TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV,
  TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV,
  TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV,
} from "../triage/triageRoutingFlags.ts";
