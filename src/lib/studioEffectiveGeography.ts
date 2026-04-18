/**
 * Effective geography helper — the single backend-safe entry point future
 * runtime consumers should use for "where does this studio declare
 * itself to operate?".
 *
 * This module composes the three geography signals documented in
 * `studioGeographyContract.ts` (base_location / service_areas /
 * geographic_scope) into one typed object and offers a conservative
 * bbox-based matcher for first-pass lead-routing eligibility.
 *
 * Design principles:
 *
 *   - single source of truth for JSON-path knowledge. Callers pass whole
 *     rows or loose shapes, never reach into raw JSONB themselves.
 *   - fail-safe. Malformed inputs degrade to `posture: "unset"` rather
 *     than throw — the CHECK constraints + finalize RPC guard ensure
 *     that freshly-written data is always well-formed; this module
 *     simply refuses to synthesize confidence from broken legacy blobs.
 *   - conservative matching. The bbox matcher returns `may_cover` — a
 *     permissive bbox-level signal — rather than proving full polygon
 *     containment. It is documented as a first-pass filter; downstream
 *     routing logic may tighten it with polygon math later.
 *   - precedence matches `studioGeographyContract.ts`: explicit
 *     `service_areas` win over `geographic_scope` when present.
 */

import type { BusinessScopeServiceArea } from "./serviceAreaPicker/serviceAreaPickerTypes.ts";
import type { StudioBaseLocation } from "./studioBaseLocation.ts";
import {
  classifyStudioGeographyPosture,
  hasExplicitServiceAreas,
  hasStudioBaseLocation,
  readStudioGeographySignals,
  type StudioGeographicScope,
  type StudioGeographyPosture,
  type StudioGeographySignals,
} from "./studioGeographyContract.ts";

export type EffectiveGeography = {
  /** Which layer currently drives coverage decisions (see contract). */
  posture: StudioGeographyPosture;
  /** Identity — where the studio is based out of. Independent layer. */
  base_location: StudioBaseLocation | null;
  /** True iff `base_location` is set. */
  has_base_location: boolean;
  /** Explicit coverage rows (always an array; empty when posture ≠ explicit). */
  service_areas: BusinessScopeServiceArea[];
  /** True iff ≥1 explicit service area is declared. */
  has_explicit_service_areas: boolean;
  /** Coarse fallback posture + blocklist. */
  geographic_scope: StudioGeographicScope | null;
  /** Regions explicitly vetoed (veto layer — applies even to explicit coverage). */
  blocked_regions: string[];
};

const EMPTY_EFFECTIVE: EffectiveGeography = {
  posture: "unset",
  base_location: null,
  has_base_location: false,
  service_areas: [],
  has_explicit_service_areas: false,
  geographic_scope: null,
  blocked_regions: [],
};

/**
 * Read a fully-interpreted effective geography object from raw storage
 * blobs. Inputs may be `null` / `undefined` / malformed — the returned
 * object is always fully shaped.
 *
 * Expected callers:
 *   - lead-routing / eligibility checks
 *   - studio-profile view models
 *   - audit + telemetry pipelines
 *
 * Expected inputs:
 *   - settings          → value of `photographers.settings` (whole obj)
 *   - extensions        → value of `studio_business_profiles.extensions`
 *   - geographic_scope  → value of `studio_business_profiles.geographic_scope`
 */
export function readStudioEffectiveGeography(input: {
  settings?: unknown;
  extensions?: unknown;
  geographic_scope?: unknown;
}): EffectiveGeography {
  const signals = readStudioGeographySignals(input);
  return buildEffectiveGeographyFromSignals(signals);
}

/**
 * Variant for callers that already have a `studio_business_profiles` row
 * and a `photographers.settings` value — avoids re-plumbing keys in
 * every call site.
 */
export function readStudioEffectiveGeographyFromRows(rows: {
  photographerSettings?: unknown;
  studioBusinessProfile?: unknown;
}): EffectiveGeography {
  const sbp =
    rows.studioBusinessProfile &&
    typeof rows.studioBusinessProfile === "object" &&
    !Array.isArray(rows.studioBusinessProfile)
      ? (rows.studioBusinessProfile as Record<string, unknown>)
      : null;
  return readStudioEffectiveGeography({
    settings: rows.photographerSettings,
    extensions: sbp?.extensions,
    geographic_scope: sbp?.geographic_scope,
  });
}

function buildEffectiveGeographyFromSignals(
  signals: StudioGeographySignals,
): EffectiveGeography {
  const posture = classifyStudioGeographyPosture(signals);
  if (
    posture === "unset" &&
    !hasStudioBaseLocation(signals) &&
    !hasExplicitServiceAreas(signals) &&
    !signals.geographicScope
  ) {
    return { ...EMPTY_EFFECTIVE };
  }
  return {
    posture,
    base_location: signals.baseLocation,
    has_base_location: hasStudioBaseLocation(signals),
    service_areas: signals.serviceAreas,
    has_explicit_service_areas: hasExplicitServiceAreas(signals),
    geographic_scope: signals.geographicScope,
    blocked_regions: signals.geographicScope?.blocked_regions ?? [],
  };
}

// ── First-pass coverage matching ────────────────────────────────────────

export type CoverageQuery = {
  /** [lng, lat] point we're asking about. */
  point?: [number, number];
  /** [w, s, e, n] bounding box we're asking about. */
  bbox?: [number, number, number, number];
};

export type CoverageDecision =
  | { matched: false; reason: "no_query" }
  | { matched: false; reason: "no_coverage" }
  | { matched: false; reason: "coarse_scope_only"; mode: string }
  | { matched: true; via: "service_area"; area: BusinessScopeServiceArea }
  | { matched: true; via: "worldwide_service_area" };

/**
 * Conservative first-pass coverage check.
 *
 * Returns `matched: true` iff `effective.service_areas` includes a
 * `worldwide` row OR at least one row whose bbox overlaps the query
 * bbox/point. **No polygon-level containment is attempted** — this is a
 * permissive filter, suitable for "maybe the studio covers this, worth
 * asking the operator" style routing. Downstream code can tighten with
 * polygon math if/when the picker dataset exposes it.
 *
 * When posture is `coarse_geographic_scope`, this helper does NOT flip
 * `matched: true`. Coarse mode is a policy fallback, not an explicit
 * coverage claim; callers needing policy-level decisions should inspect
 * `effective.geographic_scope.mode` directly.
 */
export function effectiveGeographyMayCover(
  effective: EffectiveGeography,
  query: CoverageQuery,
): CoverageDecision {
  const point = query.point;
  const bbox = query.bbox;
  if (!point && !bbox) return { matched: false, reason: "no_query" };

  if (!effective.has_explicit_service_areas) {
    if (effective.posture === "coarse_geographic_scope" && effective.geographic_scope) {
      return {
        matched: false,
        reason: "coarse_scope_only",
        mode: effective.geographic_scope.mode,
      };
    }
    return { matched: false, reason: "no_coverage" };
  }

  const worldwide = effective.service_areas.find((a) => a.kind === "worldwide");
  if (worldwide) return { matched: true, via: "worldwide_service_area" };

  for (const area of effective.service_areas) {
    if (point && bboxContainsPoint(area.bbox, point)) {
      return { matched: true, via: "service_area", area };
    }
    if (bbox && bboxesOverlap(area.bbox, bbox)) {
      return { matched: true, via: "service_area", area };
    }
  }
  return { matched: false, reason: "no_coverage" };
}

// ── bbox primitives (exported for test coverage) ───────────────────────

export function bboxContainsPoint(
  bbox: readonly [number, number, number, number],
  point: readonly [number, number],
): boolean {
  const [w, s, e, n] = bbox;
  const [lng, lat] = point;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

export function bboxesOverlap(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): boolean {
  const [aw, as_, ae, an] = a;
  const [bw, bs, be, bn] = b;
  if (ae < bw || be < aw) return false;
  if (an < bs || bn < as_) return false;
  return true;
}
