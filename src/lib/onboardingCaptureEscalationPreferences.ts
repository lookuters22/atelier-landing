/**
 * Phase 4 Step 4B — minimum onboarding capture for **escalation preferences** only.
 *
 * Docs: `docs/v3/execute_v3.md` Step 4B (escalation preferences bullet);
 * `docs/v3/ARCHITECTURE.md` §11 Escalation Delivery Policy.
 *
 * Storage mapping (playbook_rules / knowledge_base) is Step 4C+; this module only
 * models the answers in stable, finite categories.
 */

/** Canonical reasons escalations should notify the operator immediately (ARCHITECTURE §11 examples). */
export const ESCALATION_IMMEDIATE_TOPIC_KEYS = [
  "pr_publication_dispute",
  "banking_payment_exception",
  "sensitive_data_or_compliance",
  "same_day_timeline_blocker",
] as const;

export type EscalationImmediateTopicKey =
  (typeof ESCALATION_IMMEDIATE_TOPIC_KEYS)[number];

/**
 * How non-urgent escalations should be delivered when they are not in the
 * immediate topic set.
 */
export type EscalationBatchingPreference =
  /** Match ARCHITECTURE default: urgent push, others digest/queue when safe. */
  | "urgent_immediate_other_digest"
  /** Always push; no batching (high notification load). */
  | "always_immediate"
  /** Prefer batch/digest for everything except blocked/safety cases (explicit choice). */
  | "prefer_digest_even_when_urgent_feels_borderline";

/**
 * Minimum fields the onboarding flow should collect for escalation routing.
 * Values are studio-wide defaults; wedding-specific exceptions stay out of onboarding.
 */
export type EscalationPreferencesCapture = {
  /**
   * Which studio-wide topics always warrant immediate operator notification
   * when Ana would otherwise batch.
   */
  immediate_notification_topics: EscalationImmediateTopicKey[];

  /**
   * Default delivery pattern for everything else (and for borderline urgency).
   */
  batching_preference: EscalationBatchingPreference;

  /**
   * Optional short prose the operator can attach to playbook/KB later
   * (not stored here — caller passes through in 4C).
   */
  escalation_routing_notes?: string;
};

/** Empty capture — onboarding step skipped or not yet answered. */
export function createEmptyEscalationPreferencesCapture(): EscalationPreferencesCapture {
  return {
    immediate_notification_topics: [],
    batching_preference: "urgent_immediate_other_digest",
  };
}

/** True if at least one field was explicitly set beyond the empty default. */
export function isEscalationPreferencesCaptureMeaningful(
  c: EscalationPreferencesCapture,
): boolean {
  if (c.immediate_notification_topics.length > 0) return true;
  if (c.batching_preference !== "urgent_immediate_other_digest") return true;
  if (c.escalation_routing_notes && c.escalation_routing_notes.trim().length > 0) {
    return true;
  }
  return false;
}
