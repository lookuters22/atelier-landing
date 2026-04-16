/**
 * Phase 4 — onboarding payload shape and storage mapping.
 *
 * Step 4C: split output into layers (this module orchestrates; `playbook_rules` path
 * is delegated to `onboardingStoragePlaybookRules.ts`). Step 4D.1: scheduling
 * action-permission matrix → `onboardingActionPermissionMatrixScheduling.ts`.
 * Step 4E: deterministic business scope JSON → `onboardingBusinessScopeDeterministic.ts`.
 * Step 4F: structured KB seeds (not prose-only blobs) → `onboardingKnowledgeBaseStructured.ts`.
 *
 * - `photographers.settings` — identity + setup metadata only
 * - `studio_business_profiles` — what the studio offers (§5.1A)
 * - `playbook_rules` — how Ana behaves — tenant-global / channel-wide only (§5.17)
 * - optional `knowledge_base` — reusable standard knowledge (§5.14)
 *
 * Callers merge `settingsPatch` via `mergeOnboardingSettingsPatch` / writers.
 * DB I/O is left to completion workers/UI.
 */
import type { Json } from "../types/database.types.ts";
import type { PhotographerSettings } from "../types/photographerSettings.types.ts";
import type { EscalationPreferencesCapture } from "./onboardingCaptureEscalationPreferences.ts";
import type { SchedulingActionPermissionMatrix } from "./onboardingActionPermissionMatrixScheduling.ts";
import {
  buildStudioBusinessProfileJsonFromBusinessScope,
  type BusinessScopeDeterministicV1,
} from "./onboardingBusinessScopeDeterministic.ts";

export type { BusinessScopeDeterministicV1 } from "./onboardingBusinessScopeDeterministic.ts";
import {
  businessScopeExtensionsToJson,
  resolveBusinessScopeExtensions,
  type BusinessScopeExtensionsV1,
} from "./onboardingBusinessScopeExtensions.ts";

export type { BusinessScopeExtensionsV1 } from "./onboardingBusinessScopeExtensions.ts";
import { buildKnowledgeBaseSeedInsertsFromOnboarding } from "./onboardingKnowledgeBaseStructured.ts";

export type {
  KnowledgeStructuredBodyV1,
  OnboardingKnowledgeSeed,
} from "./onboardingKnowledgeBaseStructured.ts";
import { buildPlaybookRuleInsertsFromOnboarding } from "./onboardingStoragePlaybookRules.ts";
import { mergePhotographerSettings } from "./photographerSettings.ts";

// ── Payload (logical onboarding form output) ─────────────────────

/** Identity + setup metadata → `photographers.settings` (§5.1). */
export type OnboardingSettingsIdentity = {
  studio_name?: string;
  manager_name?: string;
  photographer_names?: string;
  timezone?: string;
  currency?: string;
  whatsapp_number?: string;
  admin_mobile_number?: string;
};

/** Versions / completion markers written to settings JSONB. */
export type OnboardingSettingsMeta = {
  /** ISO 8601 — when onboarding is submitted as complete */
  onboarding_completed_at?: string;
  playbook_version?: string | number;
  business_profile_version?: string | number;
};

/**
 * Structured studio scope → `studio_business_profiles` JSONB columns (§5.1A).
 * Arrays/objects are stored as-is; runtime validates shape over time.
 */
export type OnboardingStudioScope = {
  service_types?: Json;
  service_availability?: Json;
  geographic_scope?: Json;
  travel_policy?: Json;
  booking_scope?: Json;
  client_types?: Json;
  deliverable_types?: Json;
  lead_acceptance_rules?: Json;
  language_support?: Json;
  team_structure?: Json;
};

/** One seed rule → `playbook_rules` insert (§5.17). */
export type OnboardingPlaybookSeed = {
  scope: "global" | "channel";
  channel?: "email" | "web" | "whatsapp_operator" | "manual" | "system" | null;
  action_key: string;
  topic: string;
  decision_mode: "auto" | "draft_only" | "ask_first" | "forbidden";
  instruction: string;
  /** Stored as `source_type`; default onboarding */
  source_type?: string;
  confidence_label?: string;
  is_active?: boolean;
};

/** Canonical Phase 4 onboarding payload. */
export type OnboardingPayloadV4 = {
  settings_identity: OnboardingSettingsIdentity;
  settings_meta?: OnboardingSettingsMeta;
  studio_scope: OnboardingStudioScope;
  playbook_seeds: OnboardingPlaybookSeed[];
  /** Maps to global `playbook_rules` only — see `onboardingStoragePlaybookRules.ts`. */
  escalation_preferences?: EscalationPreferencesCapture;
  /**
   * Step 4D.1 — explicit `decision_mode` per scheduling action_key (`schedule_call`, `move_call`).
   * When set, supersedes global `playbook_seeds` for those keys.
   */
  scheduling_action_permission_matrix?: SchedulingActionPermissionMatrix;
  /**
   * Step 4E — when set, overrides loose `studio_scope` JSON for service/geography/travel/
   * lead acceptance/deliverables with deterministic structures (see helper module).
   */
  business_scope_deterministic?: BusinessScopeDeterministicV1;
  /**
   * Custom labels / notes beyond fixed enums — maps to `studio_business_profiles.extensions`.
   * Does not add new canonical runtime branches; see `onboardingBusinessScopeExtensions.ts`.
   */
  business_scope_extensions?: BusinessScopeExtensionsV1;
  knowledge_seeds?: OnboardingKnowledgeSeed[];
};

// ── Defaults for JSONB NOT NULL columns on studio_business_profiles ─────────

const EMPTY_ARRAY: Json = [];
const EMPTY_OBJECT: Json = {};

// ── Mapping ───────────────────────────────────────────────────────

export type StudioBusinessProfileInsert = {
  photographer_id: string;
  service_types: Json;
  service_availability: Json;
  geographic_scope: Json;
  travel_policy: Json;
  booking_scope: Json;
  client_types: Json;
  deliverable_types: Json;
  lead_acceptance_rules: Json;
  language_support: Json;
  team_structure: Json;
  /** `BusinessScopeExtensionsV1` JSON — UI/review/hydration; not deterministic scope branching. */
  extensions: Json;
  source_type: string;
};

export type PlaybookRuleInsert = {
  photographer_id: string;
  scope: OnboardingPlaybookSeed["scope"];
  channel: OnboardingPlaybookSeed["channel"] | null;
  action_key: string;
  topic: string;
  decision_mode: OnboardingPlaybookSeed["decision_mode"];
  instruction: string;
  source_type: string;
  confidence_label: string;
  is_active: boolean;
};

export type KnowledgeBaseSeedInsert = {
  photographer_id: string;
  document_type: string;
  content: string;
  metadata: Json;
};

/** Settings JSON patch: contract keys + `business_profile_version` (§5.1 target key). */
export type OnboardingSettingsPatch = Partial<PhotographerSettings> &
  Pick<OnboardingSettingsMeta, "onboarding_completed_at" | "playbook_version"> & {
    business_profile_version?: string | number;
  };

export type OnboardingStorageMapping = {
  /** Merge into `photographers.settings`. */
  settingsPatch: OnboardingSettingsPatch;
  /** Single row for `studio_business_profiles` (upsert by photographer_id in a later step). */
  studioBusinessProfile: StudioBusinessProfileInsert;
  /** Batch insert `playbook_rules`. */
  playbookRules: PlaybookRuleInsert[];
  /** Batch insert `knowledge_base` (no embedding). */
  knowledgeBaseSeeds: KnowledgeBaseSeedInsert[];
};

function jsonOr<T extends Json>(v: unknown, fallback: T): Json {
  if (v === undefined || v === null) return fallback;
  return v as Json;
}

/**
 * Deterministic mapping from the canonical onboarding payload to four storage buckets.
 * Does not perform I/O.
 */
export function mapOnboardingPayloadToStorage(
  photographerId: string,
  payload: OnboardingPayloadV4,
): OnboardingStorageMapping {
  const id = payload.settings_identity;

  const settingsPatch: OnboardingSettingsPatch = {};
  if (id.studio_name !== undefined) settingsPatch.studio_name = id.studio_name;
  if (id.manager_name !== undefined) settingsPatch.manager_name = id.manager_name;
  if (id.photographer_names !== undefined) {
    settingsPatch.photographer_names = id.photographer_names;
  }
  if (id.timezone !== undefined) settingsPatch.timezone = id.timezone;
  if (id.currency !== undefined) settingsPatch.currency = id.currency;
  if (id.whatsapp_number !== undefined) settingsPatch.whatsapp_number = id.whatsapp_number;
  if (id.admin_mobile_number !== undefined) {
    settingsPatch.admin_mobile_number = id.admin_mobile_number;
  }

  const meta = payload.settings_meta;
  if (meta?.onboarding_completed_at !== undefined) {
    settingsPatch.onboarding_completed_at = meta.onboarding_completed_at;
  }
  if (meta?.playbook_version !== undefined) {
    settingsPatch.playbook_version = meta.playbook_version;
  }
  if (meta?.business_profile_version !== undefined) {
    settingsPatch.business_profile_version = meta.business_profile_version;
  }

  const sc = payload.studio_scope;
  const bsSlice =
    payload.business_scope_deterministic &&
    buildStudioBusinessProfileJsonFromBusinessScope(
      payload.business_scope_deterministic,
    );

  const studioBusinessProfile: StudioBusinessProfileInsert = {
    photographer_id: photographerId,
    service_types: bsSlice?.service_types ?? jsonOr(sc.service_types, EMPTY_ARRAY),
    service_availability: jsonOr(sc.service_availability, EMPTY_OBJECT),
    geographic_scope:
      bsSlice?.geographic_scope ?? jsonOr(sc.geographic_scope, EMPTY_OBJECT),
    travel_policy: bsSlice?.travel_policy ?? jsonOr(sc.travel_policy, EMPTY_OBJECT),
    booking_scope: jsonOr(sc.booking_scope, EMPTY_OBJECT),
    client_types: jsonOr(sc.client_types, EMPTY_ARRAY),
    deliverable_types:
      bsSlice?.deliverable_types ?? jsonOr(sc.deliverable_types, EMPTY_ARRAY),
    lead_acceptance_rules:
      bsSlice?.lead_acceptance_rules ??
      jsonOr(sc.lead_acceptance_rules, EMPTY_OBJECT),
    language_support: jsonOr(sc.language_support, EMPTY_ARRAY),
    team_structure: jsonOr(sc.team_structure, EMPTY_OBJECT),
    extensions: businessScopeExtensionsToJson(
      resolveBusinessScopeExtensions(payload.business_scope_extensions),
    ),
    source_type: "onboarding",
  };

  const playbookRules = buildPlaybookRuleInsertsFromOnboarding(
    photographerId,
    payload.playbook_seeds,
    payload.escalation_preferences,
    payload.scheduling_action_permission_matrix,
  );

  const knowledgeBaseSeeds: KnowledgeBaseSeedInsert[] =
    buildKnowledgeBaseSeedInsertsFromOnboarding(
      photographerId,
      payload.knowledge_seeds,
    );

  return {
    settingsPatch,
    studioBusinessProfile,
    playbookRules,
    knowledgeBaseSeeds,
  };
}

/**
 * Merge onboarding settings patch into existing `photographers.settings` JSON.
 * Applies `mergePhotographerSettings` for contract keys, then `business_profile_version`
 * (not yet in PHOTOGRAPHER_SETTINGS_KEYS merge list).
 */
export function mergeOnboardingSettingsPatch(
  existing: Record<string, unknown> | null | undefined,
  patch: OnboardingSettingsPatch,
): Record<string, unknown> {
  const { business_profile_version, ...contract } = patch;
  let merged = mergePhotographerSettings(existing, contract);
  if (business_profile_version !== undefined) {
    merged = { ...merged, business_profile_version };
  }
  return merged;
}
