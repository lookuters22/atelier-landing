# Studio Geography Contract

Canonical reference for how studio geography is **stored**, **validated**,
and **interpreted**. If this doc and the code diverge, the code
(`src/lib/studioGeographyContract.ts`) is authoritative — patch the doc.

## Three concepts, one interpretation rule

| Concept | Storage path | Purpose | Shape |
|---|---|---|---|
| `base_location` | `photographers.settings.base_location` | **Identity** — where the studio is physically based. Never used for coverage decisions. | `StudioBaseLocation` (one object) — see `src/lib/studioBaseLocation.ts` |
| `service_areas` | `studio_business_profiles.extensions.service_areas` | **Explicit coverage** — places the operator chose to work in. Authoritative when non-empty. | `BusinessScopeServiceArea[]` — see `src/lib/serviceAreaPicker/serviceAreaPickerTypes.ts` |
| `geographic_scope` | `studio_business_profiles.geographic_scope` | **Coarse policy fallback** — five posture buckets, consulted only when `service_areas` is empty. | `{ mode, blocked_regions? }` — see `src/lib/onboardingBusinessScopeDeterministic.ts` |

## Precedence (authoritative)

1. `base_location` is independent. It describes identity, not coverage.
   A studio can be based in Paris and only work in New York — both are
   real and never compared.
2. `service_areas` wins whenever it contains ≥1 valid row. Runtime
   consumers MUST consult it first for coverage decisions.
3. `geographic_scope` is the coarse fallback. It is consulted for
   coverage only when `service_areas` is empty. Once `service_areas` is
   populated, `geographic_scope` is kept for audit/telemetry but stops
   driving coverage decisions.
4. `geographic_scope.blocked_regions` is a **veto layer** that applies
   even to explicit `service_areas` coverage.

Encoded as `classifyStudioGeographyPosture()` in
`src/lib/studioGeographyContract.ts`.

## Defensive layering

Validation happens at **three layers** that are designed to fail
independently:

### Client-side

- `canAdvanceGeographyStage` — blocks onboarding step advancement
  unless `base_location` + ≥1 `service_area` are both set
  (`src/lib/onboardingGeographyStageGate.ts`).
- `validateFinalizeGeographyPayload` — mirror of the SQL guard; rejects
  the payload before the RPC round-trip and surfaces identical error
  messages (`src/lib/onboardingFinalizeGeographyContract.ts`).
- `mergePhotographerSettings` — silently drops a malformed
  `base_location` on write (`src/lib/photographerSettings.ts`). The DB
  CHECK is the last line of defence; this one keeps garbage out in
  normal flows.
- `normalizeServiceAreasFromUnknown` — drops malformed rows from arrays
  on read/write (`src/lib/serviceAreaPicker/businessScopeServiceAreasAdapter.ts`).

### Server-side (RPC)

`finalize_onboarding_briefing_v1` (migration
`20260506000000_*.sql`) **rejects** finalize attempts when:

- `p_settings.base_location` is missing, `jsonb null`, or malformed
- `p_studio_business_profile.extensions.service_areas` is missing,
  empty, non-array, or contains any malformed row

Exception messages use the prefix
`finalize_onboarding_briefing_v1: geography_incomplete —` or
`finalize_onboarding_briefing_v1: geography_malformed —`. The TS mirror
emits byte-identical strings.

### Database (CHECK constraints)

Two CHECK constraints (migration `20260505000000_*.sql`) backstop any
write path that bypasses the RPC:

- `photographers_settings_base_location_shape_chk`
- `studio_business_profiles_extensions_service_areas_shape_chk`

Both reference SQL helper validators from migration
`20260503000000_studio_geography_validators.sql`:

- `validate_studio_base_location_shape(jsonb) → boolean`
- `validate_studio_service_area_row_shape(jsonb) → boolean`
- `validate_studio_service_areas_shape(jsonb) → boolean`

All validators are `IMMUTABLE`, return `TRUE` for `NULL` / missing
keys, and never raise — they are safe inside CHECK predicates.

### Data healing

Two migrations heal pre-existing malformed blobs so the new CHECKs
don't brick legacy tenants:

- `20260502000000_*` — corrects `service_areas`/`travel_constraints`
  stored as `{}` to `[]` (regression from the original v2 scope
  migration).
- `20260504000000_*` — strips `base_location` that fails the validator
  and replaces non-array `service_areas` with `[]`. Idempotent.

## Runtime consumers

Never reach into raw JSONB. Use the typed helper:

```ts
import { readStudioEffectiveGeographyFromRows } from "@/lib/studioEffectiveGeography";

const effective = readStudioEffectiveGeographyFromRows({
  photographerSettings: photographer.settings,
  studioBusinessProfile: sbp,
});

if (effective.has_explicit_service_areas) {
  // posture === "explicit_service_areas"; consult effective.service_areas
}
```

The helper also exposes `effectiveGeographyMayCover(effective, { point,
bbox })` — a **conservative first-pass bbox-level** matcher suitable
for "maybe covered, worth a closer look" filters. It does not attempt
polygon containment and returns `matched: false` for `coarse_scope_only`
(policy signals aren't explicit coverage claims).

## Finalize RPC enforcement vs. schema separation

The finalize RPC is the single gate that cross-checks **both** halves
of the geography answer at once, but the storage split is preserved:

- `base_location` still lives only on `photographers.settings`.
- `service_areas` still lives only on
  `studio_business_profiles.extensions`.

No top-level column was introduced. Future lead-routing / eligibility
logic should read via `readStudioEffectiveGeography*` to stay decoupled
from storage details.
