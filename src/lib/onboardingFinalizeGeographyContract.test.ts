/**
 * Tests for the TS mirror of the finalize-RPC geography guard.
 * The SQL `RAISE EXCEPTION` strings in
 *   supabase/migrations/20260506000000_finalize_onboarding_briefing_v1_geography_guard.sql
 * must match the `message` values asserted here.
 */
import { describe, expect, it } from "vitest";
import { validateFinalizeGeographyPayload } from "./onboardingFinalizeGeographyContract.ts";
import {
  STUDIO_BASE_LOCATION_SCHEMA_VERSION,
  type StudioBaseLocation,
} from "./studioBaseLocation.ts";
import type { BusinessScopeServiceArea } from "./serviceAreaPicker/serviceAreaPickerTypes.ts";

const validBase: StudioBaseLocation = {
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

const validArea: BusinessScopeServiceArea = {
  provider_id: "ne:country:RS",
  label: "Serbia",
  kind: "country",
  provider: "bundled",
  centroid: [20, 44],
  bbox: [18, 42, 23, 46],
  country_code: "RS",
  selected_at: "2026-04-17T00:00:00.000Z",
};

describe("validateFinalizeGeographyPayload", () => {
  it("returns null for a fully valid payload", () => {
    const r = validateFinalizeGeographyPayload({
      settings: { base_location: validBase },
      studioBusinessProfile: {
        extensions: { service_areas: [validArea] },
      },
    });
    expect(r).toBeNull();
  });

  it("rejects missing base_location", () => {
    const r = validateFinalizeGeographyPayload({
      settings: {},
      studioBusinessProfile: {
        extensions: { service_areas: [validArea] },
      },
    });
    expect(r?.code).toBe("base_location_missing");
    expect(r?.message).toContain("base_location is required");
  });

  it("rejects null base_location (explicit clear during finalize)", () => {
    // At finalize time, an explicit null is not a clear — it's a missing
    // identity field. The client must make the operator pick one before
    // the RPC.
    const r = validateFinalizeGeographyPayload({
      settings: { base_location: null },
      studioBusinessProfile: {
        extensions: { service_areas: [validArea] },
      },
    });
    expect(r?.code).toBe("base_location_missing");
  });

  it("rejects malformed base_location", () => {
    const r = validateFinalizeGeographyPayload({
      settings: { base_location: { provider_id: "x" } },
      studioBusinessProfile: {
        extensions: { service_areas: [validArea] },
      },
    });
    expect(r?.code).toBe("base_location_malformed");
    expect(r?.message).toContain("StudioBaseLocation contract");
  });

  it("rejects missing extensions", () => {
    const r = validateFinalizeGeographyPayload({
      settings: { base_location: validBase },
      studioBusinessProfile: {},
    });
    expect(r?.code).toBe("service_areas_missing");
  });

  it("rejects empty service_areas array", () => {
    const r = validateFinalizeGeographyPayload({
      settings: { base_location: validBase },
      studioBusinessProfile: {
        extensions: { service_areas: [] },
      },
    });
    expect(r?.code).toBe("service_areas_missing");
    expect(r?.message).toContain("at least one valid entry");
  });

  it("rejects service_areas that isn't an array (covers the {} migration bug)", () => {
    const r = validateFinalizeGeographyPayload({
      settings: { base_location: validBase },
      studioBusinessProfile: {
        extensions: { service_areas: {} },
      },
    });
    expect(r?.code).toBe("service_areas_malformed");
  });

  it("rejects service_areas containing a malformed row", () => {
    const r = validateFinalizeGeographyPayload({
      settings: { base_location: validBase },
      studioBusinessProfile: {
        extensions: {
          service_areas: [validArea, { provider_id: "broken" }],
        },
      },
    });
    expect(r?.code).toBe("service_areas_malformed");
  });

  it("rejects non-object settings / studioBusinessProfile", () => {
    expect(
      validateFinalizeGeographyPayload({
        settings: null,
        studioBusinessProfile: {
          extensions: { service_areas: [validArea] },
        },
      })?.code,
    ).toBe("base_location_missing");
    expect(
      validateFinalizeGeographyPayload({
        settings: { base_location: validBase },
        studioBusinessProfile: null,
      })?.code,
    ).toBe("service_areas_missing");
  });
});
