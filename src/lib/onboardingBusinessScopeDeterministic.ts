/**
 * Phase 4 Step 4E — deterministic `studio_business_profiles` JSON for one business-scope slice.
 *
 * execute_v3: service types, travel/geography, lead in/out scope, deliverables — structured so
 * the runtime can branch without parsing prose. DATABASE_SCHEMA §5.1A JSONB columns.
 */
import type { Json } from "../types/database.types.ts";

export const BUSINESS_SCOPE_JSON_SCHEMA_VERSION = 1 as const;

/** §5.1A examples — offered categories. */
export const OFFERED_SERVICE_TYPES = [
  "weddings",
  "family",
  "maternity",
  "brand",
  "video",
] as const;

export type OfferedServiceType = (typeof OFFERED_SERVICE_TYPES)[number];

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

/** Allowed product lines (deliverable_types) — Ana must not propose items outside this set. */
export const DELIVERABLE_KINDS = [
  "digital_gallery",
  "album",
  "raw_files",
  "video_deliverable",
  "prints",
] as const;

export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

/**
 * Deterministic outcomes when a lead is outside business scope (lead_acceptance_rules).
 * Runtime: compare inquiry vs `service_types` / `geographic_scope` / `deliverable_types`.
 */
export type OutOfScopeLeadAction =
  | "decline_politely"
  | "route_to_operator"
  | "escalate";

/**
 * Onboarding capture for the §5.1A slice — all fields required for a complete 4E row;
 * callers may omit the whole object until the step is done.
 */
export type BusinessScopeDeterministicV1 = {
  schema_version: typeof BUSINESS_SCOPE_JSON_SCHEMA_VERSION;
  /** Offered service types — if `video` is absent, video leads are out-of-scope for offering. */
  offered_services: readonly OfferedServiceType[];
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
  allowed_deliverables: readonly DeliverableKind[];
};

export type StudioBusinessProfileJsonSlice = {
  service_types: Json;
  geographic_scope: Json;
  travel_policy: Json;
  lead_acceptance_rules: Json;
  deliverable_types: Json;
};

/**
 * Maps typed business scope into JSONB payloads for `studio_business_profiles`.
 * Safe to merge over defaults — does not perform I/O.
 */
export function buildStudioBusinessProfileJsonFromBusinessScope(
  scope: BusinessScopeDeterministicV1,
): StudioBusinessProfileJsonSlice {
  const v = BUSINESS_SCOPE_JSON_SCHEMA_VERSION;

  const service_types = [...scope.offered_services] as unknown as Json;

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

  const deliverable_types = [...scope.allowed_deliverables] as unknown as Json;

  return {
    service_types,
    geographic_scope,
    travel_policy,
    lead_acceptance_rules,
    deliverable_types,
  };
}
