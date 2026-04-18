import type { BusinessScopeServiceAreaKind } from "./serviceAreaPickerTypes.ts";
import type { ServiceAreaLabelsBundle, ServiceAreaSearchResult } from "./serviceAreaPickerTypes.ts";

export type SeedId = { provider_id: string; kind: BusinessScopeServiceAreaKind };

const GLOBAL: readonly SeedId[] = [
  { provider_id: "ne:country:US", kind: "country" },
  { provider_id: "ne:country:GB", kind: "country" },
  { provider_id: "ne:country:RS", kind: "country" },
  { provider_id: "ne:country:ES", kind: "country" },
];

export const SERVICE_AREA_SEED_BY_COUNTRY: Record<string, readonly SeedId[]> = {
  US: [
    { provider_id: "ne:region:US-CA", kind: "region" },
    { provider_id: "ne:region:US-NY", kind: "region" },
    { provider_id: "gn:city:5128581", kind: "city" },
    { provider_id: "gn:city:5391959", kind: "city" },
  ],
  GB: [
    { provider_id: "ne:country:GB", kind: "country" },
    { provider_id: "gn:city:2643743", kind: "city" },
  ],
  RS: [
    { provider_id: "gn:city:792680", kind: "city" },
    { provider_id: "gn:city:3194360", kind: "city" },
  ],
  ES: [
    { provider_id: "gn:city:3117735", kind: "city" },
    { provider_id: "gn:city:2515270", kind: "city" },
  ],
  IT: [
    { provider_id: "gn:city:3169070", kind: "city" },
    { provider_id: "gn:city:3173435", kind: "city" },
  ],
  FR: [
    { provider_id: "gn:city:2988507", kind: "city" },
    { provider_id: "gn:city:2995469", kind: "city" },
  ],
};

export function resolveSeedSuggestions(
  bundle: ServiceAreaLabelsBundle,
  countryCode?: string,
): ServiceAreaSearchResult[] {
  const upper = countryCode?.toUpperCase();
  const seeds = (upper && SERVICE_AREA_SEED_BY_COUNTRY[upper]) ?? GLOBAL;
  const byId = new Map<string, ServiceAreaSearchResult>();

  for (const c of bundle.countries) {
    byId.set(c.id, {
      provider_id: c.id,
      label: c.label,
      kind: "country",
      centroid: c.centroid,
      bbox: c.bbox,
      country_code: c.iso2,
    });
  }
  for (const r of bundle.regions) {
    byId.set(r.id, {
      provider_id: r.id,
      label: r.label,
      kind: "region",
      centroid: r.centroid,
      bbox: r.bbox,
      country_code: r.iso2.length === 2 ? r.iso2 : undefined,
    });
  }
  for (const city of bundle.cities) {
    byId.set(city.id, {
      provider_id: city.id,
      label: city.label,
      kind: "city",
      centroid: city.centroid,
      bbox: city.bbox,
      country_code: city.iso2,
      population: city.population,
    });
  }

  const out: ServiceAreaSearchResult[] = [];
  for (const s of seeds) {
    const hit = byId.get(s.provider_id);
    if (hit && hit.kind === s.kind) out.push(hit);
  }
  return out;
}
