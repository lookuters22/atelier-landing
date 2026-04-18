/**
 * Contract tests for the `base_location` identity field on
 * `photographers.settings`. Guards:
 *   - parse returns a typed record for well-formed blobs;
 *   - parse returns `null` (explicit absence) when the stored value is
 *     literal `null`;
 *   - parse drops garbage silently (never throws);
 *   - merge writes the field when set and *removes* it when patched to
 *     `undefined`, while preserving non-contract keys on the source row.
 */
import { describe, expect, it } from "vitest";
import {
  mergePhotographerSettings,
  parsePhotographerSettings,
} from "./photographerSettings.ts";
import {
  STUDIO_BASE_LOCATION_SCHEMA_VERSION,
  type StudioBaseLocation,
} from "./studioBaseLocation.ts";

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

describe("photographerSettings.base_location", () => {
  it("parses a well-formed stored base_location", () => {
    const parsed = parsePhotographerSettings({ base_location: sampleBase });
    expect(parsed.base_location?.provider_id).toBe("ne:city:Sombor");
    expect(parsed.base_location?.kind).toBe("city");
  });

  it("treats stored null as an explicit clear, not a dropped field", () => {
    const parsed = parsePhotographerSettings({ base_location: null });
    expect(parsed).toHaveProperty("base_location", null);
  });

  it("drops malformed values silently", () => {
    const parsed = parsePhotographerSettings({
      base_location: { provider_id: "x" },
    });
    expect(parsed.base_location).toBeUndefined();
  });

  it("merge writes the field and preserves unrelated keys", () => {
    const merged = mergePhotographerSettings(
      { business_profile_version: "42", studio_name: "Studio A" },
      { base_location: sampleBase },
    );
    expect(merged.base_location).toEqual(sampleBase);
    expect(merged.business_profile_version).toBe("42");
    expect(merged.studio_name).toBe("Studio A");
  });

  it("merge with base_location: undefined removes the key", () => {
    const merged = mergePhotographerSettings(
      { base_location: sampleBase, studio_name: "Keep" },
      { base_location: undefined },
    );
    expect(merged.base_location).toBeUndefined();
    expect(merged.studio_name).toBe("Keep");
  });

  it("merge with base_location: null persists the explicit clear", () => {
    // Distinct from `undefined` — `null` is the UI's way of saying
    // "operator cleared their base"; the store should remember the
    // explicit null rather than dropping the key.
    const merged = mergePhotographerSettings(
      { base_location: sampleBase },
      { base_location: null },
    );
    expect(merged).toHaveProperty("base_location", null);
  });

  it("merge defangs a malformed base_location (defence in depth)", () => {
    // Normal TS types block this, but `as any` smuggling is a real risk.
    // DB CHECK would catch it; we reject here first so the client never
    // writes garbage. Unrelated keys must survive the drop.
    const merged = mergePhotographerSettings(
      { studio_name: "Keep" },
      {
        base_location: { provider_id: "x" } as unknown as StudioBaseLocation,
      },
    );
    expect(merged.base_location).toBeUndefined();
    expect(merged.studio_name).toBe("Keep");
  });

  it("merge parses + normalizes a loosely-typed valid base_location", () => {
    const raw = {
      provider_id: "ne:city:Paris",
      label: "Paris",
      kind: "city",
      provider: "bundled",
      centroid: [2.35, 48.86],
      bbox: [2.22, 48.81, 2.47, 48.91],
      selected_at: "2026-04-17T00:00:00.000Z",
    };
    const merged = mergePhotographerSettings(
      {},
      { base_location: raw as unknown as StudioBaseLocation },
    );
    expect(
      (merged.base_location as StudioBaseLocation).provider_id,
    ).toBe("ne:city:Paris");
    expect(
      (merged.base_location as StudioBaseLocation).schema_version,
    ).toBe(STUDIO_BASE_LOCATION_SCHEMA_VERSION);
  });
});
