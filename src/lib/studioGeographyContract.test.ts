/**
 * Tests for the canonical geography interpretation contract.
 * See `studioGeographyContract.ts` for the authoritative rules.
 */
import { describe, expect, it } from "vitest";
import {
  classifyStudioGeographyPosture,
  GEOGRAPHIC_SCOPE_MODES,
  hasExplicitServiceAreas,
  hasStudioBaseLocation,
  parseStudioGeographicScope,
  readStudioGeographySignals,
} from "./studioGeographyContract.ts";
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

describe("parseStudioGeographicScope", () => {
  it("accepts each GeographyScopeMode value", () => {
    for (const mode of GEOGRAPHIC_SCOPE_MODES) {
      const parsed = parseStudioGeographicScope({ schema_version: 2, mode });
      expect(parsed?.mode).toBe(mode);
      expect(parsed?.blocked_regions).toEqual([]);
    }
  });

  it("normalizes blocked_regions, dropping blanks and non-strings", () => {
    const parsed = parseStudioGeographicScope({
      mode: "regional",
      blocked_regions: ["  EU ", 3, "", "US"],
    });
    expect(parsed?.blocked_regions).toEqual(["EU", "US"]);
  });

  it("returns null for missing / malformed / unknown modes", () => {
    expect(parseStudioGeographicScope(null)).toBeNull();
    expect(parseStudioGeographicScope(undefined)).toBeNull();
    expect(parseStudioGeographicScope([])).toBeNull();
    expect(parseStudioGeographicScope({})).toBeNull();
    expect(parseStudioGeographicScope({ mode: "galactic" })).toBeNull();
  });
});

describe("readStudioGeographySignals", () => {
  it("returns all-null/empty signals for fully absent input", () => {
    const s = readStudioGeographySignals({});
    expect(s.baseLocation).toBeNull();
    expect(s.serviceAreas).toEqual([]);
    expect(s.geographicScope).toBeNull();
  });

  it("extracts base_location from settings and service_areas from extensions", () => {
    const s = readStudioGeographySignals({
      settings: { base_location: sampleBase, studio_name: "X" },
      extensions: { schema_version: 2, service_areas: [sampleArea] },
      geographic_scope: { schema_version: 2, mode: "regional" },
    });
    expect(s.baseLocation?.provider_id).toBe(sampleBase.provider_id);
    expect(s.serviceAreas).toHaveLength(1);
    expect(s.geographicScope?.mode).toBe("regional");
  });

  it("degrades malformed storage to safe defaults (no throw)", () => {
    const s = readStudioGeographySignals({
      settings: { base_location: { provider_id: "x" } },
      extensions: { service_areas: {} },
      geographic_scope: [],
    });
    expect(s.baseLocation).toBeNull();
    expect(s.serviceAreas).toEqual([]);
    expect(s.geographicScope).toBeNull();
  });

  it("ignores array-shaped settings / extensions blobs", () => {
    const s = readStudioGeographySignals({
      settings: [sampleBase],
      extensions: [sampleArea],
    });
    expect(s.baseLocation).toBeNull();
    expect(s.serviceAreas).toEqual([]);
  });
});

describe("classifyStudioGeographyPosture (precedence rules)", () => {
  it("explicit_service_areas wins even when geographic_scope is set", () => {
    const s = readStudioGeographySignals({
      settings: { base_location: sampleBase },
      extensions: { service_areas: [sampleArea] },
      geographic_scope: { mode: "worldwide" },
    });
    expect(classifyStudioGeographyPosture(s)).toBe("explicit_service_areas");
  });

  it("falls back to coarse_geographic_scope when service_areas is empty", () => {
    const s = readStudioGeographySignals({
      settings: { base_location: sampleBase },
      extensions: { service_areas: [] },
      geographic_scope: { mode: "domestic" },
    });
    expect(classifyStudioGeographyPosture(s)).toBe("coarse_geographic_scope");
  });

  it("returns 'unset' when neither layer is usable", () => {
    const s = readStudioGeographySignals({
      settings: { base_location: sampleBase },
    });
    expect(classifyStudioGeographyPosture(s)).toBe("unset");
  });

  it("base_location is independent of posture (rule 1)", () => {
    const withBase = readStudioGeographySignals({
      settings: { base_location: sampleBase },
      extensions: { service_areas: [sampleArea] },
    });
    const withoutBase = readStudioGeographySignals({
      extensions: { service_areas: [sampleArea] },
    });
    expect(classifyStudioGeographyPosture(withBase)).toBe(
      "explicit_service_areas",
    );
    expect(classifyStudioGeographyPosture(withoutBase)).toBe(
      "explicit_service_areas",
    );
    expect(hasStudioBaseLocation(withBase)).toBe(true);
    expect(hasStudioBaseLocation(withoutBase)).toBe(false);
  });
});

describe("convenience predicates", () => {
  it("hasExplicitServiceAreas tracks array length", () => {
    expect(
      hasExplicitServiceAreas({
        baseLocation: null,
        serviceAreas: [sampleArea],
        geographicScope: null,
      }),
    ).toBe(true);
    expect(
      hasExplicitServiceAreas({
        baseLocation: null,
        serviceAreas: [],
        geographicScope: null,
      }),
    ).toBe(false);
  });

  it("hasStudioBaseLocation tracks identity independently of coverage", () => {
    expect(
      hasStudioBaseLocation({
        baseLocation: sampleBase,
        serviceAreas: [],
        geographicScope: null,
      }),
    ).toBe(true);
    expect(
      hasStudioBaseLocation({
        baseLocation: null,
        serviceAreas: [sampleArea],
        geographicScope: null,
      }),
    ).toBe(false);
  });
});
