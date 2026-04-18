import { describe, expect, it } from "vitest";
import type { BusinessScopeExtensionsV2 } from "../onboardingBusinessScopeExtensions.ts";
import { BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION } from "../onboardingBusinessScopeExtensions.ts";
import {
  normalizeServiceAreasFromUnknown,
  readServiceAreasFromExtensions,
  writeServiceAreasIntoExtensions,
} from "./businessScopeServiceAreasAdapter.ts";
import type { BusinessScopeServiceArea } from "./serviceAreaPickerTypes.ts";

const baseExt: BusinessScopeExtensionsV2 = {
  schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
};

const validArea = (over: Partial<BusinessScopeServiceArea> = {}): BusinessScopeServiceArea => ({
  provider_id: "ne:country:RS",
  label: "Serbia",
  kind: "country",
  provider: "bundled",
  centroid: [20, 44],
  bbox: [18, 42, 23, 46],
  country_code: "RS",
  selected_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("businessScopeServiceAreasAdapter", () => {
  it("normalizes and dedupes by provider:provider_id", () => {
    const raw = [
      validArea(),
      validArea({ provider_id: "ne:country:RS", label: "Dup" }),
      { ...validArea(), provider_id: "", label: "Bad" },
    ];
    const out = normalizeServiceAreasFromUnknown(raw);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe("Serbia");
  });

  it("caps at 50", () => {
    const raw = Array.from({ length: 60 }, (_, i) =>
      validArea({ provider_id: `ne:country:X${i}`, label: `C${i}` }),
    );
    expect(normalizeServiceAreasFromUnknown(raw)).toHaveLength(50);
  });

  it("rejects unknown kind or provider", () => {
    expect(
      normalizeServiceAreasFromUnknown([
        { ...validArea(), kind: "planet" as BusinessScopeServiceArea["kind"] },
      ]),
    ).toHaveLength(0);
    expect(
      normalizeServiceAreasFromUnknown([{ ...validArea(), provider: "mapbox" as "bundled" }]),
    ).toHaveLength(0);
  });

  it("writeServiceAreasIntoExtensions removes field when empty", () => {
    const withAreas = writeServiceAreasIntoExtensions(baseExt, [validArea()]);
    expect(withAreas.service_areas).toHaveLength(1);
    const cleared = writeServiceAreasIntoExtensions(withAreas, []);
    expect(cleared.service_areas).toBeUndefined();
  });

  it("readServiceAreasFromExtensions", () => {
    const ext = writeServiceAreasIntoExtensions(baseExt, [validArea()]);
    expect(readServiceAreasFromExtensions(ext)).toHaveLength(1);
  });

  it("treats non-array input as empty (covers the migration `{}` bug)", () => {
    // The 20260501 migration briefly wrote `service_areas: {}` instead
    // of `[]`. Normalizers must defang this without throwing so readers
    // don't have to special-case the bad shape.
    expect(normalizeServiceAreasFromUnknown({})).toEqual([]);
    expect(normalizeServiceAreasFromUnknown(null)).toEqual([]);
    expect(normalizeServiceAreasFromUnknown(undefined)).toEqual([]);
    expect(normalizeServiceAreasFromUnknown("not an array")).toEqual([]);
  });
});
