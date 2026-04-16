/**
 * Typed extension contract for studio business profile — custom labels beyond fixed enums.
 * Stored in `studio_business_profiles.extensions` (JSONB). Not used for deterministic allow/deny;
 * runtime branching stays on finite canonical columns only (§5.1A / ARCHITECTURE).
 */
import type { Json } from "../types/database.types.ts";
import {
  DELIVERABLE_KINDS,
  OFFERED_SERVICE_TYPES,
  type DeliverableKind,
  type OfferedServiceType,
} from "./onboardingBusinessScopeDeterministic.ts";

export const BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION = 1 as const;

export type BusinessScopeCustomService = {
  label: string;
  behaves_like_service_type?: OfferedServiceType | null;
};

export type BusinessScopeCustomGeographyLabel = {
  label: string;
  kind: "included" | "excluded";
};

export type BusinessScopeCustomDeliverable = {
  label: string;
  behaves_like_deliverable?: DeliverableKind | null;
};

/**
 * Extension data for UI, review, retrieval, hydration — not new canonical vocabulary.
 * `behaves_like_*` is an optional hint; if null/absent, runtime must not infer scope.
 */
export type BusinessScopeExtensionsV1 = {
  schema_version: typeof BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION;
  custom_services?: BusinessScopeCustomService[];
  custom_geography_labels?: BusinessScopeCustomGeographyLabel[];
  travel_constraints?: string[];
  custom_deliverables?: BusinessScopeCustomDeliverable[];
};

const SERVICE_SET = new Set<string>(OFFERED_SERVICE_TYPES);
const DELIVERABLE_SET = new Set<string>(DELIVERABLE_KINDS);

export function createEmptyBusinessScopeExtensions(): BusinessScopeExtensionsV1 {
  return { schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION };
}

function trimNonEmpty(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function parseBehavesLikeService(v: unknown): OfferedServiceType | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && SERVICE_SET.has(v)) return v as OfferedServiceType;
  return null;
}

function parseBehavesLikeDeliverable(v: unknown): DeliverableKind | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && DELIVERABLE_SET.has(v)) return v as DeliverableKind;
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

function normalizeCustomServices(raw: unknown): BusinessScopeCustomService[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BusinessScopeCustomService[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const label = trimNonEmpty(o.label);
    if (!label) continue;
    const lk = label.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    const behaves = parseBehavesLikeService(o.behaves_like_service_type);
    const row: BusinessScopeCustomService = { label };
    if (behaves !== undefined) row.behaves_like_service_type = behaves;
    out.push(row);
  }
  return out;
}

function normalizeCustomGeographyLabels(raw: unknown): BusinessScopeCustomGeographyLabel[] {
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

function normalizeCustomDeliverables(raw: unknown): BusinessScopeCustomDeliverable[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BusinessScopeCustomDeliverable[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const label = trimNonEmpty(o.label);
    if (!label) continue;
    const lk = label.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    const behaves = parseBehavesLikeDeliverable(o.behaves_like_deliverable);
    const row: BusinessScopeCustomDeliverable = { label };
    if (behaves !== undefined) row.behaves_like_deliverable = behaves;
    out.push(row);
  }
  return out;
}

/**
 * Parse and normalize extension JSON from DB or draft payload. Unknown schema versions yield empty extensions.
 */
export function resolveBusinessScopeExtensions(raw: unknown): BusinessScopeExtensionsV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyBusinessScopeExtensions();
  }
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION) {
    return createEmptyBusinessScopeExtensions();
  }

  const custom_services = normalizeCustomServices(o.custom_services);
  const custom_geography_labels = normalizeCustomGeographyLabels(o.custom_geography_labels);
  const travel_constraints = normalizeTravelConstraints(o.travel_constraints);
  const custom_deliverables = normalizeCustomDeliverables(o.custom_deliverables);

  const out: BusinessScopeExtensionsV1 = {
    schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
  };
  if (custom_services.length > 0) out.custom_services = custom_services;
  if (custom_geography_labels.length > 0) out.custom_geography_labels = custom_geography_labels;
  if (travel_constraints.length > 0) out.travel_constraints = travel_constraints;
  if (custom_deliverables.length > 0) out.custom_deliverables = custom_deliverables;
  return out;
}

/** Serialize for `studio_business_profiles.extensions` (JSONB). */
export function businessScopeExtensionsToJson(ext: BusinessScopeExtensionsV1): Json {
  return ext as unknown as Json;
}
