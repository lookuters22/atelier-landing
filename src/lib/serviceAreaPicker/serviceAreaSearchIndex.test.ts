import { describe, expect, it } from "vitest";
import type { ServiceAreaLabelsBundle } from "./serviceAreaPickerTypes.ts";
import { buildServiceAreaSearchIndex, searchServiceAreaIndex } from "./serviceAreaSearchIndex.ts";

const miniBundle: ServiceAreaLabelsBundle = {
  schema_version: 1,
  countries: [
    {
      id: "ne:country:BE",
      label: "Belgium",
      iso2: "BE",
      centroid: [4.5, 50.5],
      bbox: [2, 49, 6, 52],
    },
  ],
  regions: [],
  cities: [
    {
      id: "gn:city:792680",
      label: "Belgrade",
      iso2: "RS",
      centroid: [20.46, 44.8],
      bbox: [20, 44, 21, 45],
      population: 1_200_000,
    },
    {
      id: "gn:city:2988507",
      label: "Paris",
      iso2: "FR",
      centroid: [2.35, 48.86],
      bbox: [2, 48, 3, 49],
      population: 2_000_000,
    },
  ],
};

describe("serviceAreaSearchIndex", () => {
  it("matches diacritic-insensitively when labels use diacritics", () => {
    const bundle: ServiceAreaLabelsBundle = {
      ...miniBundle,
      cities: [
        {
          id: "gn:city:1",
          label: "Niš",
          iso2: "RS",
          centroid: [22, 43],
          bbox: [21, 42, 23, 44],
          population: 200_000,
        },
      ],
    };
    const idx = buildServiceAreaSearchIndex(bundle);
    const hits = searchServiceAreaIndex(idx, "nis");
    expect(hits.some((h) => h.label === "Niš")).toBe(true);
  });

  it("ranks country tier before city for same strength match", () => {
    const idx = buildServiceAreaSearchIndex(miniBundle);
    const hits = searchServiceAreaIndex(idx, "bel", { limit: 8 });
    expect(hits[0]!.kind).toBe("country");
    expect(hits[0]!.label).toBe("Belgium");
  });

  it("respects limit", () => {
    const idx = buildServiceAreaSearchIndex(miniBundle);
    expect(searchServiceAreaIndex(idx, "a", { limit: 1 })).toHaveLength(1);
  });

  it("boosts biasCountryCode", () => {
    const idx = buildServiceAreaSearchIndex(miniBundle);
    const hits = searchServiceAreaIndex(idx, "par", { limit: 8, biasCountryCode: "FR" });
    expect(hits[0]!.label).toBe("Paris");
  });
});
