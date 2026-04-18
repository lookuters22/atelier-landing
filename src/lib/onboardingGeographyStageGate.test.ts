/**
 * Gating test for the two-phase geography onboarding stage.
 * See `onboardingGeographyStageGate.ts` for the predicate under test and
 * `OnboardingBriefingScopeStep.tsx` for the call site.
 */
import { describe, expect, it } from "vitest";
import { canAdvanceGeographyStage } from "./onboardingGeographyStageGate.ts";
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

describe("canAdvanceGeographyStage", () => {
  it("blocks the stage when nothing is picked", () => {
    expect(
      canAdvanceGeographyStage({ baseLocation: null, serviceAreas: [] }),
    ).toBe(false);
  });

  it("blocks when only the base location is set (the old bug)", () => {
    expect(
      canAdvanceGeographyStage({
        baseLocation: sampleBase,
        serviceAreas: [],
      }),
    ).toBe(false);
    expect(
      canAdvanceGeographyStage({
        baseLocation: sampleBase,
        serviceAreas: undefined,
      }),
    ).toBe(false);
  });

  it("blocks when only service areas are set", () => {
    expect(
      canAdvanceGeographyStage({
        baseLocation: null,
        serviceAreas: [sampleArea],
      }),
    ).toBe(false);
    expect(
      canAdvanceGeographyStage({
        baseLocation: undefined,
        serviceAreas: [sampleArea],
      }),
    ).toBe(false);
  });

  it("advances only when both halves are answered", () => {
    expect(
      canAdvanceGeographyStage({
        baseLocation: sampleBase,
        serviceAreas: [sampleArea],
      }),
    ).toBe(true);
  });
});
