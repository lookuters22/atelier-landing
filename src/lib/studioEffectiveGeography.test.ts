/**
 * Tests for the effective-geography helper + bbox matcher.
 */
import { describe, expect, it } from "vitest";
import {
  bboxContainsPoint,
  bboxesOverlap,
  effectiveGeographyMayCover,
  readStudioEffectiveGeography,
  readStudioEffectiveGeographyFromRows,
} from "./studioEffectiveGeography.ts";
import {
  STUDIO_BASE_LOCATION_SCHEMA_VERSION,
  type StudioBaseLocation,
} from "./studioBaseLocation.ts";
import type { BusinessScopeServiceArea } from "./serviceAreaPicker/serviceAreaPickerTypes.ts";

const sampleBase: StudioBaseLocation = {
  schema_version: STUDIO_BASE_LOCATION_SCHEMA_VERSION,
  provider_id: "ne:city:Sombor",
  label: "Sombor",
  kind: "city",
  provider: "bundled",
  centroid: [19.11, 45.77],
  bbox: [18.9, 45.6, 19.3, 45.9],
  country_code: "RS",
  selected_at: "2026-04-17T00:00:00.000Z",
};

const serbia: BusinessScopeServiceArea = {
  provider_id: "ne:country:RS",
  label: "Serbia",
  kind: "country",
  provider: "bundled",
  centroid: [20, 44],
  bbox: [18, 42, 23, 46],
  country_code: "RS",
  selected_at: "2026-04-17T00:00:00.000Z",
};

const worldwide: BusinessScopeServiceArea = {
  provider_id: "ne:worldwide",
  label: "Worldwide",
  kind: "worldwide",
  provider: "bundled",
  centroid: [0, 0],
  bbox: [-180, -85, 180, 85],
  selected_at: "2026-04-17T00:00:00.000Z",
};

describe("readStudioEffectiveGeography", () => {
  it("returns a stable empty shape for fully absent input", () => {
    const e = readStudioEffectiveGeography({});
    expect(e).toEqual({
      posture: "unset",
      base_location: null,
      has_base_location: false,
      service_areas: [],
      has_explicit_service_areas: false,
      geographic_scope: null,
      blocked_regions: [],
    });
  });

  it("composes all three layers and reports explicit posture", () => {
    const e = readStudioEffectiveGeography({
      settings: { base_location: sampleBase },
      extensions: { service_areas: [serbia] },
      geographic_scope: { mode: "worldwide", blocked_regions: ["antarctica"] },
    });
    expect(e.posture).toBe("explicit_service_areas");
    expect(e.has_base_location).toBe(true);
    expect(e.has_explicit_service_areas).toBe(true);
    expect(e.service_areas).toHaveLength(1);
    expect(e.geographic_scope?.mode).toBe("worldwide");
    expect(e.blocked_regions).toEqual(["antarctica"]);
  });

  it("falls back to coarse posture when service_areas is empty", () => {
    const e = readStudioEffectiveGeography({
      settings: { base_location: sampleBase },
      extensions: { service_areas: [] },
      geographic_scope: { mode: "domestic" },
    });
    expect(e.posture).toBe("coarse_geographic_scope");
    expect(e.has_explicit_service_areas).toBe(false);
    expect(e.geographic_scope?.mode).toBe("domestic");
  });

  it("heals malformed blobs to the empty shape (no throw)", () => {
    const e = readStudioEffectiveGeography({
      settings: 42 as unknown,
      extensions: "oops" as unknown,
      geographic_scope: { mode: "not-a-mode" },
    });
    expect(e.posture).toBe("unset");
    expect(e.has_base_location).toBe(false);
    expect(e.has_explicit_service_areas).toBe(false);
  });

  it("readStudioEffectiveGeographyFromRows unwraps a whole SBP row", () => {
    const e = readStudioEffectiveGeographyFromRows({
      photographerSettings: { base_location: sampleBase },
      studioBusinessProfile: {
        extensions: { service_areas: [serbia] },
        geographic_scope: { mode: "worldwide" },
      },
    });
    expect(e.has_base_location).toBe(true);
    expect(e.posture).toBe("explicit_service_areas");
    expect(e.service_areas[0].provider_id).toBe("ne:country:RS");
  });
});

describe("effectiveGeographyMayCover", () => {
  const effectiveSerbia = readStudioEffectiveGeography({
    extensions: { service_areas: [serbia] },
  });
  const effectiveWorldwide = readStudioEffectiveGeography({
    extensions: { service_areas: [worldwide] },
  });
  const effectiveCoarse = readStudioEffectiveGeography({
    geographic_scope: { mode: "worldwide" },
  });
  const effectiveEmpty = readStudioEffectiveGeography({});

  it("returns no_query when neither point nor bbox is supplied", () => {
    const r = effectiveGeographyMayCover(effectiveSerbia, {});
    expect(r).toEqual({ matched: false, reason: "no_query" });
  });

  it("matches a point inside a service-area bbox", () => {
    const r = effectiveGeographyMayCover(effectiveSerbia, {
      point: [20.5, 44.8],
    });
    expect(r.matched).toBe(true);
    if (r.matched) {
      expect(r.via).toBe("service_area");
    }
  });

  it("does not match a point outside every service-area bbox", () => {
    const r = effectiveGeographyMayCover(effectiveSerbia, {
      point: [-74.0, 40.7], // NYC
    });
    expect(r).toEqual({ matched: false, reason: "no_coverage" });
  });

  it("matches overlapping bboxes", () => {
    const r = effectiveGeographyMayCover(effectiveSerbia, {
      bbox: [19, 44, 21, 45],
    });
    expect(r.matched).toBe(true);
  });

  it("worldwide service area matches any query", () => {
    const r = effectiveGeographyMayCover(effectiveWorldwide, {
      point: [-175, -10],
    });
    expect(r).toEqual({ matched: true, via: "worldwide_service_area" });
  });

  it("coarse scope alone never flips matched:true", () => {
    const r = effectiveGeographyMayCover(effectiveCoarse, {
      point: [20, 44],
    });
    expect(r).toEqual({
      matched: false,
      reason: "coarse_scope_only",
      mode: "worldwide",
    });
  });

  it("empty effective returns no_coverage", () => {
    const r = effectiveGeographyMayCover(effectiveEmpty, {
      point: [20, 44],
    });
    expect(r).toEqual({ matched: false, reason: "no_coverage" });
  });
});

describe("bbox primitives", () => {
  it("bboxContainsPoint", () => {
    expect(bboxContainsPoint([0, 0, 10, 10], [5, 5])).toBe(true);
    expect(bboxContainsPoint([0, 0, 10, 10], [0, 0])).toBe(true); // inclusive
    expect(bboxContainsPoint([0, 0, 10, 10], [10, 10])).toBe(true);
    expect(bboxContainsPoint([0, 0, 10, 10], [11, 5])).toBe(false);
    expect(bboxContainsPoint([0, 0, 10, 10], [-1, 5])).toBe(false);
  });

  it("bboxesOverlap", () => {
    expect(bboxesOverlap([0, 0, 10, 10], [5, 5, 15, 15])).toBe(true);
    expect(bboxesOverlap([0, 0, 10, 10], [10, 10, 20, 20])).toBe(true); // touching
    expect(bboxesOverlap([0, 0, 10, 10], [11, 11, 20, 20])).toBe(false);
    expect(bboxesOverlap([0, 0, 10, 10], [-10, -10, -1, -1])).toBe(false);
  });
});
