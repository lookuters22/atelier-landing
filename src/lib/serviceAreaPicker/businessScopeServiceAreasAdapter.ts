import type { BusinessScopeExtensionsV2 } from "../onboardingBusinessScopeExtensions.ts";
import type { BusinessScopeServiceArea, BusinessScopeServiceAreaKind, BusinessScopeServiceAreaProvider } from "./serviceAreaPickerTypes.ts";

const MAX_SERVICE_AREAS = 50;

const KINDS: ReadonlySet<BusinessScopeServiceAreaKind> = new Set([
  "worldwide",
  "continent",
  "country",
  "region",
  "city",
  "custom",
]);
const PROVIDERS: ReadonlySet<BusinessScopeServiceAreaProvider> = new Set(["bundled", "custom"]);

function trimNonEmpty(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function parseBbox(raw: unknown): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums = raw.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : NaN));
  if (nums.some((n) => Number.isNaN(n))) return null;
  const [w, s, e, n] = nums as [number, number, number, number];
  if (w >= e || s >= n) return null;
  return [w, s, e, n];
}

function parseCentroid(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const lng = typeof raw[0] === "number" && Number.isFinite(raw[0]) ? raw[0] : NaN;
  const lat = typeof raw[1] === "number" && Number.isFinite(raw[1]) ? raw[1] : NaN;
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return [lng, lat];
}

export function normalizeServiceAreasFromUnknown(raw: unknown): BusinessScopeServiceArea[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: BusinessScopeServiceArea[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SERVICE_AREAS) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const provider_id = trimNonEmpty(o.provider_id);
    const label = trimNonEmpty(o.label);
    const kind = o.kind;
    const provider = o.provider;
    const selected_at = trimNonEmpty(o.selected_at);
    if (!provider_id || !label || !selected_at) continue;
    if (typeof kind !== "string" || !KINDS.has(kind as BusinessScopeServiceAreaKind)) continue;
    if (typeof provider !== "string" || !PROVIDERS.has(provider as BusinessScopeServiceAreaProvider)) continue;
    const bbox = parseBbox(o.bbox);
    const centroid = parseCentroid(o.centroid);
    if (!bbox || !centroid) continue;
    const country_code =
      typeof o.country_code === "string" && /^[A-Za-z]{2}$/.test(o.country_code)
        ? o.country_code.toUpperCase()
        : undefined;
    const dedupeKey = `${provider}:${provider_id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const row: BusinessScopeServiceArea = {
      provider_id,
      label,
      kind: kind as BusinessScopeServiceAreaKind,
      provider: provider as BusinessScopeServiceAreaProvider,
      centroid,
      bbox,
      selected_at,
    };
    if (country_code) row.country_code = country_code;
    out.push(row);
  }
  return out;
}

export function readServiceAreasFromExtensions(ext: BusinessScopeExtensionsV2): BusinessScopeServiceArea[] {
  return ext.service_areas ?? [];
}

export function writeServiceAreasIntoExtensions(
  ext: BusinessScopeExtensionsV2,
  areas: BusinessScopeServiceArea[],
): BusinessScopeExtensionsV2 {
  const normalized = normalizeServiceAreasFromUnknown(areas);
  const next: BusinessScopeExtensionsV2 = {
    ...ext,
    schema_version: ext.schema_version,
  };
  if (normalized.length > 0) next.service_areas = normalized;
  else delete next.service_areas;
  return next;
}
