/**
 * Contract tests for the geography split between
 *   - `photographers.settings.base_location`        (identity)
 *   - `studio_business_profiles.extensions.service_areas` (coverage)
 *
 * Guards:
 *   - `mapOnboardingPayloadToStorage` still wires each field to the right
 *     storage bucket (the two must never cross-pollute).
 *   - `base_location: null` round-trips through the settings patch /
 *     merge as an explicit clear, not a dropped field.
 *   - An empty `service_areas` selection is omitted from the persisted
 *     extensions blob rather than written as `[]` or `{}`.
 */
import { describe, expect, it } from "vitest";
import {
  mapOnboardingPayloadToStorage,
  mergeOnboardingSettingsPatch,
  type OnboardingPayloadV4,
} from "./onboardingV4Payload.ts";
import {
  BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
  type BusinessScopeExtensionsV2,
} from "./onboardingBusinessScopeExtensions.ts";
import {
  STUDIO_BASE_LOCATION_SCHEMA_VERSION,
  type StudioBaseLocation,
} from "./studioBaseLocation.ts";
import type { BusinessScopeServiceArea } from "./serviceAreaPicker/serviceAreaPickerTypes.ts";

const PHOTOGRAPHER_ID = "00000000-0000-0000-0000-000000000001";

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

function basePayload(
  over: Partial<OnboardingPayloadV4> = {},
): OnboardingPayloadV4 {
  return {
    settings_identity: {},
    studio_scope: {},
    playbook_seeds: [],
    ...over,
  };
}

describe("OnboardingPayloadV4 → storage: geography split", () => {
  it("routes base_location into settingsPatch (identity)", () => {
    const { settingsPatch, studioBusinessProfile } =
      mapOnboardingPayloadToStorage(
        PHOTOGRAPHER_ID,
        basePayload({
          settings_identity: { base_location: sampleBase },
        }),
      );
    expect(settingsPatch.base_location).toEqual(sampleBase);
    // Coverage bucket must not leak identity-level data.
    expect(
      JSON.stringify(studioBusinessProfile.extensions),
    ).not.toContain("Sombor");
  });

  it("propagates base_location: null as an explicit clear", () => {
    const { settingsPatch } = mapOnboardingPayloadToStorage(
      PHOTOGRAPHER_ID,
      basePayload({
        settings_identity: { base_location: null },
      }),
    );
    expect(settingsPatch).toHaveProperty("base_location", null);

    // Round-trip through merge: `null` is persisted verbatim (distinct
    // from `undefined`, which would delete the key). This is the
    // contract `parsePhotographerSettings` also honors — the UI needs
    // to tell "explicitly cleared" apart from "never touched".
    const merged = mergeOnboardingSettingsPatch(
      { base_location: sampleBase, studio_name: "Preserved" },
      settingsPatch,
    );
    expect(merged).toHaveProperty("base_location", null);
    expect(merged.studio_name).toBe("Preserved");
  });

  it("routes service_areas into studio_business_profiles.extensions", () => {
    const { studioBusinessProfile, settingsPatch } =
      mapOnboardingPayloadToStorage(
        PHOTOGRAPHER_ID,
        basePayload({
          business_scope_extensions: {
            schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
            service_areas: [sampleArea],
          } satisfies BusinessScopeExtensionsV2,
        }),
      );
    const ext = studioBusinessProfile.extensions as {
      service_areas?: BusinessScopeServiceArea[];
    };
    expect(ext.service_areas).toHaveLength(1);
    expect(ext.service_areas?.[0]!.provider_id).toBe("ne:country:RS");
    // Identity bucket must not leak coverage-level data.
    expect(settingsPatch).not.toHaveProperty("service_areas");
  });

  it("omits service_areas from extensions when the selection is empty", () => {
    const { studioBusinessProfile } = mapOnboardingPayloadToStorage(
      PHOTOGRAPHER_ID,
      basePayload({
        business_scope_extensions: {
          schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
          service_areas: [],
        } satisfies BusinessScopeExtensionsV2,
      }),
    );
    expect(studioBusinessProfile.extensions).not.toHaveProperty(
      "service_areas",
    );
  });

  it("carries both halves independently when both are provided", () => {
    const { settingsPatch, studioBusinessProfile } =
      mapOnboardingPayloadToStorage(
        PHOTOGRAPHER_ID,
        basePayload({
          settings_identity: { base_location: sampleBase },
          business_scope_extensions: {
            schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
            service_areas: [sampleArea],
          },
        }),
      );
    expect(settingsPatch.base_location?.provider_id).toBe("ne:city:Sombor");
    const ext = studioBusinessProfile.extensions as {
      service_areas?: BusinessScopeServiceArea[];
    };
    expect(ext.service_areas?.[0]!.provider_id).toBe("ne:country:RS");
  });
});
