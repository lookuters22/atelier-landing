/**
 * Open-Meteo (no API key) — geocoding + daily forecast. Used by operator assistant only.
 * @see https://open-meteo.com/
 */

const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FC = "https://api.open-meteo.com/v1/forecast";

export type OpenMeteoGeocodeHit = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

export type OpenMeteoDailyPoint = {
  date: string;
  /** WMO Weather interpretation codes (see Open-Meteo docs). */
  weathercode: number;
  tempMinC: number | null;
  tempMaxC: number | null;
  precipProbMax: number | null;
};

/**
 * @param name free-text place (e.g. "Budapest", "Paris, France")
 */
export async function openMeteoGeocode(name: string, fetchImpl: typeof fetch = fetch): Promise<OpenMeteoGeocodeHit | null> {
  const q = name.trim();
  if (!q) return null;
  const u = new URL(GEO);
  u.searchParams.set("name", q.slice(0, 200));
  u.searchParams.set("count", "1");
  u.searchParams.set("language", "en");
  u.searchParams.set("format", "json");

  const res = await fetchImpl(u.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Open-Meteo geocoding failed: ${res.status}`);
  }
  const j = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const r = j.results?.[0];
  if (!r) return null;
  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    name: String(r.name ?? q),
    latitude: lat,
    longitude: lon,
    country: r.country != null ? String(r.country) : undefined,
    admin1: r.admin1 != null ? String(r.admin1) : undefined,
  };
}

type ForecastJson = {
  daily?: {
    time?: string[];
    weathercode?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

/**
 * Fetches a single-day slice from the forecast API. Caller must keep `date` within the provider window (≤ ~16 days).
 */
export async function openMeteoDailyForDate(
  latitude: number,
  longitude: number,
  dateIso: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenMeteoDailyPoint | null> {
  const u = new URL(FC);
  u.searchParams.set("latitude", String(latitude));
  u.searchParams.set("longitude", String(longitude));
  u.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  u.searchParams.set("timezone", "auto");
  u.searchParams.set("start_date", dateIso);
  u.searchParams.set("end_date", dateIso);

  const res = await fetchImpl(u.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Open-Meteo forecast failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const j = (await res.json()) as ForecastJson;
  const t = j.daily?.time;
  if (!t || t.length < 1) return null;
  const i = t.indexOf(dateIso);
  if (i < 0) return null;
  return {
    date: dateIso,
    weathercode: j.daily!.weathercode![i] ?? 0,
    tempMinC: j.daily!.temperature_2m_min?.[i] ?? null,
    tempMaxC: j.daily!.temperature_2m_max?.[i] ?? null,
    precipProbMax: j.daily!.precipitation_probability_max?.[i] ?? null,
  };
}

/** Short human label for WMO code (approximate, for operator copy). */
export function describeWmoWeatherCode(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1 || code === 2) return "Mainly clear to partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 56 && code <= 57) return "Freezing drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 66 && code <= 67) return "Freezing rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  if (code === 96 || code === 99) return "Thunderstorm with hail";
  return `Code ${code} (WMO)`;
}
