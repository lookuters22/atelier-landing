import {
  BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
  DELIVERABLE_KINDS,
  OFFERED_SERVICE_TYPES,
  type DeliverableKind,
  type GeographyScopeMode,
  type OfferedServiceType,
  type OutOfScopeLeadAction,
  type TravelPolicyMode,
  type BusinessScopeDeterministicV1,
} from "./onboardingBusinessScopeDeterministic.ts";
import type { Json } from "../types/database.types.ts";

/** Small allowlist for `studio_scope.language_support` (ISO 639-1). */
export const BRIEFING_LANGUAGE_CODES = ["en", "de", "fr", "it", "es", "sr", "hr", "pt", "nl"] as const;

export const OFFERED_SERVICE_LABELS: Record<OfferedServiceType, string> = {
  weddings: "Weddings",
  family: "Family",
  maternity: "Maternity",
  brand: "Brand",
  video: "Video",
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

export const DELIVERABLE_LABELS: Record<DeliverableKind, string> = {
  digital_gallery: "Digital gallery",
  album: "Album",
  raw_files: "RAW files",
  video_deliverable: "Video",
  prints: "Prints",
};

export const OUT_OF_SCOPE_ACTION_LABELS: Record<OutOfScopeLeadAction, string> = {
  decline_politely: "Decline politely",
  route_to_operator: "Route to you",
  escalate: "Escalate",
};

export const ALL_OFFERED_SERVICE_TYPES: readonly OfferedServiceType[] = OFFERED_SERVICE_TYPES;
export const ALL_DELIVERABLE_KINDS: readonly DeliverableKind[] = DELIVERABLE_KINDS;

/** Default deterministic scope for the briefing draft (neutral, empty offerings). */
export function createDefaultBusinessScopeDeterministic(): BusinessScopeDeterministicV1 {
  return {
    schema_version: BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
    offered_services: [],
    geography: { mode: "local_only" },
    travel_policy_mode: "selective_travel",
    lead_acceptance: {
      when_service_not_offered: "decline_politely",
      when_geography_not_in_scope: "decline_politely",
    },
    allowed_deliverables: [],
  };
}

/** Resolve draft scope: use saved object or defaults (older snapshots may omit it). */
export function resolveBusinessScopeDeterministic(
  raw: BusinessScopeDeterministicV1 | undefined,
): BusinessScopeDeterministicV1 {
  const base = createDefaultBusinessScopeDeterministic();
  if (!raw || raw.schema_version !== BUSINESS_SCOPE_JSON_SCHEMA_VERSION) {
    return base;
  }
  return {
    schema_version: BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
    offered_services: [...raw.offered_services],
    geography: {
      mode: raw.geography?.mode ?? base.geography.mode,
      ...(raw.geography?.blocked_regions && raw.geography.blocked_regions.length > 0
        ? { blocked_regions: [...raw.geography.blocked_regions] }
        : {}),
    },
    travel_policy_mode: raw.travel_policy_mode,
    lead_acceptance: {
      when_service_not_offered: raw.lead_acceptance.when_service_not_offered,
      when_geography_not_in_scope: raw.lead_acceptance.when_geography_not_in_scope,
    },
    allowed_deliverables: [...raw.allowed_deliverables],
  };
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
