/**
 * Typed extension contract for studio business profile — custom labels beyond fixed enums.
 * Stored in `studio_business_profiles.extensions` (JSONB). Not used for deterministic allow/deny;
 * runtime branching stays on finite canonical columns only (§5.1A / ARCHITECTURE).
 *
 * V2 shape — matches the new scope model in `onboardingBusinessScopeDeterministic.ts`.
 * The old 3-tier bubble-taxonomy subtrees (`selected_media_groups` /
 * `selected_service_categories` / `selected_service_capabilities` / legacy
 * `selected_service_labels` / `custom_services` / `custom_deliverables`) are
 * removed. Pre-v2 blobs are best-effort migrated at read time — see
 * `resolveBusinessScopeExtensions`.
 */
import type { Json } from "../types/database.types.ts";
import {
  isOfferComponentType,
  isSpecializationType,
  migrateLegacyCanonicalsToV2,
  type OfferComponentType,
  type SpecializationType,
} from "./onboardingBusinessScopeDeterministic.ts";
import type { BusinessScopeServiceArea } from "./serviceAreaPicker/serviceAreaPickerTypes.ts";
import { normalizeServiceAreasFromUnknown } from "./serviceAreaPicker/businessScopeServiceAreasAdapter.ts";

export const BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION = 2 as const;

/**
 * Custom specialization entered by the operator as free text. `behaves_like`
 * is an optional hint the operator can set ("closest to: Weddings") so
 * review/UI can group the custom label; runtime must not infer scope from it.
 */
export type BusinessScopeCustomSpecialization = {
  label: string;
  behaves_like?: SpecializationType | null;
};

/**
 * Custom offer component entered by the operator as free text.
 */
export type BusinessScopeCustomOfferComponent = {
  label: string;
  behaves_like?: OfferComponentType | null;
};

export type BusinessScopeCustomGeographyLabel = {
  label: string;
  kind: "included" | "excluded";
};

/**
 * Extension data for UI, review, retrieval, hydration — not new canonical vocabulary.
 * `behaves_like` is an optional hint; if null/absent, runtime must not infer scope.
 */
export type BusinessScopeExtensionsV2 = {
  schema_version: typeof BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION;
  /** Operator free-text specializations (Layer C). */
  custom_specializations?: BusinessScopeCustomSpecialization[];
  /** Operator free-text offer components (Layer C). */
  custom_offer_components?: BusinessScopeCustomOfferComponent[];
  custom_geography_labels?: BusinessScopeCustomGeographyLabel[];
  travel_constraints?: string[];
  /** Service areas from onboarding map picker — UI + future runtime; stored in extensions JSONB. */
  service_areas?: BusinessScopeServiceArea[];
};

export function createEmptyBusinessScopeExtensions(): BusinessScopeExtensionsV2 {
  return { schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION };
}

function trimNonEmpty(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function parseBehavesLikeSpecialization(
  v: unknown,
): SpecializationType | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && isSpecializationType(v)) return v;
  return null;
}

function parseBehavesLikeOfferComponent(
  v: unknown,
): OfferComponentType | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && isOfferComponentType(v)) return v;
  return null;
}

function dedupeStringsPreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function normalizeCustomSpecializations(
  raw: unknown,
): BusinessScopeCustomSpecialization[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BusinessScopeCustomSpecialization[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const label = trimNonEmpty(o.label);
    if (!label) continue;
    const lk = label.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    const behaves = parseBehavesLikeSpecialization(o.behaves_like);
    const row: BusinessScopeCustomSpecialization = { label };
    if (behaves !== undefined) row.behaves_like = behaves;
    out.push(row);
  }
  return out;
}

function normalizeCustomOfferComponents(
  raw: unknown,
): BusinessScopeCustomOfferComponent[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BusinessScopeCustomOfferComponent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const label = trimNonEmpty(o.label);
    if (!label) continue;
    const lk = label.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    const behaves = parseBehavesLikeOfferComponent(o.behaves_like);
    const row: BusinessScopeCustomOfferComponent = { label };
    if (behaves !== undefined) row.behaves_like = behaves;
    out.push(row);
  }
  return out;
}

function normalizeCustomGeographyLabels(
  raw: unknown,
): BusinessScopeCustomGeographyLabel[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BusinessScopeCustomGeographyLabel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const label = trimNonEmpty(o.label);
    if (!label) continue;
    const kind = o.kind === "included" || o.kind === "excluded" ? o.kind : null;
    if (!kind) continue;
    const dedupeKey = `${kind}:${label.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ label, kind });
  }
  return out;
}

function normalizeTravelConstraints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const parts: string[] = [];
  for (const x of raw) {
    const t = trimNonEmpty(x);
    if (t) parts.push(t);
  }
  return dedupeStringsPreserveOrder(parts);
}

/**
 * Migrate a v1 extensions blob into v2 custom-label arrays. v1 had
 * `custom_services` / `custom_deliverables` with `behaves_like_service_type`
 * / `behaves_like_deliverable` hints. Maps the hint values onto v2
 * specialization / offer-component enums via the canonical mapper. Labels
 * are preserved verbatim; unmappable hints are dropped (null). This is a
 * pure translator — it does NOT touch canonical deterministic scope, which
 * is migrated separately by `migrateLegacyCanonicalsToV2`.
 */
function migrateV1ExtensionsToV2(o: Record<string, unknown>): {
  custom_specializations?: BusinessScopeCustomSpecialization[];
  custom_offer_components?: BusinessScopeCustomOfferComponent[];
} {
  const out: {
    custom_specializations?: BusinessScopeCustomSpecialization[];
    custom_offer_components?: BusinessScopeCustomOfferComponent[];
  } = {};

  const v1Services = o.custom_services;
  if (Array.isArray(v1Services)) {
    const rows: BusinessScopeCustomSpecialization[] = [];
    for (const item of v1Services) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const label = trimNonEmpty(row.label);
      if (!label) continue;
      const hint = row.behaves_like_service_type;
      if (typeof hint === "string") {
        const mapped = migrateLegacyCanonicalsToV2({
          offered_services: [hint],
        }).specializations;
        const behaves_like = mapped[0] ?? null;
        rows.push({ label, behaves_like });
      } else {
        rows.push({ label });
      }
    }
    if (rows.length > 0) out.custom_specializations = rows;
  }

  const v1Deliverables = o.custom_deliverables;
  if (Array.isArray(v1Deliverables)) {
    const rows: BusinessScopeCustomOfferComponent[] = [];
    for (const item of v1Deliverables) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const label = trimNonEmpty(row.label);
      if (!label) continue;
      const hint = row.behaves_like_deliverable;
      if (typeof hint === "string") {
        const mapped = migrateLegacyCanonicalsToV2({
          allowed_deliverables: [hint],
        }).offer_components;
        const behaves_like = mapped[0] ?? null;
        rows.push({ label, behaves_like });
      } else {
        rows.push({ label });
      }
    }
    if (rows.length > 0) out.custom_offer_components = rows;
  }

  return out;
}

/**
 * Parse and normalize extension JSON from DB or draft payload. Unknown schema
 * versions yield empty extensions. Pre-v2 blobs (schema_version === 1) are
 * best-effort migrated to v2 so operator-entered custom labels aren't lost
 * when this file rolls out.
 */
export function resolveBusinessScopeExtensions(
  raw: unknown,
): BusinessScopeExtensionsV2 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyBusinessScopeExtensions();
  }
  const o = raw as Record<string, unknown>;
  const version = o.schema_version;

  const isV2 = version === BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION;
  const isV1 = version === 1;
  if (!isV2 && !isV1) {
    return createEmptyBusinessScopeExtensions();
  }

  // v2-native fields — present on v2 blobs only.
  let custom_specializations: BusinessScopeCustomSpecialization[] = [];
  let custom_offer_components: BusinessScopeCustomOfferComponent[] = [];
  if (isV2) {
    custom_specializations = normalizeCustomSpecializations(
      o.custom_specializations,
    );
    custom_offer_components = normalizeCustomOfferComponents(
      o.custom_offer_components,
    );
  } else {
    const migrated = migrateV1ExtensionsToV2(o);
    custom_specializations = migrated.custom_specializations ?? [];
    custom_offer_components = migrated.custom_offer_components ?? [];
  }

  const custom_geography_labels = normalizeCustomGeographyLabels(
    o.custom_geography_labels,
  );
  const travel_constraints = normalizeTravelConstraints(o.travel_constraints);
  const service_areas = normalizeServiceAreasFromUnknown(o.service_areas);

  const out: BusinessScopeExtensionsV2 = {
    schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
  };
  if (custom_specializations.length > 0) {
    out.custom_specializations = custom_specializations;
  }
  if (custom_offer_components.length > 0) {
    out.custom_offer_components = custom_offer_components;
  }
  if (custom_geography_labels.length > 0) {
    out.custom_geography_labels = custom_geography_labels;
  }
  if (travel_constraints.length > 0) out.travel_constraints = travel_constraints;
  if (service_areas.length > 0) out.service_areas = service_areas;
  return out;
}

/** Serialize for `studio_business_profiles.extensions` (JSONB). */
export function businessScopeExtensionsToJson(
  ext: BusinessScopeExtensionsV2,
): Json {
  return ext as unknown as Json;
}
