/**
 * Studio base location — first-class identity field living on
 * `photographers.settings.base_location` (JSONB column, no schema migration
 * needed to land a new key).
 *
 * Shape intentionally mirrors `BusinessScopeServiceArea` minus kinds that
 * don't describe a physical home (`worldwide` / `continent`), so the same
 * map picker / search index can produce a selection for *either* surface.
 *
 * Reuse rules — keep in sync whenever these grow:
 *   - Canonical selection contract: `serviceAreaPickerTypes.ts`.
 *   - Settings contract:             `types/photographerSettings.types.ts`.
 *   - Onboarding payload mapping:    `onboardingV4Payload.ts`.
 */

import type { ServiceAreaSearchResult } from "./serviceAreaPicker/serviceAreaPickerTypes.ts";

/** Bump when the stored object shape changes in a way readers must branch on. */
export const STUDIO_BASE_LOCATION_SCHEMA_VERSION = 1 as const;

export type StudioBaseLocationKind = "city" | "region" | "country" | "custom";
export type StudioBaseLocationProvider = "bundled" | "custom";

/**
 * Canonical studio base-location record written to
 * `photographers.settings.base_location`.
 */
export type StudioBaseLocation = {
  schema_version: typeof STUDIO_BASE_LOCATION_SCHEMA_VERSION;
  provider_id: string;
  label: string;
  kind: StudioBaseLocationKind;
  provider: StudioBaseLocationProvider;
  /** `[lng, lat]` — same convention as `BusinessScopeServiceArea`. */
  centroid: [number, number];
  /** `[west, south, east, north]` — matches MapLibre / GeoJSON bounds order. */
  bbox: [number, number, number, number];
  country_code?: string;
  /** ISO 8601 UTC. Captured when the operator picks / re-picks their base. */
  selected_at: string;
};

/** Kinds a user may legitimately pick as a "home base". */
export const STUDIO_BASE_LOCATION_KINDS: readonly StudioBaseLocationKind[] = [
  "city",
  "region",
  "country",
  "custom",
] as const;

const ALLOWED_KINDS = new Set<string>(STUDIO_BASE_LOCATION_KINDS);

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Parse an arbitrary JSONB value (e.g. `photographers.settings.base_location`)
 * into a `StudioBaseLocation`. Returns `null` when the value is missing or
 * doesn't satisfy the contract — readers always treat null as "unset".
 */
export function parseStudioBaseLocation(raw: unknown): StudioBaseLocation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const provider_id = typeof o.provider_id === "string" ? o.provider_id : null;
  const label = typeof o.label === "string" ? o.label : null;
  const kind = typeof o.kind === "string" && ALLOWED_KINDS.has(o.kind)
    ? (o.kind as StudioBaseLocationKind)
    : null;
  const provider =
    o.provider === "bundled" || o.provider === "custom"
      ? (o.provider as StudioBaseLocationProvider)
      : null;

  const centroid =
    Array.isArray(o.centroid) &&
    o.centroid.length === 2 &&
    isFiniteNumber(o.centroid[0]) &&
    isFiniteNumber(o.centroid[1])
      ? ([o.centroid[0], o.centroid[1]] as [number, number])
      : null;

  const bbox =
    Array.isArray(o.bbox) &&
    o.bbox.length === 4 &&
    o.bbox.every((n) => isFiniteNumber(n))
      ? ([
          o.bbox[0] as number,
          o.bbox[1] as number,
          o.bbox[2] as number,
          o.bbox[3] as number,
        ] as [number, number, number, number])
      : null;

  const selected_at = typeof o.selected_at === "string" ? o.selected_at : null;

  if (
    !provider_id ||
    !label ||
    !kind ||
    !provider ||
    !centroid ||
    !bbox ||
    !selected_at
  ) {
    return null;
  }

  const out: StudioBaseLocation = {
    schema_version: STUDIO_BASE_LOCATION_SCHEMA_VERSION,
    provider_id,
    label,
    kind,
    provider,
    centroid,
    bbox,
    selected_at,
  };
  if (typeof o.country_code === "string" && o.country_code.length > 0) {
    out.country_code = o.country_code;
  }
  return out;
}

/**
 * Convert a bundled search hit into a persisted `StudioBaseLocation`.
 * Returns `null` when the hit's kind isn't valid for a home base
 * (e.g. `worldwide` / `continent`) — callers filter these out of
 * suggestions, but we defend in depth here too.
 */
export function bundledSearchResultToStudioBaseLocation(
  result: ServiceAreaSearchResult,
): StudioBaseLocation | null {
  const kind = result.kind;
  if (!(kind === "city" || kind === "region" || kind === "country")) {
    return null;
  }
  const base: StudioBaseLocation = {
    schema_version: STUDIO_BASE_LOCATION_SCHEMA_VERSION,
    provider_id: result.provider_id,
    label: result.label,
    kind,
    provider: "bundled",
    centroid: result.centroid,
    bbox: result.bbox,
    selected_at: new Date().toISOString(),
  };
  if (result.country_code) base.country_code = result.country_code;
  return base;
}

/**
 * Build a custom `StudioBaseLocation` from a freeform label + coordinates.
 * Used when the operator types a place the bundled dataset doesn't know.
 */
export function customStudioBaseLocation(
  label: string,
  centroid: [number, number],
  bbox: [number, number, number, number],
): StudioBaseLocation {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return {
    schema_version: STUDIO_BASE_LOCATION_SCHEMA_VERSION,
    provider_id: `custom:${slug || "base"}`,
    label: label.trim(),
    kind: "custom",
    provider: "custom",
    centroid,
    bbox,
    selected_at: new Date().toISOString(),
  };
}

/** True when two base-location records refer to the same place. */
export function isSameStudioBaseLocation(
  a: StudioBaseLocation | null | undefined,
  b: StudioBaseLocation | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return a.provider === b.provider && a.provider_id === b.provider_id;
}
