/**
 * Runtime-readiness helper tests.
 *
 * The helper is the single seam future backend/runtime consumers (lead
 * routing, directory scoring, …) should use to read service-area
 * coverage out of `studio_business_profiles.extensions`. It must:
 *
 *   - return an empty result for malformed blobs (including the `{}`
 *     shape corrected by the 20260502 migration);
 *   - return the normalized array when the blob is valid;
 *   - mirror the same answer whether called with the full profile row
 *     or just the `extensions` sub-blob.
 */
import { describe, expect, it } from "vitest";
import {
  readStudioServiceAreasReadinessFromExtensions,
  readStudioServiceAreasReadinessFromProfile,
} from "./studioServiceAreasReadiness.ts";
import type { BusinessScopeServiceArea } from "./serviceAreaPickerTypes.ts";

const sampleArea: BusinessScopeServiceArea = {
  provider_id: "ne:country:RS",
  label: "Serbia",
  kind: "country",
  provider: "bundled",
  centroid: [20, 44],
  bbox: [18, 42, 23, 46],
  country_code: "RS",
  selected_at: "2026-04-17T00:00:00.000Z",
};

describe("studioServiceAreasReadiness — from extensions blob", () => {
  it("handles null / non-object extensions safely", () => {
    for (const bad of [null, undefined, "x", 42, true, []]) {
      const r = readStudioServiceAreasReadinessFromExtensions(bad);
      expect(r.hasServiceAreas).toBe(false);
      expect(r.serviceAreas).toEqual([]);
    }
  });

  it("returns empty when service_areas is missing", () => {
    const r = readStudioServiceAreasReadinessFromExtensions({
      schema_version: 2,
    });
    expect(r.hasServiceAreas).toBe(false);
    expect(r.serviceAreas).toEqual([]);
  });

  it("coerces the legacy `{}` shape to an empty array (the migration bug)", () => {
    const r = readStudioServiceAreasReadinessFromExtensions({
      schema_version: 2,
      service_areas: {},
      travel_constraints: {},
    });
    expect(r.hasServiceAreas).toBe(false);
    expect(r.serviceAreas).toEqual([]);
  });

  it("returns normalized areas when the blob is valid", () => {
    const r = readStudioServiceAreasReadinessFromExtensions({
      schema_version: 2,
      service_areas: [sampleArea],
    });
    expect(r.hasServiceAreas).toBe(true);
    expect(r.serviceAreas).toHaveLength(1);
    expect(r.serviceAreas[0]!.provider_id).toBe("ne:country:RS");
  });

  it("drops malformed rows without rejecting the whole array", () => {
    const r = readStudioServiceAreasReadinessFromExtensions({
      schema_version: 2,
      service_areas: [
        sampleArea,
        { not: "an area" },
        { ...sampleArea, provider_id: "" },
      ],
    });
    expect(r.serviceAreas).toHaveLength(1);
    expect(r.serviceAreas[0]!.provider_id).toBe("ne:country:RS");
  });
});

describe("studioServiceAreasReadiness — from full profile row", () => {
  it("mirrors the extensions-level answer", () => {
    const r = readStudioServiceAreasReadinessFromProfile({
      photographer_id: "abc",
      extensions: {
        schema_version: 2,
        service_areas: [sampleArea],
      },
    });
    expect(r.hasServiceAreas).toBe(true);
    expect(r.serviceAreas[0]!.label).toBe("Serbia");
  });

  it("is safe when the row / extensions are missing or malformed", () => {
    expect(
      readStudioServiceAreasReadinessFromProfile(null).hasServiceAreas,
    ).toBe(false);
    expect(
      readStudioServiceAreasReadinessFromProfile({ extensions: null })
        .hasServiceAreas,
    ).toBe(false);
    expect(
      readStudioServiceAreasReadinessFromProfile({
        extensions: { service_areas: {} },
      }).hasServiceAreas,
    ).toBe(false);
  });
});
