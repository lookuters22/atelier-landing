/**
 * TS mirror of the geography guard in `finalize_onboarding_briefing_v1`
 * (see `supabase/migrations/20260506000000_*.sql`).
 *
 * The DB/RPC is authoritative — the SQL guard must always fire regardless
 * of whether this prevalidator ran. This module exists so clients can:
 *
 *   1. reject bad finalize payloads BEFORE the network round-trip,
 *   2. surface the same failure code/message the server would produce,
 *   3. let tests assert the contract in two places (TS + SQL).
 *
 * Keep the `FinalizeGeographyErrorCode` values and message prefixes
 * in sync with the SQL `RAISE EXCEPTION` strings.
 */

import { normalizeServiceAreasFromUnknown } from "./serviceAreaPicker/businessScopeServiceAreasAdapter.ts";
import { parseStudioBaseLocation } from "./studioBaseLocation.ts";

export type FinalizeGeographyErrorCode =
  | "base_location_missing"
  | "base_location_malformed"
  | "service_areas_missing"
  | "service_areas_malformed";

export type FinalizeGeographyValidationError = {
  code: FinalizeGeographyErrorCode;
  message: string;
};

export type FinalizeGeographyInput = {
  /** Final merged `photographers.settings` value about to be written. */
  settings: unknown;
  /** `studio_business_profiles` row (post-merge, pre-RPC). */
  studioBusinessProfile: unknown;
};

/**
 * Pure prevalidator. Returns an error-shaped result when the geography
 * half of the finalize payload is incomplete or malformed. Message
 * strings match the SQL guard so error attribution is consistent
 * whether it trips in TS or in Postgres.
 */
export function validateFinalizeGeographyPayload(
  input: FinalizeGeographyInput,
): FinalizeGeographyValidationError | null {
  // ── base_location ─────────────────────────────────────────────────────
  const settings = input.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {
      code: "base_location_missing",
      message:
        "finalize_onboarding_briefing_v1: geography_incomplete — photographers.settings.base_location is required",
    };
  }
  const settingsRecord = settings as Record<string, unknown>;
  const rawBase = settingsRecord.base_location;
  if (rawBase === undefined || rawBase === null) {
    return {
      code: "base_location_missing",
      message:
        "finalize_onboarding_briefing_v1: geography_incomplete — photographers.settings.base_location is required",
    };
  }
  const parsedBase = parseStudioBaseLocation(rawBase);
  if (!parsedBase) {
    return {
      code: "base_location_malformed",
      message:
        "finalize_onboarding_briefing_v1: geography_malformed — photographers.settings.base_location does not match the StudioBaseLocation contract",
    };
  }

  // ── service_areas (via extensions) ────────────────────────────────────
  const sbp = input.studioBusinessProfile;
  if (!sbp || typeof sbp !== "object" || Array.isArray(sbp)) {
    return {
      code: "service_areas_missing",
      message:
        "finalize_onboarding_briefing_v1: geography_incomplete — studio_business_profiles.extensions.service_areas is required",
    };
  }
  const ext = (sbp as Record<string, unknown>).extensions;
  if (!ext || typeof ext !== "object" || Array.isArray(ext)) {
    return {
      code: "service_areas_missing",
      message:
        "finalize_onboarding_briefing_v1: geography_incomplete — studio_business_profiles.extensions.service_areas is required",
    };
  }
  const rawAreas = (ext as Record<string, unknown>).service_areas;
  if (rawAreas === undefined || rawAreas === null) {
    return {
      code: "service_areas_missing",
      message:
        "finalize_onboarding_briefing_v1: geography_incomplete — studio_business_profiles.extensions.service_areas must contain at least one valid entry",
    };
  }
  if (!Array.isArray(rawAreas)) {
    return {
      code: "service_areas_malformed",
      message:
        "finalize_onboarding_briefing_v1: geography_malformed — studio_business_profiles.extensions.service_areas contains an invalid row",
    };
  }
  if (rawAreas.length === 0) {
    return {
      code: "service_areas_missing",
      message:
        "finalize_onboarding_briefing_v1: geography_incomplete — studio_business_profiles.extensions.service_areas must contain at least one valid entry",
    };
  }
  const normalized = normalizeServiceAreasFromUnknown(rawAreas);
  if (normalized.length !== rawAreas.length) {
    return {
      code: "service_areas_malformed",
      message:
        "finalize_onboarding_briefing_v1: geography_malformed — studio_business_profiles.extensions.service_areas contains an invalid row",
    };
  }

  return null;
}

export class FinalizeGeographyValidationFailure extends Error {
  readonly code: FinalizeGeographyErrorCode;
  constructor(err: FinalizeGeographyValidationError) {
    super(err.message);
    this.name = "FinalizeGeographyValidationFailure";
    this.code = err.code;
  }
}
