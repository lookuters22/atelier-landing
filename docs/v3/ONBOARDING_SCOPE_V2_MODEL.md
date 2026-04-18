# Onboarding Business Scope — v2 model

Rollout of the selector-based Business Scope flow (replaces the "service bubbles" experiment). This document describes the canonical data model, the onboarding UI surface, and the migration story.

## 1. Canonical model

Three orthogonal, clearly-separated concepts:

- **Core services** — what the studio actually produces. Finite, stable.
  - `photo` — photography as the core craft.
  - `video` — **standalone** videography / filmmaking offering.
  - `hybrid` — **photographer-led** shoot with motion capture alongside.
  - `content_creation` — lightweight commercial / social content.
  - Video and Hybrid are intentionally distinct and must not be collapsed together.
- **Specializations** — subjects / occasions the studio leans into. Finite.
  - `weddings`, `elopements`, `engagements`, `events`, `portraiture`, `commercial`.
  - The previous values `family` / `maternity` / `newborn` map to `portraiture`; `brand` / `editorial` / `corporate` map to `commercial`.
- **Offer components** — deliverables, capture methods, and add-ons.
  - `digital_files`, `albums`, `prints`, `raw_files`, `film_photography`, `drone`, `highlight_films`, `short_form_clips`, `super_8`, `livestream`.

The taxonomy lives in [`src/lib/onboardingBusinessScopeDeterministic.ts`](../../src/lib/onboardingBusinessScopeDeterministic.ts).

Extensions (operator-entered free text) are stored in `studio_business_profiles.extensions` (JSONB) — see [`src/lib/onboardingBusinessScopeExtensions.ts`](../../src/lib/onboardingBusinessScopeExtensions.ts):

- `custom_specializations: { label, behaves_like? }[]`
- `custom_offer_components: { label, behaves_like? }[]`
- `custom_geography_labels`, `travel_constraints`, `service_areas`

The `behaves_like` hint is operator UX only — runtime must not infer canonical scope from it.

## 2. Storage layout (`studio_business_profiles`)

- `core_services JSONB` — new column. Enum array, one of `photo | video | hybrid | content_creation`.
- `service_types JSONB` — re-interpreted as the specializations enum array.
- `deliverable_types JSONB` — re-interpreted as the offer-components enum array.
- `extensions JSONB` — v2 shape (see above).

The migration `supabase/migrations/20260501000000_studio_business_profiles_v2_scope.sql`:

- adds `core_services`,
- backfills each row by mapping legacy `service_types` / `deliverable_types` / `extensions.selected_media_groups` / `extensions.selected_service_capabilities` into the v2 enums,
- rewrites `extensions` to the v2 shape (migrating `custom_services` → `custom_specializations`, `custom_deliverables` → `custom_offer_components`),
- updates `finalize_onboarding_briefing_v1` so the upsert writes `core_services`.

## 3. Onboarding UI

The Scope step ([`OnboardingBriefingScopeStep.tsx`](../../src/components/onboarding/OnboardingBriefingScopeStep.tsx)) walks through nine sub-stages:

1. **Core services** — `<SelectorChoiceGrid size="lg" mode="multi">` with taglines and subtle per-card accents (Photo / Video / Hybrid / Content). Requires ≥1 selection before advancing.
2. **Specializations** — `<SelectorChoiceGrid mode="multi">` + `<SelectorInlineAddOwn>` for free-text labels.
3. **Offer components** — same pattern, broader grid.
4. **Geography** — existing `<GeographySectorCluster>` (donut of regional modes).
5. **Service areas** — `<ServiceAreaPicker>` (search + map + chips).
6. **Travel** — existing `<ScopeSectorCluster>` (radio).
7. **Rules — languages** — existing `<ScopeSectorCluster>` (multi).
8. **Rules — lead service not offered** — existing `<ScopeSectorCluster>` (radio).
9. **Rules — lead outside geography** — existing `<ScopeSectorCluster>` (radio).

The first three sub-stages use the new reusable selector primitives under [`src/components/onboarding/selectors/`](../../src/components/onboarding/selectors):

- `SelectorChoiceCard` — rounded-2xl glass tile, sage-glow selected state, `role=checkbox|radio`, subtle accent tints.
- `SelectorChoiceGrid` — responsive grid with arrow-key navigation, Home/End jumps, staggered entrance (respects `prefers-reduced-motion`), `radiogroup` / multi-select semantics.
- `SelectorInlineAddOwn` — dashed "+ Add your own" tile that expands into an inline text input (Enter to commit, Esc/blur to cancel).

These primitives are intentionally reusable and are expected to land on future onboarding screens.

## 4. Review step

`OnboardingBriefingReviewStep.tsx` renders the v2 shape directly:

- **Core services** — labels from `CORE_SERVICE_LABELS`.
- **Specializations** + **Additional specializations** (custom rows).
- **Offer components** + **Additional offer components** (custom rows).
- Geography / travel / lead rules unchanged.

## 5. Migration story

- **DB**: the one-time `20260501…` migration rewrites every existing row. Already-blank rows become empty v2 arrays.
- **Client drafts**: `resolveBusinessScopeDeterministic()` accepts both v2 (passthrough) and v1 (mapped via `migrateLegacyCanonicalsToV2`). `resolveBusinessScopeExtensions()` does the same for extensions (`custom_services` → `custom_specializations`, etc.). The migrators are one-way — the old enums are never re-emitted.
- **Runtime**: the finalization RPC and `mapOnboardingPayloadToStorage` emit v2 values. No downstream runtime code depends on v1 canonicals — audited in Slice 2.

## 6. What was removed

- `src/lib/onboardingServiceTaxonomy.ts`
- `src/lib/onboardingServiceBubbleRegistry.ts`
- `src/components/onboarding/ServicesRadialPebbleCluster.tsx`
- Corresponding tests (`onboardingServiceTaxonomy.test.ts`, `onboardingServiceBubbleRegistry.test.ts`, pre-v2 `onboardingBusinessScopeExtensions.test.ts`).

The physics-based bubble surface (`SectorDonutBubbleField`, `ScopeSectorCluster`, `GeographySectorCluster`) is kept — it's still used by geography / travel / rules / voice stages, which are radio/multi selections where the cluster feel works. Only the service-selection stages moved off bubbles.
