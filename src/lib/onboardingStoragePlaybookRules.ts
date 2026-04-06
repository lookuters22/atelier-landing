/**
 * Phase 4 — `playbook_rules` storage path (Steps 4C–4D).
 *
 * Tenant-global or channel-wide rules only (DATABASE_SCHEMA §5.17).
 * Do not put wedding-specific, person-specific, or thread-specific exceptions here.
 *
 * Step 4D: baseline restricted action classes (narrow slice: `discount_quote` only here).
 * Step 4D.1: scheduling action-permission matrix → `onboardingActionPermissionMatrixScheduling.ts`.
 *
 * `import type` from `onboardingV4Payload.ts` avoids a runtime circular dependency.
 */
import type { EscalationPreferencesCapture } from "./onboardingCaptureEscalationPreferences.ts";
import { isEscalationPreferencesCaptureMeaningful } from "./onboardingCaptureEscalationPreferences.ts";
import {
  filterGlobalSeedsSupersededBySchedulingMatrix,
  schedulingActionPermissionMatrixToPlaybookRules,
} from "./onboardingActionPermissionMatrixScheduling.ts";
import type { SchedulingActionPermissionMatrix } from "./onboardingActionPermissionMatrixScheduling.ts";
import type {
  OnboardingPlaybookSeed,
  PlaybookRuleInsert,
} from "./onboardingV4Payload.ts";

export type { SchedulingActionPermissionMatrix };

/** Stable action_key for onboarding-derived escalation routing (§5.17 suggested topics include `escalation`). */
export const ONBOARDING_ESCALATION_ROUTING_ACTION_KEY =
  "operator_notification_routing";

/** DATABASE_SCHEMA §5.17 suggested action family — Step 4D default: `ask_first`. */
export const ACTION_KEY_DISCOUNT_QUOTE = "discount_quote";

const DISCOUNT_QUOTE_DEFAULT_INSTRUCTION = JSON.stringify({
  kind: "default_action_class_v1",
  action_key: ACTION_KEY_DISCOUNT_QUOTE,
  decision_mode: "ask_first",
  note: "Baseline from onboarding: do not commit discount terms without operator approval.",
});

function hasGlobalDiscountQuoteSeed(seeds: OnboardingPlaybookSeed[]): boolean {
  return seeds.some(
    (s) => s.action_key === ACTION_KEY_DISCOUNT_QUOTE && s.scope === "global",
  );
}

function hasGlobalEscalationRoutingSeed(seeds: OnboardingPlaybookSeed[]): boolean {
  return seeds.some(
    (s) =>
      s.action_key === ONBOARDING_ESCALATION_ROUTING_ACTION_KEY &&
      s.scope === "global",
  );
}

/**
 * Tenant-global default for `discount_quote` when onboarding does not supply an explicit global seed.
 * execute_v3 Step 4D: `discount_quote = ask_first`.
 */
export function buildDefaultDiscountQuotePlaybookRule(
  photographerId: string,
): PlaybookRuleInsert {
  return {
    photographer_id: photographerId,
    scope: "global",
    channel: null,
    action_key: ACTION_KEY_DISCOUNT_QUOTE,
    topic: "pricing",
    decision_mode: "ask_first",
    instruction: DISCOUNT_QUOTE_DEFAULT_INSTRUCTION,
    source_type: "onboarding_default",
    confidence_label: "explicit",
    is_active: true,
  };
}

function mapSeedToInsert(
  photographerId: string,
  s: OnboardingPlaybookSeed,
): PlaybookRuleInsert {
  return {
    photographer_id: photographerId,
    scope: s.scope,
    channel: s.scope === "channel" ? (s.channel ?? "email") : null,
    action_key: s.action_key,
    topic: s.topic,
    decision_mode: s.decision_mode,
    instruction: s.instruction,
    source_type: s.source_type ?? "onboarding",
    confidence_label: s.confidence_label ?? "explicit",
    is_active: s.is_active ?? true,
  };
}

/**
 * Serializes tenant-wide escalation preferences for `playbook_rules.instruction`.
 * Structured JSON keeps the runtime from relying on ad hoc prose alone.
 */
export function escalationPreferencesToPlaybookInstruction(
  c: EscalationPreferencesCapture,
): string {
  const o: Record<string, unknown> = {
    kind: "escalation_preferences_v1",
    immediate_notification_topics: c.immediate_notification_topics,
    batching_preference: c.batching_preference,
  };
  const notes = c.escalation_routing_notes?.trim();
  if (notes) o.notes = notes;
  return JSON.stringify(o);
}

function escalationToGlobalRule(
  photographerId: string,
  c: EscalationPreferencesCapture,
): PlaybookRuleInsert {
  return {
    photographer_id: photographerId,
    scope: "global",
    channel: null,
    action_key: ONBOARDING_ESCALATION_ROUTING_ACTION_KEY,
    topic: "escalation",
    decision_mode: "auto",
    instruction: escalationPreferencesToPlaybookInstruction(c),
    source_type: "onboarding",
    confidence_label: "explicit",
    is_active: true,
  };
}

/**
 * Maps onboarding playbook seeds (and optional escalation capture) to `playbook_rules` insert rows.
 * Escalation preferences become one **global** rule unless onboarding already supplied a global
 * seed for `operator_notification_routing` (explicit seed wins over derived rule).
 */
export function buildPlaybookRuleInsertsFromOnboarding(
  photographerId: string,
  playbookSeeds: OnboardingPlaybookSeed[],
  escalationPreferences?: EscalationPreferencesCapture | undefined,
  schedulingMatrix?: SchedulingActionPermissionMatrix | undefined,
): PlaybookRuleInsert[] {
  const seedsForMapping = filterGlobalSeedsSupersededBySchedulingMatrix(
    playbookSeeds,
    schedulingMatrix,
  );

  const fromSeeds = seedsForMapping.map((s) =>
    mapSeedToInsert(photographerId, s),
  );

  const fromSchedulingMatrix = schedulingMatrix
    ? schedulingActionPermissionMatrixToPlaybookRules(
        photographerId,
        schedulingMatrix,
      )
    : [];

  const withDiscountDefault = hasGlobalDiscountQuoteSeed(playbookSeeds)
    ? fromSeeds
    : [...fromSeeds, buildDefaultDiscountQuotePlaybookRule(photographerId)];

  const core = [...withDiscountDefault, ...fromSchedulingMatrix];

  if (
    escalationPreferences &&
    isEscalationPreferencesCaptureMeaningful(escalationPreferences) &&
    !hasGlobalEscalationRoutingSeed(playbookSeeds)
  ) {
    return [...core, escalationToGlobalRule(photographerId, escalationPreferences)];
  }

  return core;
}
