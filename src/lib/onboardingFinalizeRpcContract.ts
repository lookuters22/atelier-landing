/**
 * Contract for `public.finalize_onboarding_briefing_v1` (Slice 2 RPC).
 * Used by verification tests and docs — **must stay aligned** with:
 * `supabase/migrations/20260430200000_finalize_onboarding_briefing_v1.sql`
 */
import {
  KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
  ONBOARDING_OWNED_PLAYBOOK_RULE_SOURCE_TYPES,
} from "./onboardingRuntimeOwnership.ts";

/** Legacy `source_type` values the RPC still deletes for cohort cleanup (migration includes these). */
export const FINALIZE_ONBOARDING_PLAYBOOK_DELETE_LEGACY_SOURCE_TYPES = [
  "onboarding",
  "onboarding_default",
  "onboarding_matrix",
] as const;

/**
 * Exact `source_type` list used in `DELETE FROM playbook_rules ... IN (...)`.
 * Onboarding mapping must only replace rows in this cohort; other tenant rules are preserved.
 */
export const FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES = [
  ...ONBOARDING_OWNED_PLAYBOOK_RULE_SOURCE_TYPES,
  ...FINALIZE_ONBOARDING_PLAYBOOK_DELETE_LEGACY_SOURCE_TYPES,
] as const;

/** `knowledge_base` rows deleted when `metadata->>'onboarding_source' = this value`. */
export const FINALIZE_ONBOARDING_KB_DELETE_ONBOARDING_SOURCE =
  KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE;
