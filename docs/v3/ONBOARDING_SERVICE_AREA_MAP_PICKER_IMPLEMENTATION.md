# Onboarding — Service Area Map Picker (Implementation Plan)

> **Superseded for execution.** Use the **authoritative plan** at  
> [`.cursor/plans/service_area_map_picker_4565a808.plan.md`](../../.cursor/plans/service_area_map_picker_4565a808.plan.md)  
> (**v2: fully self-owned** — bundled Natural Earth + GeoNames in `public/`, MapLibre only, no Mapbox / no external geocoders / no API keys).  
> This file below is **v1** (Mapbox + optional Nominatim slices). Keep it only as historical UX / slice-prompt reference; do not implement from it unless you deliberately want third-party geocoding.

---

Status: planning document (v1 — historical). No code in this repo has changed yet.

This document specifies how to add a **map‑based "Where do you serve your customers?" picker** to onboarding, modelled on Google Business Profile's area picker:

- A search input that autocompletes places (cities, counties, regions, countries).
- A map preview that shades the selected areas as the user adds chips.
- A row of suggested chips below the input (deselectable).
- All selected areas are persisted as structured records — not free text.

It is written so a vibecoder can implement it slice by slice in Cursor, with each slice small enough to fit in one prompt and each helper file kept under ~150 lines.

It does **not** change the existing geography contract. `BusinessScopeDeterministicV1.geography.mode` (the `local_only` / `domestic` / `regional` / `europe` / `worldwide` enum) stays exactly as it is. The map picker is added as a new, richer **extension** layer that lives in the existing `business_scope_extensions` JSONB blob — no DB migration.

---

## 1. Goals and non‑goals

### Goals

1. Let the user search and click areas (cities, counties, regions, countries) and see the union shade live on a map.
2. Persist the selection as a structured list with provider id, label, type, centroid, and bbox.
3. Keep the existing geography stance enum and `custom_geography_labels` working — no schema migration, no breakage of existing onboarding payloads.
4. Use small, swappable helper files. No single file over ~150 lines. Provider‑agnostic interface so we can swap Mapbox for Google or for OSM later.
5. Be testable: every helper has pure functions; every component takes a provider object as a prop.

### Non‑goals

1. We are **not** removing the current `Geography` stage of `OnboardingBriefingScopeStep.tsx`. The map picker is added either as a new sub‑stage *after* `geography` and *before* `travel`, or as the new shape of the `geography` stage with the existing enum auto‑derived from the selection. (See §6 for both options; the recommended one is option B with a fallback chip if the user does not want to use the map.)
2. We are **not** wiring this data into runtime branching yet. The current `studio_business_profiles` table has no runtime consumer (see `ONBOARDING_PRODUCT_BACKEND_REVIEW.md`). The map picker fills `business_scope_extensions.service_areas` — the consumer can be wired later without re‑asking the user.
3. We are **not** building a polygon editor. The user selects pre‑defined administrative areas; the geometries come from the provider.
4. We are **not** introducing a new server function. Geocoding calls go directly from the browser to the provider with a public key (Mapbox/Google) or to the public Nominatim endpoint (OSM fallback). Rate limiting and key rotation are handled in §4.

---

## 2. Reference UX (from the screenshots)

We mirror Google Business Profile's "Where do you serve your customers?" pattern:

1. Title + helper text on the right column.
2. A search input ("Search and select areas") that autocompletes.
3. Below the input, a row of pre‑populated suggestion chips ("Bay area", "Northern California", "Alameda County", etc.). Selected chips show a check; unselected do not.
4. On the left column, a map preview that pans/zooms to fit the union of selected areas and shades each one as a translucent polygon.
5. A "Next" button that advances onboarding once at least one area is selected.

The picker is one component (`ServiceAreaPicker`) composed of four small subcomponents. The map shading is done client‑side from polygon GeoJSON returned by the provider.

---

## 3. Architecture overview

Five layers, each owned by a small file. The arrows show data flow only.

```
[Onboarding step]
       │
       ▼
[ServiceAreaPicker.tsx]              ← orchestrator, ~120 lines
       │
       ├── [ServiceAreaPickerSearchInput.tsx]      ← input + suggestion popover, ~80 lines
       ├── [ServiceAreaPickerSuggestions.tsx]      ← pre‑loaded chip row, ~80 lines
       ├── [ServiceAreaPickerChip.tsx]             ← single chip, ~60 lines
       └── [ServiceAreaPickerMapPreview.tsx]       ← MapLibre wrapper, ~120 lines
                  │
                  ▼
        [useServiceAreaPickerSelection.ts]          ← selection state hook, ~80 lines
        [useServiceAreaPickerSearch.ts]             ← debounced search hook, ~80 lines
                  │
                  ▼
        [serviceAreaProviderClient.ts]              ← provider interface, ~80 lines
                  │
                  ▼
        [serviceAreaProviderMapbox.ts]              ← concrete impl, ~120 lines
        [serviceAreaProviderNominatim.ts] (opt.)    ← OSS fallback impl, ~120 lines
                  │
                  ▼
        [businessScopeServiceAreasAdapter.ts]       ← reads/writes the existing
                                                      `business_scope_extensions`
                                                      JSONB blob, ~80 lines
```

Why this shape:

- The orchestrator is dumb glue. It owns layout and the "next button" wiring, nothing else.
- Subcomponents own their own UI and call back to the orchestrator with structured events.
- Hooks own state and side‑effects (debouncing, persistence triggers).
- The provider client is provider‑agnostic. The Mapbox impl is the default; Nominatim is the documented fallback. Swapping providers means swapping one file.
- The adapter is the **only** place that knows about `business_scope_extensions`. Nothing else touches the canonical onboarding payload directly.

---

## 4. Provider choice and the provider interface

### Provider matrix

| Option | Geocoding (autocomplete) | Polygon source | Map renderer | Cost | ToS |
|---|---|---|---|---|---|
| **A. Mapbox (recommended)** | Mapbox Geocoding API v6 | Mapbox boundaries v1 (Tilequery for polygons) | MapLibre GL JS pointed at Mapbox tiles or OSM tiles | 100k geocodes/month free | Standard SaaS |
| **B. Google** | Places Autocomplete + Places Details | Boundaries via the Maps JS Drawing/Geometry libraries | Google Maps JS | $200 free credit/month | Strict; must show on a Google Map |
| **C. OSS fallback** | Photon (Komoot) for autocomplete | Nominatim with `polygon_geojson=1` for shapes on selection | MapLibre + OSM raster tiles | $0 | Nominatim usage policy: low traffic, attribution required |

**Recommendation:** ship with **Option A (Mapbox)** as the default. Document Option C as the dev/zero‑cost fallback. Do not ship Option B unless the studio specifically wants Google branding — Google's ToS forces the picker to display on a Google Map and adds Places billing.

The provider boundary in code is one TypeScript interface so this stays a one‑file swap:

```ts
// shape only — exact signatures live in serviceAreaProviderClient.ts
type ServiceAreaProvider = {
  search: (query: string, opts?: { signal?: AbortSignal }) => Promise<ServiceAreaSearchResult[]>;
  resolve: (id: string, opts?: { signal?: AbortSignal }) => Promise<ServiceAreaGeometry | null>;
};
```

### Environment variables

Add (do not commit values) to `.env.local`:

- `VITE_SERVICE_AREA_PROVIDER` — `"mapbox"` (default) or `"nominatim"`.
- `VITE_MAPBOX_ACCESS_TOKEN` — public Mapbox token, restricted to the production hosts.
- `VITE_NOMINATIM_ENDPOINT` (optional) — defaults to `https://nominatim.openstreetmap.org`.

Document in the README the URL allow‑list to set on the Mapbox token.

---

## 5. Data model — what we store and where

We add **one** new optional field to the existing `BusinessScopeExtensionsV1`. Nothing else changes.

### New extension field

```ts
// added to BusinessScopeExtensionsV1 in onboardingBusinessScopeExtensions.ts
service_areas?: BusinessScopeServiceArea[];
```

`BusinessScopeServiceArea` shape (defined in a new helper, normalized by the existing `resolveBusinessScopeExtensions`):

```ts
type BusinessScopeServiceAreaKind =
  | "country"
  | "region"
  | "subregion"
  | "county"
  | "city"
  | "neighborhood"
  | "custom";

type BusinessScopeServiceArea = {
  /** Stable provider id (e.g. Mapbox feature id, Nominatim place_id, or "custom:<slug>"). */
  provider_id: string;
  /** Human label as shown in the chip. */
  label: string;
  /** Coarse classification, used by adapter and (later) any runtime consumer. */
  kind: BusinessScopeServiceAreaKind;
  /** Provider name used for `provider_id` interpretation. */
  provider: "mapbox" | "nominatim" | "google" | "custom";
  /** Centroid for map fit fallback. [lng, lat]. */
  centroid: [number, number];
  /** Bounding box [west, south, east, north]. Always set; centroid bbox if no geometry. */
  bbox: [number, number, number, number];
  /** Optional ISO 3166‑1 alpha‑2 country code, when known. */
  country_code?: string;
  /** When the user selected it. ISO‑8601 UTC. */
  selected_at: string;
};
```

### What we deliberately do NOT store on the row

- The **polygon GeoJSON itself** is not persisted. It can be re‑fetched from the provider on demand using `provider_id`. Storing polygons would bloat the JSONB blob (some country shapes are megabytes).
- The provider key. Never.

### Where the row lives in storage

Existing path. No migration:

```
photographers ─── studio_business_profiles.extensions (JSONB)
                                          └── { schema_version, custom_services?,
                                                custom_geography_labels?,
                                                travel_constraints?,
                                                custom_deliverables?,
                                                service_areas?  ← NEW (array)
                                              }
```

`mapOnboardingPayloadToStorage()` in `src/lib/onboardingV4Payload.ts` already passes `business_scope_extensions` through `businessScopeExtensionsToJson`. Adding the new optional field there and in `resolveBusinessScopeExtensions` is the entire data‑plumbing change.

### Backwards compatibility

- Older payloads without `service_areas` parse fine (the field is optional).
- Older `service_areas` rows from a different provider remain valid — the `provider` discriminator on each entry tells us which client can re‑resolve a polygon for it.
- The existing `geography.mode` enum is **not** removed. The picker can optionally derive a mode hint (see §6 option B), but the enum remains the canonical, deterministic value.

---

## 6. UX integration into `OnboardingBriefingScopeStep`

Two options. The vibecoder must pick one and stick with it through the slices.

### Option A — Add as a new sub‑stage between `geography` and `travel`

- Add a stage id `service_areas` to the `STAGES` list in `OnboardingBriefingScopeStep.tsx`.
- Title: "Where do you serve your customers?"
- The existing `geography` stage stays exactly as it is (the broad enum stance).
- The new stage is optional in the sense that a user can skip with a "Skip for now" link, but if they engage with the search it requires at least one chip.

### Option B (recommended) — Replace the `geography` stage UI with the picker, keep the enum derived

- The existing `geography` stage UI is replaced by the `ServiceAreaPicker`.
- After the user picks at least one area, we **derive** a `GeographyScopeMode` value from the selection so the canonical enum stays populated:
  - 0 selected → leave mode at default (do not advance).
  - All selections share the same `country_code` → `local_only` if all are `city`/`neighborhood`/`county`, else `domestic`.
  - Multiple `country_code`s but all in the same continent (resolved client‑side from a static map) → `regional` or `europe`.
  - Mix across continents → `worldwide`.
- The user can override the derived mode with a small "or pick a stance" link that opens the legacy chip picker. This preserves the existing capture path for users who do not want to use the map.

Option B is recommended because it gives the better UX without dropping the deterministic field. The derivation logic is a small pure function (see §7, helper `deriveGeographyModeFromServiceAreas.ts`).

---

## 7. File‑by‑file plan

Every file below is new unless noted. Target line counts are guidelines — split further if a file exceeds them.

### Types and adapters

1. **`src/lib/serviceAreaPicker/serviceAreaPickerTypes.ts`** — pure types only, no logic. Defines `BusinessScopeServiceArea`, `BusinessScopeServiceAreaKind`, `ServiceAreaSearchResult`, `ServiceAreaGeometry`. ~60 lines.

2. **`src/lib/serviceAreaPicker/businessScopeServiceAreasAdapter.ts`** — pure helpers:
   - `readServiceAreasFromExtensions(ext: BusinessScopeExtensionsV1): BusinessScopeServiceArea[]`
   - `writeServiceAreasIntoExtensions(ext, areas): BusinessScopeExtensionsV1`
   - `normalizeServiceAreasFromUnknown(raw: unknown): BusinessScopeServiceArea[]` — used by `resolveBusinessScopeExtensions`.
   - ~80 lines.

3. **`src/lib/serviceAreaPicker/deriveGeographyModeFromServiceAreas.ts`** — pure function `deriveGeographyMode(areas): GeographyScopeMode | null`. Includes a small static `country_code → continent` table for Europe vs other (small enough to inline ~50 lines or move into its own helper if it grows). ~80 lines.

4. **(edit existing)** `src/lib/onboardingBusinessScopeExtensions.ts` — add the optional `service_areas` field on `BusinessScopeExtensionsV1`, plus call `normalizeServiceAreasFromUnknown` from `resolveBusinessScopeExtensions`. ~30 added lines.

### Provider clients

5. **`src/lib/serviceAreaPicker/serviceAreaProviderClient.ts`** — defines the `ServiceAreaProvider` interface and `getServiceAreaProvider()` factory that picks Mapbox or Nominatim from `import.meta.env.VITE_SERVICE_AREA_PROVIDER`. ~80 lines.

6. **`src/lib/serviceAreaPicker/serviceAreaProviderMapbox.ts`** — concrete Mapbox impl. Uses `fetch` to `https://api.mapbox.com/search/geocode/v6/forward` for autocomplete and `https://api.mapbox.com/search/geocode/v6/feature/{id}` for resolve. Returns geometry as GeoJSON. ~120 lines.

7. **`src/lib/serviceAreaPicker/serviceAreaProviderNominatim.ts`** — concrete OSS impl using Photon for search and Nominatim with `polygon_geojson=1` for resolve. Includes a 1 req/sec client‑side throttle. ~120 lines.

### Hooks

8. **`src/hooks/useServiceAreaPickerSearch.ts`** — debounced search hook. Inputs: `provider`, `query`. Returns `{ results, isLoading, error }`. Aborts in‑flight requests when the query changes. ~80 lines.

9. **`src/hooks/useServiceAreaPickerSelection.ts`** — owns the selection list, exposes `add(area)`, `remove(provider_id)`, `toggle(area)`, `clear()`. Persists to draft via a callback. ~80 lines.

### Components

10. **`src/components/onboarding/serviceAreaPicker/ServiceAreaPickerChip.tsx`** — one chip with selected/unselected variants, optional check icon, optional remove (×). Pure presentational. ~60 lines.

11. **`src/components/onboarding/serviceAreaPicker/ServiceAreaPickerSuggestions.tsx`** — horizontal row of pre‑seeded suggestions for the studio's home country (e.g. when the user types nothing). Pulls a small static seed list from `serviceAreaSeedSuggestions.ts` based on the `settings.studio_location` (when available). ~80 lines.

12. **`src/components/onboarding/serviceAreaPicker/ServiceAreaPickerSearchInput.tsx`** — input + dropdown. Owns the keyboard navigation and uses the search hook. Renders results as chips inside a popover. ~80 lines.

13. **`src/components/onboarding/serviceAreaPicker/ServiceAreaPickerMapPreview.tsx`** — MapLibre GL JS wrapper. Receives the selected areas, fetches their polygons via `provider.resolve()`, adds each as a `fill` layer with a translucent style, and fits the camera to the union bbox. Includes a graceful "loading map" placeholder. ~120 lines.

14. **`src/components/onboarding/serviceAreaPicker/ServiceAreaPicker.tsx`** — the orchestrator. Composes the four subcomponents above into the two‑column layout. Receives `value` and `onChange` from the onboarding step. ~120 lines.

15. **`src/lib/serviceAreaPicker/serviceAreaSeedSuggestions.ts`** — small static map `country_code → suggestion[]`. Used by `ServiceAreaPickerSuggestions`. Three or four seeded countries to start (e.g. US, UK, RS, ES). ~80 lines.

### Onboarding wiring

16. **(edit existing)** `src/components/onboarding/OnboardingBriefingScopeStep.tsx` — replace the body of the `geography` stage with `<ServiceAreaPicker value={…} onChange={…} />`, plus the small fallback link to the legacy enum picker. Wire the derived `GeographyScopeMode` into the existing `business_scope_deterministic.geography.mode`. ~40–60 changed lines.

### Tests (recommended; the vibecoder may stub these)

17. **`src/lib/serviceAreaPicker/businessScopeServiceAreasAdapter.test.ts`** — round‑trip read/write, normalization rejects bad rows.
18. **`src/lib/serviceAreaPicker/deriveGeographyModeFromServiceAreas.test.ts`** — table‑driven test for each derivation case.

### Dependencies

Add to `package.json` (no specific versions named here — the vibecoder picks the latest stable at install time):

- `maplibre-gl` (renderer)
- `@types/geojson` (already transitively present in many React stacks; add explicitly if missing)

Optional, only if Mapbox vector tiles are used for the basemap:

- No SDK needed — MapLibre points at Mapbox's raster tile URLs with the access token in the URL. Keep this transparent.

---

## 8. Vibecoder slice prompts

These are the prompts to paste into Cursor, in order. Each is self‑contained, names exact paths, and references existing types so the agent does not invent new contracts.

### Slice 1 — Add the data model and the adapter (no UI)

```
Task: Extend the existing business_scope_extensions contract with one new optional
field `service_areas` and add a small adapter helper around it. Do not change any
runtime behaviour.

Files to create:
- src/lib/serviceAreaPicker/serviceAreaPickerTypes.ts
- src/lib/serviceAreaPicker/businessScopeServiceAreasAdapter.ts

Files to edit:
- src/lib/onboardingBusinessScopeExtensions.ts
  * Add `service_areas?: BusinessScopeServiceArea[]` to `BusinessScopeExtensionsV1`.
  * Import `BusinessScopeServiceArea` and `normalizeServiceAreasFromUnknown` from the
    new adapter and wire it into `resolveBusinessScopeExtensions` exactly like
    `custom_geography_labels` is wired today (only set the field when the
    normalized array is non-empty).

Constraints:
- Do NOT change `BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION`. The new field is
  additive and optional, not a new schema version.
- Do NOT touch `BusinessScopeDeterministicV1`, `studio_business_profiles` row
  shape, or `mapOnboardingPayloadToStorage`. The new field rides through
  `extensions` automatically.
- The adapter exports exactly:
    readServiceAreasFromExtensions(ext): BusinessScopeServiceArea[]
    writeServiceAreasIntoExtensions(ext, areas): BusinessScopeExtensionsV1
    normalizeServiceAreasFromUnknown(raw: unknown): BusinessScopeServiceArea[]
- Normalize: drop entries missing provider_id, label, kind, centroid, or bbox.
  Dedupe on `${provider}:${provider_id}`. Cap to 50 entries.

Acceptance:
- `resolveBusinessScopeExtensions(input)` returns the new field when present.
- Existing extension fields keep behaving exactly as before.
- TypeScript compiles. No file exceeds 150 lines.
```

### Slice 2 — Provider interface and the Mapbox client

```
Task: Add a provider-agnostic service area provider interface and the Mapbox
implementation. No UI yet.

Files to create:
- src/lib/serviceAreaPicker/serviceAreaProviderClient.ts
- src/lib/serviceAreaPicker/serviceAreaProviderMapbox.ts

Contract (in serviceAreaProviderClient.ts):
- export type ServiceAreaSearchResult = {
    provider_id: string;
    label: string;
    kind: BusinessScopeServiceAreaKind;
    centroid: [number, number];
    country_code?: string;
  };
- export type ServiceAreaGeometry = {
    provider_id: string;
    bbox: [number, number, number, number];
    geojson: GeoJSON.Feature<GeoJSON.Geometry>;
  };
- export type ServiceAreaProvider = {
    name: "mapbox" | "nominatim" | "google";
    search: (query: string, opts?: { signal?: AbortSignal; limit?: number }) =>
      Promise<ServiceAreaSearchResult[]>;
    resolve: (provider_id: string, opts?: { signal?: AbortSignal }) =>
      Promise<ServiceAreaGeometry | null>;
  };
- export function getServiceAreaProvider(): ServiceAreaProvider — reads
  `import.meta.env.VITE_SERVICE_AREA_PROVIDER` and returns the Mapbox impl by
  default. Throws a clear error if the chosen provider's required env var
  (e.g. VITE_MAPBOX_ACCESS_TOKEN) is missing.

Mapbox impl:
- search() calls https://api.mapbox.com/search/geocode/v6/forward with q, limit
  (default 6), and types restricted to country, region, postcode, district,
  place, locality, neighborhood. Maps Mapbox feature `feature_type` to our kind.
- resolve() calls https://api.mapbox.com/search/geocode/v6/feature/{id} and
  returns the polygon (or bbox-derived rectangle if no polygon) as GeoJSON.
- Always pass the AbortSignal through to fetch.

Constraints:
- No new dependencies. Use native fetch.
- File limit 150 lines per file.
- Do NOT import any UI code or React.
```

### Slice 3 — Optional Nominatim/Photon fallback provider

```
Task: Add the OSS fallback implementation. Identical interface, different impl.

File to create:
- src/lib/serviceAreaPicker/serviceAreaProviderNominatim.ts

Behaviour:
- search() uses Photon: https://photon.komoot.io/api/?q=…&limit=6
- resolve() uses Nominatim:
    https://nominatim.openstreetmap.org/details?osmtype=…&osmid=…&format=json&polygon_geojson=1
- Throttle resolve calls to 1 req/sec via a tiny in-module promise queue.
- Send a custom User-Agent header with a contact email read from
  import.meta.env.VITE_NOMINATIM_USER_AGENT (fallback to a constant string).
- Map Photon `osm_value` to our `kind` (country / state / county / city /
  suburb / neighborhood). Unknown → "custom".

Constraints:
- File limit 150 lines.
- No new dependencies.
- Wire this provider into the factory in serviceAreaProviderClient.ts as the
  branch for VITE_SERVICE_AREA_PROVIDER === "nominatim".
```

### Slice 4 — Search and selection hooks

```
Task: Add the two hooks that own picker state.

Files to create:
- src/hooks/useServiceAreaPickerSearch.ts
- src/hooks/useServiceAreaPickerSelection.ts

useServiceAreaPickerSearch:
- Inputs: { provider: ServiceAreaProvider; query: string; debounceMs?: number }.
- Output: { results: ServiceAreaSearchResult[]; isLoading: boolean; error?: Error }.
- Debounce 200ms by default. Aborts the previous request when query changes.
- Empty/whitespace query returns [] without a network call.

useServiceAreaPickerSelection:
- Inputs: { initial: BusinessScopeServiceArea[]; onChange: (next) => void }.
- Output: { value, add, remove, toggle, clear, has }.
- `has(provider, provider_id)` is O(1) (use a Set under the hood).
- `add()` rejects duplicates (same provider+provider_id).
- All mutations call onChange with the next array.

Constraints:
- File limit 100 lines per hook.
- No imports from components.
- Pure React + the types from Slices 1 and 2.
```

### Slice 5 — Map preview component

```
Task: Add the MapLibre map preview that renders the union of selected areas.

File to create:
- src/components/onboarding/serviceAreaPicker/ServiceAreaPickerMapPreview.tsx

Dependency to add via the package manager: `maplibre-gl` (latest stable).
Add the corresponding CSS import at the top of the component:
  import "maplibre-gl/dist/maplibre-gl.css";

Behaviour:
- Props: { provider: ServiceAreaProvider; selected: BusinessScopeServiceArea[];
           tileStyleUrl?: string; className?: string }.
- On mount, initialise a MapLibre map with `tileStyleUrl` (default to a public
  OSM raster style: https://demotiles.maplibre.org/style.json — replace with a
  Mapbox style URL when MAPBOX token is set).
- Whenever `selected` changes:
    1. For each newly added area, call provider.resolve(provider_id) to fetch
       geometry. Cache resolved geometries in a ref keyed by
       `${provider}:${provider_id}`.
    2. Add/remove a `fill` layer per selected area with a translucent style
       (fill-opacity: 0.25, line layer with stroke 1.5px).
    3. Compute the union bbox and call map.fitBounds() with 40px padding and
       maxZoom 9. If only one selection, fit to its bbox.
- Show a small spinner overlay while geometries are resolving.
- On unmount, call map.remove().

Constraints:
- File limit 150 lines.
- No global state. Map instance lives in a useRef.
- Resolve calls are awaited but errors must not crash the component (log and
  skip that area).
```

### Slice 6 — Search input, suggestions row, chip

```
Task: Add the three small UI subcomponents.

Files to create:
- src/components/onboarding/serviceAreaPicker/ServiceAreaPickerChip.tsx
- src/components/onboarding/serviceAreaPicker/ServiceAreaPickerSuggestions.tsx
- src/components/onboarding/serviceAreaPicker/ServiceAreaPickerSearchInput.tsx
- src/lib/serviceAreaPicker/serviceAreaSeedSuggestions.ts

ServiceAreaPickerChip:
- Props: { area, isSelected, onClick, onRemove? }.
- Visuals: pill, check icon when selected, × on hover when onRemove set.

ServiceAreaPickerSuggestions:
- Props: { countryCode?: string; onSelect: (area) => void; selectedIds: Set<string> }.
- Reads suggestions from `serviceAreaSeedSuggestions.ts` (a static
  Record<string, ServiceAreaSearchResult[]>). Falls back to a neutral set if
  countryCode is missing.

ServiceAreaPickerSearchInput:
- Props: { provider, value, onChange, selectedIds: Set<string> }.
- Renders the input and a popover that lists results from
  useServiceAreaPickerSearch. Each result is a row that calls onChange(result)
  on click. Keyboard: ↑/↓ navigates, Enter selects, Esc closes.

Constraints:
- File limit 100 lines per file.
- Reuse existing button/chip styles where possible
  (`scopeSectorGlassPillBase` from
   src/components/onboarding/SectorDonutBubbleField.tsx).
- No business logic in any of these files.
```

### Slice 7 — Picker orchestrator and helpers wiring

```
Task: Add the orchestrator that composes the picker, plus the geography mode
derivation helper.

Files to create:
- src/components/onboarding/serviceAreaPicker/ServiceAreaPicker.tsx
- src/lib/serviceAreaPicker/deriveGeographyModeFromServiceAreas.ts

ServiceAreaPicker:
- Props: { value: BusinessScopeServiceArea[]; onChange: (next) => void;
           studioCountryCode?: string }.
- Layout: two columns on >= md, stacked on mobile. Left: map preview.
  Right: title, helper text, search input, suggestions row, selected chips.
- Internally:
    const provider = useMemo(getServiceAreaProvider, []);
    const selection = useServiceAreaPickerSelection({ initial: value, onChange });
- The "selected chips" section lists the current value with remove buttons.

deriveGeographyModeFromServiceAreas:
- Pure function, table-driven rules:
    0 areas         → null
    all same country, all city/county/neighborhood → "local_only"
    all same country, mixed kinds                  → "domestic"
    multiple countries, all in EUROPE              → "europe"
    multiple countries spanning regions            → "regional"
    spans 3+ continents OR includes "worldwide"    → "worldwide"
- Includes a static Set<string> EUROPE_COUNTRY_CODES (~50 entries; plain ISO‑2
  list, easy to update).

Constraints:
- File limit 150 lines for the orchestrator, 100 lines for the helper.
- No direct provider calls in the orchestrator beyond the factory call.
```

### Slice 8 — Wire into `OnboardingBriefingScopeStep`

```
Task: Replace the geography stage UI with the new picker, keep the enum
populated by derivation.

File to edit:
- src/components/onboarding/OnboardingBriefingScopeStep.tsx

Changes:
- In the `geography` stage render branch, replace the existing
  GeographySectorCluster with a <ServiceAreaPicker ... />.
- Read the current `service_areas` from
  resolveBusinessScopeExtensions(payload.business_scope_extensions).service_areas ?? [].
- On change:
    1. Call writeServiceAreasIntoExtensions(currentExt, nextAreas) and patch
       payload.business_scope_extensions.
    2. Compute deriveGeographyModeFromServiceAreas(nextAreas). If non-null,
       patch payload.business_scope_deterministic.geography.mode. If null,
       leave the existing mode untouched.
- Below the picker, render a small text link
    "Or pick a stance instead" → reveals the legacy GeographySectorCluster in
  a collapsed disclosure. The legacy chip cluster is kept as the fallback path,
  not deleted.
- Pass the studio country code (when available from settings_identity) into
  ServiceAreaPicker as `studioCountryCode`. If unknown, omit and let the
  suggestions fall back to a neutral set.

Constraints:
- Do NOT remove GeographySectorCluster; it remains the fallback.
- Do NOT touch any other stage in this step.
- Keep the change to <80 lines diff in this file.
- The "Next" button must require value.length > 0 in the new picker (or the
  legacy mode selected) before advancing.

Acceptance:
- Choosing two cities on the map shades both, fits the camera, and sets
  geography.mode to "local_only" (same country) or "domestic" (mixed kinds).
- Refreshing onboarding mid-flow restores the chips and the shaded map.
- A user who clicks "Or pick a stance instead" can still complete the step the
  old way without seeing the map.
```

### Slice 9 — Tests and docs touch

```
Task: Add focused unit tests and update the local README.

Files to create:
- src/lib/serviceAreaPicker/businessScopeServiceAreasAdapter.test.ts
- src/lib/serviceAreaPicker/deriveGeographyModeFromServiceAreas.test.ts

Files to edit:
- README.md (or the v3 docs README): add a paragraph linking to this document
  and listing the env vars.

Test cases (table-driven where natural):
- Adapter: round-trip preserves entries; bad entries are dropped; dedupe on
  provider+provider_id; cap at 50.
- Derivation: each row of the rule table from Slice 7 produces the expected
  mode, plus null for empty input.

Constraints:
- Use vitest (the existing test runner in this repo).
- No network calls in tests. Provider is not exercised here.
```

---

## 9. Acceptance criteria for the whole feature

A reviewer can mark this done when:

1. A new onboarding tester can pick three areas (e.g. "Belgrade", "Novi Sad", "Niš"), see all three shaded on the map, and watch `business_scope_extensions.service_areas` populate in the draft preview.
2. Refreshing the page restores the shaded map and the selected chips.
3. The legacy "stance" chip picker is still reachable via the fallback link and still produces a valid `geography.mode`.
4. After finalize, `studio_business_profiles.extensions.service_areas` contains the picked areas, with provider, kind, centroid, and bbox.
5. Dropping `VITE_MAPBOX_ACCESS_TOKEN` and switching `VITE_SERVICE_AREA_PROVIDER=nominatim` makes the same flow work against Photon + Nominatim, with the throttle visible (slower polygon loads, no console errors).
6. No file exceeds ~150 lines. No file touches both UI rendering and provider HTTP calls.
7. The `studio_business_profiles` row shape and `BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION` are unchanged.

---

## 10. Future hooks (out of scope here)

Documented for the next planning round, not for this implementation:

- **Runtime consumer.** Once a backend orchestrator detector wants to branch on "is this lead local?", it can read `business_scope_extensions.service_areas`, intersect the lead's location with the union of bboxes (or fetch polygons via the same provider), and decide. No re‑onboarding needed.
- **Travel radius around home base.** A second optional input on the same step ("plus N km around your home base") can become a synthetic `service_area` of `kind: "custom"` with a circle approximated by a 16‑sided polygon. Same storage, same renderer.
- **Map style.** Once a Mapbox style is finalised, swap the demotiles URL for the studio style. No code change beyond the env var.
- **Provider migration.** If the studio later moves to Google for branding, only `serviceAreaProviderGoogle.ts` needs to be added and selected via the env var. Existing rows keep their `provider: "mapbox"` discriminator and are still re‑resolvable by the Mapbox client (kept for read paths) or rendered from cached bbox if not.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Mapbox token leaks via the bundled JS | Use a public token restricted to the production hostnames. Rotate in prod separately from dev. |
| Polygon downloads are large for countries | Persist only `bbox`+`provider_id`. Re‑resolve polygons on demand, cache in a ref for the session. |
| Nominatim rate limits | Photon for autocomplete, Nominatim only on selection, with 1 req/sec throttle and a custom User‑Agent. Recommend Mapbox for production. |
| User picks "worldwide" on the legacy fallback after picking three local cities on the map | Derivation is non‑destructive: if the user explicitly picks a stance via the legacy fallback, that wins. Service areas remain stored as extension data; the canonical mode is whatever was chosen last. |
| Map fails to load (offline, blocked tile host) | The picker still works without the map: chips still add, search still works, fitBounds is a no‑op. Show a small "Map preview unavailable" placeholder in the map area. |
| TypeScript Json type rejects nested arrays in `service_areas` | The adapter casts to `Json` exactly the way `businessScopeExtensionsToJson` already does today. No new TS workarounds needed. |

---

## 12. What the vibecoder must NOT do

- Do not create a new database migration. The new field rides inside an existing JSONB column.
- Do not change `BusinessScopeDeterministicV1`, `BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION`, or any function in `mapOnboardingPayloadToStorage`.
- Do not delete `GeographySectorCluster` or its imports. It remains the fallback UI.
- Do not call any provider directly from a component. All HTTP goes through `serviceAreaProviderClient.ts`.
- Do not store polygons on `service_areas` rows. Only `bbox` and `centroid`.
- Do not write a single file longer than ~150 lines. If a file grows past that, split it.

---

## 13. Order of operations (TL;DR)

1. Slice 1 — extend the data model (no UI).
2. Slice 2 — Mapbox provider behind the interface.
3. Slice 3 — Nominatim fallback (optional but cheap).
4. Slice 4 — search + selection hooks.
5. Slice 5 — map preview component (heaviest, do this when the data layer is settled).
6. Slice 6 — search input, suggestions row, chip.
7. Slice 7 — picker orchestrator + derivation helper.
8. Slice 8 — wire into the onboarding step.
9. Slice 9 — tests + docs.

After Slice 8 the feature is shippable; Slice 9 is hygiene.
