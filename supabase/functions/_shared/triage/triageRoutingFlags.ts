/**
 * Live post-ingest triage routing flags (bounded unresolved matchmaker, QA synthetic confidence, inquiry dedup).
 * Owned by triage — not the orchestrator CUT/shadow gate module.
 */

/**
 * Bounded unresolved email — identity/filer activation (not CUT4-style orchestrator swap).
 * When `1` / `true`, main-path **`comms/email.received`** with **no deterministic `clients.email → wedding_id`** may still
 * run the OpenAI (`gpt-4o-mini`) roster matchmaker if the triage LLM classified a **non-intake** intent (stage gate still forces `intake` until a
 * wedding is resolved). Default **off**. Rollback = unset env.
 */
export const TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV =
  "TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1" as const;

/**
 * Near-match approval escalation — **second** bounded gate (rollback = unset).
 * When **both** this and `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1` are on, matchmaker scores in
 * **[75, 90)** (see `BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE`) with a non-null candidate id
 * create `escalation_requests` + operator delivery signal **instead of** auto-filing or `ai/intent.intake`.
 * Auto-file at **≥ 90** is unchanged.
 */
export const TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1_ENV =
  "TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1" as const;

/**
 * **QA / proof only — default off (unset).** When set to an integer in **[75, 89]** and both bounded gates are on,
 * after the real matchmaker returns a non-null `suggested_wedding_id`, triage **replaces** `confidence_score` with
 * this value for branching only. Does **not** change the production auto-file threshold (90); does nothing when unset
 * or invalid. Used to obtain deterministic `escalated_for_approval` E2E evidence without lowering real matcher behavior.
 */
export const TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV =
  "TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1" as const;

/**
 * Deterministic inquiry dedup against the active project roster (contact graph + conservative text signals).
 * Runs before the LLM matchmaker on unlinked inbound email. Default **on** (unset). Set `0` / `false` / `off` / `no` to disable.
 */
export const TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV = "TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1" as const;

/** Inclusive lower bound for “high confidence but not auto-file” (escalation-for-approval band). */
export const BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE = 75;
/** Matchmaker auto-resolve threshold (exclusive of escalation band). */
export const BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE = 90;

export function isTriageBoundedUnresolvedEmailMatchmakerEnabled(): boolean {
  const v = Deno.env.get(TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV);
  return v === "1" || v === "true";
}

export function isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled(): boolean {
  const v = Deno.env.get(TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1_ENV);
  return v === "1" || v === "true";
}

export function isTriageDeterministicInquiryDedupV1Enabled(): boolean {
  const v = Deno.env.get(TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV);
  if (v === undefined || v === "") return true;
  const s = v.trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return true;
}

/** Integer in [75, 89] from `TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1`, or `null` if unset/invalid. */
export function getTriageQaBoundedNearMatchSyntheticConfidenceScore(): number | null {
  const raw = Deno.env.get(TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV);
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return null;
  if (n < BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE) return null;
  if (n >= BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE) return null;
  return n;
}
