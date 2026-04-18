import {
  BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
  CORE_SERVICE_TYPES,
  OFFER_COMPONENT_TYPES,
  SPECIALIZATION_TYPES,
  migrateLegacyCanonicalsToV2,
  migrateOldV2OfferComponentsToNew,
  migrateOldV2SpecializationsToNew,
  type BusinessScopeDeterministicV2,
  type CoreServiceType,
  type GeographyScopeMode,
  type OfferComponentType,
  type OutOfScopeLeadAction,
  type SpecializationType,
  type TravelPolicyMode,
} from "./onboardingBusinessScopeDeterministic.ts";
import type { Json } from "../types/database.types.ts";

/** Small allowlist for `studio_scope.language_support` (ISO 639-1). */
export const BRIEFING_LANGUAGE_CODES = ["en", "de", "fr", "it", "es", "sr", "hr", "pt", "nl"] as const;

export const CORE_SERVICE_LABELS: Record<CoreServiceType, string> = {
  photo: "Photo",
  video: "Video",
  hybrid: "Hybrid",
  content_creation: "Content creation",
};

/** Short tagline used by the selector cards to disambiguate Video vs Hybrid. */
export const CORE_SERVICE_TAGLINES: Record<CoreServiceType, string> = {
  photo: "Photography as the core craft",
  video: "Standalone videography and filmmaking",
  hybrid: "Photographer-led shoot with motion capture alongside",
  content_creation: "Lightweight commercial & social content",
};

export const SPECIALIZATION_LABELS: Record<SpecializationType, string> = {
  weddings: "Weddings",
  elopements: "Elopements",
  engagement: "Engagement",
  portraiture: "Portraiture",
  family_maternity: "Family & Maternity",
  boudoir: "Boudoir",
  commercial: "Commercial",
  general_events: "General events",
};

export const OFFER_COMPONENT_LABELS: Record<OfferComponentType, string> = {
  // Photo — digital delivery
  digital_online_gallery: "Online gallery (Pixieset / Pic-Time)",
  digital_usb_box: "USB box",
  digital_highres_download: "High-res download",
  digital_websize_only: "Web-size only",
  // Photo — physical media
  album_fine_art: "Fine art albums",
  album_parent: "Parent albums",
  print_fine_art: "Fine art prints",
  print_framed: "Framed prints",
  // Photo — analog / specialty
  analog_35mm: "35mm film photography",
  analog_medium_format: "Medium format film",
  analog_polaroid: "Polaroid / instant film",
  // Photo — post-production
  post_high_end_retouch: "High-end retouching (per image)",
  post_ai_culling: "AI-assisted culling",
  post_24h_sneaks: "24h sneak peeks",
  // Photo — on-site
  onsite_second_photographer: "Second photographer",
  onsite_assistant_lighting: "Assistant / lighting tech",
  // Photo — rights
  rights_full_raw_transfer: "Full RAW imagery transfer",
  rights_commercial_license: "Commercial usage license",
  rights_personal_only: "Personal use only",
  // Video — edited films
  vfilm_cinematic_highlight: "Cinematic highlight (3–5 min)",
  vfilm_feature: "Feature film (15–20 min)",
  vfilm_teaser: "Teaser / trailer (60 sec)",
  // Video — long form
  vlong_full_ceremony: "Full ceremony video",
  vlong_full_speeches: "Full speeches video",
  vlong_multicam_doc: "Multi-cam documentary edit",
  // Video — social / fast
  vsocial_same_day_edit: "Same day edit (SDE)",
  vsocial_reels: "Social media reels",
  vsocial_4k_vertical: "4K vertical edits",
  // Video — assets
  vassets_full_unedited: "Full unedited footage (RAW)",
  vassets_licensed_music: "Licensed music tracks",
  vassets_sound_design: "Sound design / foley",
  // Video — specialty
  vspecialty_drone_aerial: "Drone / aerial coverage",
  vspecialty_fpv_drone: "FPV drone",
  vspecialty_livestream: "Livestreaming",
  // Content creation — mobile
  cc_mobile_raw_clips: "Raw vertical clips (iPhone)",
  cc_mobile_bts: "Behind the scenes",
  cc_mobile_day_in_life: "Day in the life storytelling",
  // Content creation — speed
  cc_speed_instant_turnaround: "Instant turnaround (under 24h)",
  cc_speed_live_posting: "Live posting / story takeover",
  // Content creation — editing
  cc_edit_trending_audio: "Trending audio reels",
  cc_edit_tiktok: "TikTok-specific edits",
  cc_edit_capcut_templates: "CapCut templates",
  // Cross-service — logistics
  addon_travel_included: "Travel included",
  addon_destination_fee: "Destination fee",
  addon_additional_hours: "Additional hours (hourly rate)",
  addon_overnight_stay: "Overnight stay",
  // Cross-service — admin
  addon_priority_delivery: "Priority delivery (express editing)",
  addon_rush_fee: "Rush fee",
  addon_nda_private_gallery: "NDA / private gallery",
  // Cross-service — legacy
  addon_hard_drive_archival: "Hard drive archival",
  addon_10yr_cloud_storage: "10-year cloud storage guarantee",
};

export const GEOGRAPHY_LABELS: Record<GeographyScopeMode, string> = {
  local_only: "Local only",
  domestic: "Domestic",
  regional: "Regional",
  europe: "Europe",
  worldwide: "Worldwide",
};

export const TRAVEL_LABELS: Record<TravelPolicyMode, string> = {
  travels_freely: "Travels freely",
  selective_travel: "Selective travel",
  no_travel: "No travel",
  destination_minimums: "Destination minimums",
};

export const OUT_OF_SCOPE_ACTION_LABELS: Record<OutOfScopeLeadAction, string> = {
  decline_politely: "Decline politely",
  route_to_operator: "Route to you",
  escalate: "Escalate",
};

export const ALL_CORE_SERVICE_TYPES: readonly CoreServiceType[] = CORE_SERVICE_TYPES;
export const ALL_SPECIALIZATION_TYPES: readonly SpecializationType[] = SPECIALIZATION_TYPES;
export const ALL_OFFER_COMPONENT_TYPES: readonly OfferComponentType[] = OFFER_COMPONENT_TYPES;

/** Default deterministic scope for the briefing draft (neutral, empty offerings). */
export function createDefaultBusinessScopeDeterministic(): BusinessScopeDeterministicV2 {
  return {
    schema_version: BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
    core_services: [],
    specializations: [],
    offer_components: [],
    geography: { mode: "local_only" },
    travel_policy_mode: "selective_travel",
    lead_acceptance: {
      when_service_not_offered: "decline_politely",
      when_geography_not_in_scope: "decline_politely",
    },
  };
}

/**
 * Resolve draft scope: use saved v2 object, best-effort migrate v1, or fall back
 * to defaults. Older snapshots may omit the slice entirely.
 */
export function resolveBusinessScopeDeterministic(
  raw: BusinessScopeDeterministicV2 | unknown,
): BusinessScopeDeterministicV2 {
  const base = createDefaultBusinessScopeDeterministic();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const v = o.schema_version;

  if (v === BUSINESS_SCOPE_JSON_SCHEMA_VERSION) {
    const core = Array.isArray(o.core_services)
      ? (o.core_services as unknown[]).filter((x): x is CoreServiceType =>
          typeof x === "string" && (CORE_SERVICE_TYPES as readonly string[]).includes(x),
        )
      : [];
    // Specializations + offer_components: tolerate older-shape v2 enums by
    // running the old→new migration. Already-new IDs pass through untouched.
    const specs = migrateOldV2SpecializationsToNew(
      Array.isArray(o.specializations) ? (o.specializations as unknown[]) : [],
    );
    const offers = migrateOldV2OfferComponentsToNew(
      Array.isArray(o.offer_components) ? (o.offer_components as unknown[]) : [],
    );
    const geo = (o.geography && typeof o.geography === "object"
      ? (o.geography as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const geoMode =
      typeof geo.mode === "string" &&
      (Object.keys(GEOGRAPHY_LABELS) as GeographyScopeMode[]).includes(
        geo.mode as GeographyScopeMode,
      )
        ? (geo.mode as GeographyScopeMode)
        : base.geography.mode;
    const blocked =
      Array.isArray(geo.blocked_regions) && geo.blocked_regions.length > 0
        ? (geo.blocked_regions as unknown[]).filter(
            (s): s is string => typeof s === "string" && s.length > 0,
          )
        : undefined;
    const travel =
      typeof o.travel_policy_mode === "string" &&
      (Object.keys(TRAVEL_LABELS) as TravelPolicyMode[]).includes(
        o.travel_policy_mode as TravelPolicyMode,
      )
        ? (o.travel_policy_mode as TravelPolicyMode)
        : base.travel_policy_mode;
    const la = (o.lead_acceptance && typeof o.lead_acceptance === "object"
      ? (o.lead_acceptance as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const laWhenService = isLeadAction(la.when_service_not_offered)
      ? (la.when_service_not_offered as OutOfScopeLeadAction)
      : base.lead_acceptance.when_service_not_offered;
    const laWhenGeo = isLeadAction(la.when_geography_not_in_scope)
      ? (la.when_geography_not_in_scope as OutOfScopeLeadAction)
      : base.lead_acceptance.when_geography_not_in_scope;

    return {
      schema_version: BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
      core_services: core,
      specializations: specs,
      offer_components: offers,
      geography: {
        mode: geoMode,
        ...(blocked && blocked.length > 0 ? { blocked_regions: blocked } : {}),
      },
      travel_policy_mode: travel,
      lead_acceptance: {
        when_service_not_offered: laWhenService,
        when_geography_not_in_scope: laWhenGeo,
      },
    };
  }

  // Best-effort v1 -> v2 migration: recover canonical lists from old keys so
  // the operator doesn't see an empty scope on first reopen after rollout.
  if (v === 1) {
    const migrated = migrateLegacyCanonicalsToV2({
      offered_services: Array.isArray(o.offered_services)
        ? (o.offered_services as unknown[])
        : [],
      allowed_deliverables: Array.isArray(o.allowed_deliverables)
        ? (o.allowed_deliverables as unknown[])
        : [],
    });
    return {
      ...base,
      core_services: migrated.core_services,
      specializations: migrated.specializations,
      offer_components: migrated.offer_components,
    };
  }

  return base;
}

function isLeadAction(v: unknown): v is OutOfScopeLeadAction {
  return (
    v === "decline_politely" || v === "route_to_operator" || v === "escalate"
  );
}

/** Parse `studio_scope.language_support` JSON into string codes (minimal handling). */
export function parseLanguageSupportCodes(raw: Json | undefined): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** Store selected codes as JSON for `studio_scope.language_support`. */
export function languageCodesToJson(codes: string[]): Json {
  return codes as unknown as Json;
}
