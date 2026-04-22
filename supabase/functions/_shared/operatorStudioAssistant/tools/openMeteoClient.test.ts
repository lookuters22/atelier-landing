import { describe, expect, it, vi } from "vitest";
import { openMeteoDailyForDate, openMeteoGeocode, describeWmoWeatherCode } from "./openMeteoClient.ts";

describe("openMeteoClient", () => {
  it("openMeteoGeocode parses the first result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { name: "Budapest", latitude: 47.498, longitude: 19.04, country: "Hungary" },
          ],
        }),
    });
    const g = await openMeteoGeocode("Budapest", fetchImpl);
    expect(g?.name).toBe("Budapest");
    expect(g?.latitude).toBeCloseTo(47.498, 2);
    expect(g?.country).toBe("Hungary");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const u = String(fetchImpl.mock.calls[0]![0]);
    expect(u).toContain("geocoding-api.open-meteo.com");
    expect(u).toContain("name=Budapest");
  });

  it("openMeteoGeocode returns null on empty results", async () => {
    const g = await openMeteoGeocode("zzzz_nothing", async () => ({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }) as unknown as typeof fetch);
    expect(g).toBeNull();
  });

  it("openMeteoDailyForDate returns the day row from daily arrays", async () => {
    const d = "2026-05-10";
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          daily: {
            time: [d],
            weathercode: [3],
            temperature_2m_max: [18.1],
            temperature_2m_min: [9.2],
            precipitation_probability_max: [22],
          },
        }),
    });
    const p = await openMeteoDailyForDate(47.4, 19.0, d, fetchImpl);
    expect(p?.date).toBe(d);
    expect(p?.weathercode).toBe(3);
    expect(p?.tempMaxC).toBeCloseTo(18.1, 3);
    expect(p?.tempMinC).toBeCloseTo(9.2, 3);
    expect(p?.precipProbMax).toBe(22);
    const u = String(fetchImpl.mock.calls[0]![0]);
    expect(u).toContain("api.open-meteo.com");
    expect(u).toContain("start_date=" + d);
  });

  it("describeWmoWeatherCode labels common codes", () => {
    expect(describeWmoWeatherCode(0)).toMatch(/[Cc]lear/);
    expect(describeWmoWeatherCode(61)).toMatch(/[Rr]ain/);
  });
});
