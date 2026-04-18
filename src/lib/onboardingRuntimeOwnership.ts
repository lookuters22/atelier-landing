/**
 * Stable ownership markers for onboarding → canonical runtime mapping (Slice 1).
 *
 * The editor snapshot (`settings.onboarding_briefing_v1`) is not runtime truth.
 * Finalization will replace only rows tagged with these cohorts — never manually curated data.
 *
 * @see docs/v3/ONBOARDING_RUNTIME_FINALIZATION_IMPLEMENTATION_PACKET.md
 */

/** Primary tag shared by explicit playbook seeds and `knowledge_base.metadata.onboarding_source`. */
export const ONBOARDING_BRIEFING_V1 = "onboarding_briefing_v1" as const;

/** `playbook_rules.source_type` — explicit seeds from `payload.playbook_seeds` (default when omitted). */
export const PLAYBOOK_RULE_SOURCE_ONBOARDING_BRIEFING_V1 = ONBOARDING_BRIEFING_V1;

/** `playbook_rules.source_type` — derived default `discount_quote` when no global seed exists. */
export const PLAYBOOK_RULE_SOURCE_ONBOARDING_BRIEFING_DEFAULT_V1 =
  "onboarding_briefing_default_v1" as const;

/** `playbook_rules.source_type` — scheduling action-permission matrix rows. */
export const PLAYBOOK_RULE_SOURCE_ONBOARDING_BRIEFING_MATRIX_V1 =
  "onboarding_briefing_matrix_v1" as const;

/** `playbook_rules.source_type` — derived escalation routing global rule. */
export const PLAYBOOK_RULE_SOURCE_ONBOARDING_BRIEFING_ESCALATION_V1 =
  "onboarding_briefing_escalation_v1" as const;

/**
 * All `playbook_rules.source_type` values owned by onboarding briefing mapping.
 * Server-side finalization may DELETE WHERE photographer_id = $1 AND source_type IN (...).
 */
export const ONBOARDING_OWNED_PLAYBOOK_RULE_SOURCE_TYPES = [
  PLAYBOOK_RULE_SOURCE_ONBOARDING_BRIEFING_V1,
  PLAYBOOK_RULE_SOURCE_ONBOARDING_BRIEFING_DEFAULT_V1,
  PLAYBOOK_RULE_SOURCE_ONBOARDING_BRIEFING_MATRIX_V1,
  PLAYBOOK_RULE_SOURCE_ONBOARDING_BRIEFING_ESCALATION_V1,
] as const;

export type OnboardingOwnedPlaybookRuleSourceType =
  (typeof ONBOARDING_OWNED_PLAYBOOK_RULE_SOURCE_TYPES)[number];

/** `knowledge_base.metadata` key for onboarding ownership (stable for finalizer DELETE/INSERT). */
export const KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_KEY = "onboarding_source" as const;

/** `knowledge_base.metadata.onboarding_source` — matches {@link ONBOARDING_BRIEFING_V1}. */
export const KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE = ONBOARDING_BRIEFING_V1;
