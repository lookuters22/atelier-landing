import {
  ESCALATION_IMMEDIATE_TOPIC_KEYS,
  type EscalationBatchingPreference,
  type EscalationImmediateTopicKey,
  type EscalationPreferencesCapture,
  createEmptyEscalationPreferencesCapture,
} from "./onboardingCaptureEscalationPreferences.ts";

export const ESCALATION_TOPIC_LABELS: Record<EscalationImmediateTopicKey, string> = {
  pr_publication_dispute: "PR / publication disputes",
  banking_payment_exception: "Banking & payment exceptions",
  sensitive_data_or_compliance: "Sensitive data / compliance",
  same_day_timeline_blocker: "Same-day timeline blockers",
};

export const ESCALATION_BATCHING_OPTIONS: readonly {
  value: EscalationBatchingPreference;
  label: string;
}[] = [
  {
    value: "urgent_immediate_other_digest",
    label: "Urgent immediately; batch the rest when safe",
  },
  { value: "always_immediate", label: "Always notify immediately" },
  {
    value: "prefer_digest_even_when_urgent_feels_borderline",
    label: "Prefer digest even when urgency is borderline",
  },
];

export function resolveEscalationPreferencesForUi(
  raw: EscalationPreferencesCapture | undefined,
): EscalationPreferencesCapture {
  const base = createEmptyEscalationPreferencesCapture();
  if (!raw) return base;
  return {
    immediate_notification_topics: [...(raw.immediate_notification_topics ?? base.immediate_notification_topics)],
    batching_preference: raw.batching_preference ?? base.batching_preference,
    ...(raw.escalation_routing_notes?.trim()
      ? { escalation_routing_notes: raw.escalation_routing_notes }
      : {}),
  };
}

export { ESCALATION_IMMEDIATE_TOPIC_KEYS };
