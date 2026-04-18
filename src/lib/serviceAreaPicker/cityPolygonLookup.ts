/**
 * On-demand city polygon lookup via Nominatim (OSM).
 *
 * Our bundled dataset only has centroids for cities (GeoNames cities15000), so to
 * paint a *real* city footprint we query Nominatim per-selection, cache the result
 * in memory, and fall back to a synthesized disc if anything fails.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 *   - max 1 req/s
 *   - identifiable Referer/User-Agent (browsers send Referer automatically)
 *   - respect OSM/ODbL attribution ("© OpenStreetMap contributors") — surfaced in
 *     the picker footer already.
 *
 * We only fetch on user action (adding a city / custom area) and cache in-memory
 * for the lifetime of the page, so traffic is well under policy limits.
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";

export type CityPolygonFeature = Feature<Polygon | MultiPolygon>;

const memoryCache = new Map<string, CityPolygonFeature | null>();
const inflight = new Map<string, Promise<CityPolygonFeature | null>>();

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

type NominatimResult = {
  class?: string;
  type?: string;
  osm_type?: string;
  geojson?: { type: string; coordinates: unknown };
};

function cacheKey(label: string, countryCode?: string): string {
  return `${(countryCode ?? "").toLowerCase()}::${label.trim().toLowerCase()}`;
}

function isPolygonGeometry(g: unknown): g is Polygon | MultiPolygon {
  if (!g || typeof g !== "object") return false;
  const t = (g as { type?: unknown }).type;
  return t === "Polygon" || t === "MultiPolygon";
}

/**
 * Look up a city/town/admin boundary polygon from OSM Nominatim.
 * Returns null if no polygon is available (landmark, village without boundary, rate-limit, etc.).
 */
export async function lookupCityPolygon(
  label: string,
  countryCode?: string,
): Promise<CityPolygonFeature | null> {
  const key = cacheKey(label, countryCode);
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null;
  const existing = inflight.get(key);
  if (existing) return existing;

  const params = new URLSearchParams({
    q: label.trim(),
    format: "json",
    polygon_geojson: "1",
    addressdetails: "0",
    limit: "1",
    featuretype: "city",
  });
  if (countryCode) params.set("countrycodes", countryCode.toLowerCase());

  const p = (async () => {
    try {
      const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as NominatimResult[];
      const first = Array.isArray(body) ? body[0] : null;
      if (!first?.geojson || !isPolygonGeometry(first.geojson)) return null;
      const feature: CityPolygonFeature = {
        type: "Feature",
        properties: {},
        geometry: first.geojson,
      };
      memoryCache.set(key, feature);
      return feature;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  const result = await p;
  if (!memoryCache.has(key)) memoryCache.set(key, result);
  return result;
}
