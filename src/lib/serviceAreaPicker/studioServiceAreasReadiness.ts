/**
 * Runtime-readiness helper for service areas stored in
 * `studio_business_profiles.extensions.service_areas`.
 *
 * This module exists so future runtime consumers (lead routing,
 * coverage scoring, directory filtering, …) can ask two focused
 * questions without having to know the storage shape:
 *
 *   1. Does this studio have *any* declared service-area coverage?
 *   2. What is the normalized list?
 *
 * The current schema intentionally keeps `service_areas` inside the
 * versioned `extensions` JSONB (not as a top-level column) — see
 * `ONBOARDING_PRODUCT_BACKEND_REVIEW.md` and the v2 scope model docs
 * for the rationale. This helper is the single seam consumers should
 * use so that:
 *
 *   - they're shielded from malformed blobs written by earlier
 *     migrations (e.g. the `{}` bug corrected by
 *     `20260502000000_studio_business_profiles_v2_scope_array_defaults_fix.sql`);
 *   - a future promotion of `service_areas` to its own column would be
 *     a one-file swap here rather than a repo-wide churn.
 *
 * It is **read-only** and performs no coverage / routing decisions —
 * those belong in downstream modules that can layer matching logic
 * over `serviceAreas` once they exist.
 */
import { normalizeServiceAreasFromUnknown } from "./businessScopeServiceAreasAdapter.ts";
import type { BusinessScopeServiceArea } from "./serviceAreaPickerTypes.ts";

/**
 * Result of inspecting a studio profile's service-area coverage.
 *
 * `hasServiceAreas` is a convenience derived from `serviceAreas.length > 0`;
 * it is exposed as its own field so `if (readiness.hasServiceAreas)` reads
 * correctly at call sites without forcing them to know about the array.
 */
export type StudioServiceAreasReadiness = {
  hasServiceAreas: boolean;
  serviceAreas: BusinessScopeServiceArea[];
};

const EMPTY: StudioServiceAreasReadiness = {
  hasServiceAreas: false,
  serviceAreas: [],
};

/**
 * Pull normalized service areas out of an arbitrary JSON value that
 * *claims* to be a `studio_business_profiles.extensions` blob.
 *
 * Safe against every known malformed shape we've observed in the wild:
 *
 *   - `null` / `undefined`
 *   - non-object (string, number, boolean, array at the root)
 *   - missing `service_areas` key
 *   - `service_areas: {}` (the bug fixed by the 20260502 migration)
 *   - individual malformed rows inside the array (dropped by the adapter)
 *
 * Always returns a fresh array; callers may mutate without affecting
 * the source blob.
 */
export function readStudioServiceAreasReadinessFromExtensions(
  extensions: unknown,
): StudioServiceAreasReadiness {
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) {
    return { ...EMPTY, serviceAreas: [] };
  }
  const o = extensions as Record<string, unknown>;
  const serviceAreas = normalizeServiceAreasFromUnknown(o.service_areas);
  return {
    hasServiceAreas: serviceAreas.length > 0,
    serviceAreas,
  };
}

/**
 * Convenience wrapper for callers that hold a whole studio profile row
 * rather than its `extensions` column. Accepts any shape; the function
 * only looks at `row.extensions` and delegates to the extensions-level
 * reader. Keeps future row-shape evolution localized to this file.
 */
export function readStudioServiceAreasReadinessFromProfile(
  profile: unknown,
): StudioServiceAreasReadiness {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return { ...EMPTY, serviceAreas: [] };
  }
  const row = profile as Record<string, unknown>;
  return readStudioServiceAreasReadinessFromExtensions(row.extensions);
}
