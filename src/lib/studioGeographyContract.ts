/**
 * Canonical interpretation contract for studio geography.
 *
 * THREE CONCEPTS, ONE DOCUMENT.
 *
 * The codebase persists three geographic signals across two storage surfaces:
 *
 *   `photographers.settings.base_location`
 *     → identity/home-base layer (see `studioBaseLocation.ts`).
 *     → "Where is the studio physically based out of?"
 *     → exactly one value (or null = explicitly cleared).
 *
 *   `studio_business_profiles.extensions.service_areas`
 *     → explicit coverage layer (see `serviceAreaPicker/*`).
 *     → "Which places has the operator *chosen* to work in?"
 *     → array of 0..N typed rows (city / region / country / continent /
 *       worldwide / custom).
 *
 *   `studio_business_profiles.geographic_scope`
 *     → coarse deterministic posture (see
 *       `onboardingBusinessScopeDeterministic.ts` → `GeographyScopeMode`).
 *     → "If no explicit coverage is set, what policy does the studio fall
 *       back to?" — five buckets: local_only / domestic / regional /
 *       europe / worldwide.
 *
 * === AUTHORITATIVE PRECEDENCE ==============================================
 *
 * Conflict resolution when more than one of the above is set:
 *
 *   1. `base_location` is **always independent**. It describes identity,
 *      not coverage, and is never compared against `service_areas` or
 *      `geographic_scope`. A studio may be based in Paris and only work
 *      in New York — both answers are real.
 *
 *   2. `service_areas` is the **authoritative explicit coverage layer**
 *      whenever it has ≥1 valid row. Runtime consumers that need to
 *      answer "does this studio cover X?" MUST consult `service_areas`
 *      first. `geographic_scope.mode` is *not* consulted for in/out
 *      decisions in this regime — the operator explicitly chose their
 *      coverage and the mode is, at best, redundant signal.
 *
 *   3. `geographic_scope` is the **coarse policy fallback**. It answers
 *      the "did the operator opt into worldwide leads?" question at a
 *      policy level and is consulted when `service_areas` is empty or
 *      unset. Once `service_areas` is populated, `geographic_scope` is
 *      kept for audit/telemetry but stops driving coverage decisions.
 *
 *   4. `geographic_scope.blocked_regions` (when present) is a **veto
 *      layer** that applies *even when* explicit `service_areas` cover
 *      the query. Operators use it to carve out exclusions inside
 *      otherwise-covered geography. Runtime matching consults it last.
 *
 * The precedence above is encoded in `classifyStudioGeographyPosture`
 * below. `readStudioEffectiveGeography` (see `studioEffectiveGeography.ts`)
 * composes these signals into one typed object for future consumers.
 *
 * === FAIL-SAFE POSTURE =====================================================
 *
 * When the stored JSON is malformed (array expected but got `{}`, etc.) all
 * readers in this module coerce back to "unset" rather than throw. The
 * 20260502 corrective migration heals historical rows; the TS parsers
 * defang anything that slips through.
 *
 * === WHERE TO READ / WRITE =================================================
 *
 *   READ  (preferred)  →  `readStudioEffectiveGeography` (effective helper)
 *   READ  (focused)    →  `readStudioServiceAreasReadinessFromExtensions`
 *   WRITE (onboarding) →  `mapOnboardingPayloadToStorage` + finalize RPC
 *   WRITE (runtime)    →  NOT YET SUPPORTED — everything is operator-owned
 *                          via onboarding; service_areas edits post-
 *                          onboarding are deferred to a future settings UI.
 */

import type { BusinessScopeServiceArea } from "./serviceAreaPicker/serviceAreaPickerTypes.ts";
import { normalizeServiceAreasFromUnknown } from "./serviceAreaPicker/businessScopeServiceAreasAdapter.ts";
import type { GeographyScopeMode } from "./onboardingBusinessScopeDeterministic.ts";
import { parseStudioBaseLocation, type StudioBaseLocation } from "./studioBaseLocation.ts";

/**
 * Finite set of valid `geographic_scope.mode` values. Mirrors
 * `GeographyScopeMode`; duplicated here so runtime readers can validate
 * raw JSONB without importing the deterministic-scope module's entire
 * enum surface.
 */
export const GEOGRAPHIC_SCOPE_MODES: readonly GeographyScopeMode[] = [
  "local_only",
  "domestic",
  "regional",
  "europe",
  "worldwide",
] as const;

const GEOGRAPHIC_SCOPE_MODE_SET = new Set<string>(GEOGRAPHIC_SCOPE_MODES);

/**
 * Parsed, validated `geographic_scope` object (the coarse posture layer).
 * Returns `null` when the stored JSONB is missing, malformed, or carries
 * an unknown `mode`. `blocked_regions` is normalized to `string[]`;
 * unknown keys are dropped.
 */
export type StudioGeographicScope = {
  mode: GeographyScopeMode;
  blocked_regions: string[];
};

export function parseStudioGeographicScope(
  raw: unknown,
): StudioGeographicScope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const mode = typeof o.mode === "string" && GEOGRAPHIC_SCOPE_MODE_SET.has(o.mode)
    ? (o.mode as GeographyScopeMode)
    : null;
  if (!mode) return null;

  const blocked_regions: string[] = [];
  if (Array.isArray(o.blocked_regions)) {
    for (const v of o.blocked_regions) {
      if (typeof v === "string" && v.trim().length > 0) {
        blocked_regions.push(v.trim());
      }
    }
  }
  return { mode, blocked_regions };
}

// ── Posture classification ────────────────────────────────────────────────

/**
 * Which of the three layers currently drives coverage decisions.
 *
 *   `explicit_service_areas`   — `service_areas` has ≥1 valid row (rule 2).
 *   `coarse_geographic_scope`  — fallback to the deterministic mode (rule 3).
 *   `unset`                    — neither layer is usable.
 *
 * `base_location` is intentionally not part of this classification — it is
 * identity, not coverage (rule 1).
 */
export type StudioGeographyPosture =
  | "explicit_service_areas"
  | "coarse_geographic_scope"
  | "unset";

export type StudioGeographySignals = {
  baseLocation: StudioBaseLocation | null;
  serviceAreas: BusinessScopeServiceArea[];
  geographicScope: StudioGeographicScope | null;
};

/**
 * Extract the three signals from raw storage blobs without throwing. Each
 * input may be `null`, `undefined`, a malformed shape, or the real
 * contract — this function always returns a fully-typed `StudioGeographySignals`.
 */
export function readStudioGeographySignals(input: {
  /** Value of `photographers.settings` (whole object, not just `base_location`). */
  settings?: unknown;
  /** Value of `studio_business_profiles.extensions`. */
  extensions?: unknown;
  /** Value of `studio_business_profiles.geographic_scope`. */
  geographic_scope?: unknown;
}): StudioGeographySignals {
  const baseLocationRaw =
    input.settings &&
    typeof input.settings === "object" &&
    !Array.isArray(input.settings)
      ? (input.settings as Record<string, unknown>).base_location
      : null;
  const baseLocation = parseStudioBaseLocation(baseLocationRaw);

  const serviceAreasRaw =
    input.extensions &&
    typeof input.extensions === "object" &&
    !Array.isArray(input.extensions)
      ? (input.extensions as Record<string, unknown>).service_areas
      : null;
  const serviceAreas = normalizeServiceAreasFromUnknown(serviceAreasRaw);

  const geographicScope = parseStudioGeographicScope(input.geographic_scope);

  return { baseLocation, serviceAreas, geographicScope };
}

/**
 * Apply the precedence rules documented at the top of this file and
 * return the posture that should drive runtime coverage decisions.
 */
export function classifyStudioGeographyPosture(
  signals: StudioGeographySignals,
): StudioGeographyPosture {
  if (signals.serviceAreas.length > 0) return "explicit_service_areas";
  if (signals.geographicScope) return "coarse_geographic_scope";
  return "unset";
}

/**
 * Convenience predicate — whether the studio has answered the identity
 * half of the geography capture. Independent of coverage posture (rule 1).
 */
export function hasStudioBaseLocation(signals: StudioGeographySignals): boolean {
  return signals.baseLocation !== null;
}

/**
 * Convenience predicate — whether the studio has answered the explicit
 * coverage half of the geography capture.
 */
export function hasExplicitServiceAreas(
  signals: StudioGeographySignals,
): boolean {
  return signals.serviceAreas.length > 0;
}
