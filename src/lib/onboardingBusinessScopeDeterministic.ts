/**
 * Phase 4 Step 4E — deterministic `studio_business_profiles` JSON for one business-scope slice.
 *
 * V2 canonical model. Scope is expressed as three orthogonal concepts instead of a single
 * flat "offered services" list:
 *
 *   - Core services        — what the studio sells at the production level.
 *                             `photo`, `video`, `hybrid`, `content_creation`.
 *                             `video` = standalone videography/filmmaking.
 *                             `hybrid` = photographer-led shoot with motion capture alongside.
 *                             `content_creation` = lightweight commercial/social content production.
 *   - Specializations      — subject/domain the studio focuses on.
 *                             `weddings`, `elopements`, `engagements`, `events`,
 *                             `portraiture`, `commercial`.
 *   - Offer components     — deliverables, capture methods, and add-on capabilities.
 *                             `digital_files`, `albums`, `prints`, `raw_files`,
 *                             `film_photography`, `drone`, `highlight_films`,
 *                             `short_form_clips`, `super_8`, `livestream`.
 *
 * Storage mapping:
 *   - `studio_business_profiles.core_services`     ← `core_services`   (v2 adds this column)
 *   - `studio_business_profiles.service_types`     ← `specializations`
 *   - `studio_business_profiles.deliverable_types` ← `offer_components`
 *   - `studio_business_profiles.extensions`        ← `BusinessScopeExtensionsV2`
 *
 * Runtime branches only on canonical columns — never on the `extensions` JSONB.
 */
import type { Json } from "../types/database.types.ts";

export const BUSINESS_SCOPE_JSON_SCHEMA_VERSION = 2 as const;

/** Core service types — what the studio sells at the production level. */
export const CORE_SERVICE_TYPES = [
  "photo",
  "video",
  "hybrid",
  "content_creation",
] as const;
export type CoreServiceType = (typeof CORE_SERVICE_TYPES)[number];

/** Specializations — subject/domain a studio works in. */
export const SPECIALIZATION_TYPES = [
  "weddings",
  "elopements",
  "engagement",
  "portraiture",
  "family_maternity",
  "boudoir",
  "commercial",
  "general_events",
] as const;
export type SpecializationType = (typeof SPECIALIZATION_TYPES)[number];

/**
 * Offer components — the full menu of deliverables, capture methods, post-prod
 * options, on-site additions, rights, and add-ons that can live inside a
 * studio package.
 *
 * The list is grouped by prefix so a runtime reader can recognize the group
 * without consulting the UI grouping config:
 *
 *   - `digital_*`     — digital delivery method (Photo group)
 *   - `album_*`       — album product type (Photo group)
 *   - `print_*`       — print product type (Photo group)
 *   - `analog_*`      — analog/specialty capture (Photo group)
 *   - `post_*`        — post-production option (Photo group)
 *   - `onsite_*`      — on-site team addition (Photo group)
 *   - `rights_*`      — rights/usage license (Photo group)
 *   - `vfilm_*`       — edited film deliverable (Video group)
 *   - `vlong_*`       — long-form video deliverable (Video group)
 *   - `vsocial_*`     — social/fast-turnaround video (Video group)
 *   - `vassets_*`     — video raw asset/license (Video group)
 *   - `vspecialty_*`  — specialty video capture (Video group)
 *   - `cc_*`          — content-creation deliverable (Content Creation group)
 *   - `addon_*`       — cross-service add-on (always available)
 *
 * UI grouping/visibility lives in `onboardingOfferComponentGroups.ts`; this
 * file owns only the canonical enum + storage shape.
 */
export const OFFER_COMPONENT_TYPES = [
  // Photo — digital delivery
  "digital_online_gallery",
  "digital_usb_box",
  "digital_highres_download",
  "digital_websize_only",
  // Photo — physical media
  "album_fine_art",
  "album_parent",
  "print_fine_art",
  "print_framed",
  // Photo — analog / specialty capture
  "analog_35mm",
  "analog_medium_format",
  "analog_polaroid",
  // Photo — post-production
  "post_high_end_retouch",
  "post_ai_culling",
  "post_24h_sneaks",
  // Photo — on-site
  "onsite_second_photographer",
  "onsite_assistant_lighting",
  // Photo — rights
  "rights_full_raw_transfer",
  "rights_commercial_license",
  "rights_personal_only",
  // Video — edited films
  "vfilm_cinematic_highlight",
  "vfilm_feature",
  "vfilm_teaser",
  // Video — long form
  "vlong_full_ceremony",
  "vlong_full_speeches",
  "vlong_multicam_doc",
  // Video — social / fast turnaround
  "vsocial_same_day_edit",
  "vsocial_reels",
  "vsocial_4k_vertical",
  // Video — assets
  "vassets_full_unedited",
  "vassets_licensed_music",
  "vassets_sound_design",
  // Video — specialty capture
  "vspecialty_drone_aerial",
  "vspecialty_fpv_drone",
  "vspecialty_livestream",
  // Content creation — mobile-first
  "cc_mobile_raw_clips",
  "cc_mobile_bts",
  "cc_mobile_day_in_life",
  // Content creation — speed
  "cc_speed_instant_turnaround",
  "cc_speed_live_posting",
  // Content creation — editing styles
  "cc_edit_trending_audio",
  "cc_edit_tiktok",
  "cc_edit_capcut_templates",
  // Cross-service — logistics
  "addon_travel_included",
  "addon_destination_fee",
  "addon_additional_hours",
  "addon_overnight_stay",
  // Cross-service — admin / priority
  "addon_priority_delivery",
  "addon_rush_fee",
  "addon_nda_private_gallery",
  // Cross-service — legacy / archival
  "addon_hard_drive_archival",
  "addon_10yr_cloud_storage",
] as const;
export type OfferComponentType = (typeof OFFER_COMPONENT_TYPES)[number];

/** Where the studio works (geographic_scope). */
export type GeographyScopeMode =
  | "local_only"
  | "domestic"
  | "regional"
  | "europe"
  | "worldwide";

/** How travel is handled (travel_policy). */
export type TravelPolicyMode =
  | "travels_freely"
  | "selective_travel"
  | "no_travel"
  | "destination_minimums";

/**
 * Deterministic outcomes when a lead is outside business scope (lead_acceptance_rules).
 */
export type OutOfScopeLeadAction =
  | "decline_politely"
  | "route_to_operator"
  | "escalate";

/**
 * Onboarding capture for the §5.1A slice — all fields required for a complete 4E row;
 * callers may omit the whole object until the step is done.
 */
export type BusinessScopeDeterministicV2 = {
  schema_version: typeof BUSINESS_SCOPE_JSON_SCHEMA_VERSION;
  /** What the studio sells at the production level. */
  core_services: readonly CoreServiceType[];
  /** What the studio specializes in (subject/domain). */
  specializations: readonly SpecializationType[];
  /** Deliverables + capture methods + add-on capabilities. */
  offer_components: readonly OfferComponentType[];
  geography: {
    mode: GeographyScopeMode;
    /** Optional block list (region labels or codes). */
    blocked_regions?: readonly string[];
  };
  travel_policy_mode: TravelPolicyMode;
  lead_acceptance: {
    when_service_not_offered: OutOfScopeLeadAction;
    when_geography_not_in_scope: OutOfScopeLeadAction;
  };
};

export type StudioBusinessProfileJsonSlice = {
  core_services: Json;
  service_types: Json;
  geographic_scope: Json;
  travel_policy: Json;
  lead_acceptance_rules: Json;
  deliverable_types: Json;
};

/**
 * Maps typed business scope into JSONB payloads for `studio_business_profiles`.
 * Safe to merge over defaults — does not perform I/O.
 *
 *   - `core_services`      → `studio_business_profiles.core_services`
 *   - `specializations`    → `studio_business_profiles.service_types`
 *   - `offer_components`   → `studio_business_profiles.deliverable_types`
 */
export function buildStudioBusinessProfileJsonFromBusinessScope(
  scope: BusinessScopeDeterministicV2,
): StudioBusinessProfileJsonSlice {
  const v = BUSINESS_SCOPE_JSON_SCHEMA_VERSION;

  const core_services = [...scope.core_services] as unknown as Json;
  const service_types = [...scope.specializations] as unknown as Json;
  const deliverable_types = [...scope.offer_components] as unknown as Json;

  const geographic_scope = {
    schema_version: v,
    mode: scope.geography.mode,
    ...(scope.geography.blocked_regions &&
    scope.geography.blocked_regions.length > 0
      ? { blocked_regions: [...scope.geography.blocked_regions] }
      : {}),
  } as unknown as Json;

  const travel_policy = {
    schema_version: v,
    mode: scope.travel_policy_mode,
  } as unknown as Json;

  const lead_acceptance_rules = {
    schema_version: v,
    when_service_not_offered: scope.lead_acceptance.when_service_not_offered,
    when_geography_not_in_scope:
      scope.lead_acceptance.when_geography_not_in_scope,
  } as unknown as Json;

  return {
    core_services,
    service_types,
    geographic_scope,
    travel_policy,
    lead_acceptance_rules,
    deliverable_types,
  };
}

// ---------------------------------------------------------------------------
//  Legacy v1 → v2 normalization
// ---------------------------------------------------------------------------
//
//  The v1 model had a single flat `offered_services` list that mixed
//  domains (weddings, family) and media (video). It also had a
//  `allowed_deliverables` list with 5 values, and an `extensions` blob
//  with a 3-tier "service taxonomy" (media / categories / capabilities)
//  plus legacy flat `selected_service_labels`. Those shapes are gone.
//  The helpers here translate pre-v2 blobs so drafts saved before this
//  rework don't silently lose data on first open.

const V1_SPECIALIZATION_MAP: Record<string, SpecializationType> = {
  weddings: "weddings",
  elopements: "elopements",
  engagements: "engagement",
  events: "general_events",
  family: "family_maternity",
  maternity: "family_maternity",
  newborn: "family_maternity",
  brand: "commercial",
  editorial: "commercial",
  corporate: "commercial",
};

const V1_DELIVERABLE_MAP: Record<string, OfferComponentType> = {
  digital_gallery: "digital_online_gallery",
  album: "album_fine_art",
  prints: "print_fine_art",
  raw_files: "rights_full_raw_transfer",
  video_deliverable: "vfilm_cinematic_highlight",
};

const V1_CAPABILITY_MAP: Record<string, OfferComponentType> = {
  drone: "vspecialty_drone_aerial",
  super_8: "analog_35mm", // Super 8 has no direct slot; bucket under analog as best-effort
  highlight_film: "vfilm_cinematic_highlight",
  short_form_social_clips: "vsocial_reels",
  teaser_clips: "vfilm_teaser",
};

/**
 * Old-v2 → new-v2 specialization map. Used when a draft was saved between
 * the first v2 rollout (6 specializations) and this expanded set (8).
 *
 *   - `engagements` is now singular `engagement`
 *   - `events` is now `general_events` (clearer alongside corporate-event coverage)
 *   - everything else is preserved
 */
const V2_OLD_SPECIALIZATION_MAP: Record<string, SpecializationType> = {
  weddings: "weddings",
  elopements: "elopements",
  engagements: "engagement",
  events: "general_events",
  portraiture: "portraiture",
  commercial: "commercial",
};

/**
 * Old-v2 → new-v2 offer-component map. The first v2 enum had a flat 10-value
 * list. The expanded model splits each into a more specific slot under one of
 * the four UI groups.
 *
 *   - `super_8` has no direct equivalent in the new menu (Polaroid covers
 *     instant film, 35mm/medium covers stills); we drop it on migration.
 */
const V2_OLD_OFFER_MAP: Record<string, OfferComponentType> = {
  digital_files: "digital_online_gallery",
  albums: "album_fine_art",
  prints: "print_fine_art",
  raw_files: "rights_full_raw_transfer",
  film_photography: "analog_35mm",
  drone: "vspecialty_drone_aerial",
  highlight_films: "vfilm_cinematic_highlight",
  short_form_clips: "vsocial_reels",
  livestream: "vspecialty_livestream",
  // `super_8` intentionally absent — no precise new slot
};

/**
 * Best-effort upgrade of an old-v2 specializations array to the new
 * canonical set. Unknown values are dropped, duplicates collapsed.
 */
export function migrateOldV2SpecializationsToNew(
  input: readonly unknown[] | undefined,
): SpecializationType[] {
  if (!Array.isArray(input)) return [];
  const out: SpecializationType[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    if ((SPECIALIZATION_TYPES as readonly string[]).includes(v)) {
      pushUnique(out, v as SpecializationType);
      continue;
    }
    const mapped = V2_OLD_SPECIALIZATION_MAP[v];
    if (mapped) pushUnique(out, mapped);
  }
  return out;
}

/**
 * Best-effort upgrade of an old-v2 offer-components array to the new
 * canonical set. Unknown values are dropped (notably `super_8`).
 */
export function migrateOldV2OfferComponentsToNew(
  input: readonly unknown[] | undefined,
): OfferComponentType[] {
  if (!Array.isArray(input)) return [];
  const out: OfferComponentType[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    if ((OFFER_COMPONENT_TYPES as readonly string[]).includes(v)) {
      pushUnique(out, v as OfferComponentType);
      continue;
    }
    const mapped = V2_OLD_OFFER_MAP[v];
    if (mapped) pushUnique(out, mapped);
  }
  return out;
}

function pushUnique<T>(arr: T[], v: T): void {
  if (!arr.includes(v)) arr.push(v);
}

/**
 * Best-effort translation of old v1 canonical lists + legacy extension
 * subtrees into v2 canonical lists. Unknown values are dropped.
 *
 * Input keys recognised:
 *   - `offered_services: string[]`       (old canonical, v1 enum)
 *   - `allowed_deliverables: string[]`   (old deliverable enum)
 *   - `selected_media_groups: {id}[]`    (old 3-tier stage 1)
 *   - `selected_service_capabilities: {id}[]` (old 3-tier stage 3)
 */
export function migrateLegacyCanonicalsToV2(input: {
  offered_services?: readonly unknown[];
  allowed_deliverables?: readonly unknown[];
  selected_media_groups?: readonly unknown[];
  selected_service_capabilities?: readonly unknown[];
}): {
  core_services: CoreServiceType[];
  specializations: SpecializationType[];
  offer_components: OfferComponentType[];
} {
  const core: CoreServiceType[] = [];
  const specs: SpecializationType[] = [];
  const offers: OfferComponentType[] = [];

  const legacyCanonicals = (input.offered_services ?? []).filter(
    (x): x is string => typeof x === "string",
  );
  // Any legacy non-video canonical signals photo-side production. `video` was
  // the only medium expressed at the old Layer A.
  let sawAnyNonVideo = false;
  for (const c of legacyCanonicals) {
    if (c === "video") {
      pushUnique(core, "video");
      continue;
    }
    const mapped = V1_SPECIALIZATION_MAP[c];
    if (mapped) {
      pushUnique(specs, mapped);
      sawAnyNonVideo = true;
    }
  }

  const legacyMedia = (input.selected_media_groups ?? [])
    .map((r): string | null => {
      if (!r || typeof r !== "object") return null;
      const id = (r as { id?: unknown }).id;
      return typeof id === "string" ? id : null;
    })
    .filter((x): x is string => x !== null);
  if (legacyMedia.includes("photo")) pushUnique(core, "photo");
  if (legacyMedia.includes("video")) pushUnique(core, "video");
  if (sawAnyNonVideo && !core.includes("photo")) core.unshift("photo");

  const legacyDeliverables = (input.allowed_deliverables ?? []).filter(
    (x): x is string => typeof x === "string",
  );
  for (const d of legacyDeliverables) {
    const mapped = V1_DELIVERABLE_MAP[d];
    if (mapped) pushUnique(offers, mapped);
  }

  const legacyCapabilities = (input.selected_service_capabilities ?? [])
    .map((r): string | null => {
      if (!r || typeof r !== "object") return null;
      const id = (r as { id?: unknown }).id;
      return typeof id === "string" ? id : null;
    })
    .filter((x): x is string => x !== null);
  for (const c of legacyCapabilities) {
    const mapped = V1_CAPABILITY_MAP[c];
    if (mapped) pushUnique(offers, mapped);
  }

  return { core_services: core, specializations: specs, offer_components: offers };
}

// ---------------------------------------------------------------------------
//  Guards
// ---------------------------------------------------------------------------

const CORE_SET: ReadonlySet<string> = new Set(CORE_SERVICE_TYPES);
const SPEC_SET: ReadonlySet<string> = new Set(SPECIALIZATION_TYPES);
const OFFER_SET: ReadonlySet<string> = new Set(OFFER_COMPONENT_TYPES);

export function isCoreServiceType(v: unknown): v is CoreServiceType {
  return typeof v === "string" && CORE_SET.has(v);
}
export function isSpecializationType(v: unknown): v is SpecializationType {
  return typeof v === "string" && SPEC_SET.has(v);
}
export function isOfferComponentType(v: unknown): v is OfferComponentType {
  return typeof v === "string" && OFFER_SET.has(v);
}
