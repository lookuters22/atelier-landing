# Frontend Bundle Optimization Plan

## Goal

Reduce frontend transfer cost and improve load time by shrinking the largest Vite chunks before scaling traffic further.

This repo is currently deployed to Vercel as a **static Vite app**. The main cost risk on the frontend side is therefore:

1. large JS payloads
2. repeated CDN transfer
3. heavy route bundles loaded too early

This plan is written for the current repo shape:

- Vite SPA frontend
- Supabase + Inngest backend
- no meaningful Vercel Functions / Edge Functions usage

## Current large chunks

From the recent production build log:

- `dist/assets/index-*.js`
  - about `2.58 MB`
  - about `716 KB gzip`
- `dist/assets/react-pdf.browser-*.js`
  - about `1.54 MB`
  - about `514 KB gzip`
- `dist/assets/LandingPage-*.js`
  - about `1.11 MB`
  - about `316 KB gzip`
- `dist/assets/OfferBuilderEditorPage-*.js`
  - about `324 KB`
  - about `100 KB gzip`

These are the main optimization targets.

## Working assumptions

- The dashboard and landing page should not pay for each other’s code by default.
- PDF functionality is not needed on most sessions and should not be in the hot path.
- Offer builder/editor code is specialized and should be loaded only when used.
- The shared `index` bundle is likely carrying too much route code and too many heavy dependencies.

## Success criteria

- reduce the shared `index` bundle materially
- make `react-pdf` load only when PDF/invoice UI is opened
- isolate landing page code from dashboard sessions
- isolate offer-builder/editor code from normal dashboard sessions
- add build visibility so bundle regressions are caught quickly

## Priorities

### P0

- lazy-load `react-pdf`
- guarantee landing page route splitting
- guarantee offer-builder/editor route splitting

### P1

- reduce shared dashboard imports leaking into `index`
- move rarely used settings/admin surfaces behind lazy imports
- add bundle inspection to CI or release workflow

### P2

- split vendor-heavy libraries intentionally with Rollup manual chunks if needed
- review image/font delivery and preload behavior

## Likely root causes

### 1. Heavy route modules imported too early

Common causes:

- route components imported directly instead of with `React.lazy`
- large feature modules imported in app shell/layout code
- top-level registries importing every page eagerly

Likely places to inspect first:

- `src/App.tsx`
- `src/main.tsx`
- dashboard layouts
- page registries or route declarations

### 2. `react-pdf` in the main client graph

Likely cause:

- invoice / PDF preview code imported directly into shared settings or editor flows

Likely places:

- `src/pages/settings/InvoiceSetupPage.tsx`
- `src/pages/settings/InvoicePdfDocument.tsx`
- any modal/preview helper that imports PDF components at top level

### 3. Landing page bundled too broadly

Likely cause:

- landing page components or assets imported into the main app shell
- route-level split exists but shared imports are too broad

Likely places:

- `src/App.tsx`
- `src/pages/LandingPage/LandingPage.tsx`
- shared navigation/layout code that imports landing components directly

### 4. Offer builder/editor pulled into shared settings path

Likely cause:

- settings hub or editor support components importing the full builder eagerly

Likely places:

- `src/pages/settings/OfferBuilderHubPage.tsx`
- `src/pages/settings/OfferBuilderEditorPage.tsx`
- `src/pages/settings/OfferPuckEditor.tsx`
- feature modules under `src/features/offer-puck/`

## Implementation slices

## Slice 1: Add bundle visibility

### Goal

Make future decisions based on measurable bundle output instead of guessing.

### Changes

- add a bundle visualizer for Vite/Rollup
- generate a report during local production builds
- document how to inspect:
  - biggest chunks
  - duplicated packages
  - route leakage into shared chunk

### Suggested outputs

- bundle report artifact in a known path
- short checklist in docs for reading the report

### Acceptance

- we can identify which imports make `index` heavy
- we can confirm whether `react-pdf`, landing page code, and offer builder are isolated

## Slice 2: Force route-level lazy loading for major surfaces

### Goal

Ensure large pages are not loaded until the user visits them.

### Target routes

- landing page
- inbox-heavy dashboard pages if imported eagerly
- settings pages
- offer builder/editor
- invoice/PDF setup pages

### Changes

- use `React.lazy` + `Suspense` for page-level imports
- keep app shell/layout small
- avoid importing page modules from shared route constants/helpers

### Acceptance

- landing page chunk is not part of normal authenticated dashboard path
- offer builder/editor code is not part of normal dashboard path
- settings specialty pages are not in the shared chunk

## Slice 3: Isolate `react-pdf`

### Goal

Remove PDF code from the main interactive bundle.

### Changes

- move `react-pdf` imports behind lazy boundaries
- load PDF preview only on demand
- avoid top-level imports in shared settings modules

### Good patterns

- lazy modal
- lazy preview panel
- dynamic import in explicit user action flow

### Avoid

- importing PDF document components in page modules that render by default
- importing `react-pdf` helpers in shared utility files

### Acceptance

- `react-pdf.browser-*` no longer loads on ordinary dashboard sessions
- the PDF chunk only loads when invoice/PDF UI is opened

## Slice 4: Separate landing from dashboard

### Goal

Make marketing traffic and logged-in dashboard traffic independent.

### Changes

- ensure landing route is lazily loaded
- keep 3D/animation-heavy landing components scoped to landing only
- avoid shared imports from landing into authenticated layouts

### Likely hot spots

- hero scene / 3D components
- carousel/animation helpers
- landing-only media assets referenced from shared code

### Acceptance

- dashboard sessions do not fetch the landing page JS chunk
- landing chunk size may still be large, but it is isolated

## Slice 5: Separate offer builder/editor from general settings

### Goal

Prevent specialized editing tools from bloating the normal app path.

### Changes

- lazy-load offer builder pages
- lazy-load large editor support components
- review feature imports under `src/features/offer-puck/`
- split editor-only helpers from common settings utilities

### Acceptance

- normal settings/dashboard use does not download offer-builder/editor code

## Slice 6: Shrink the shared `index` bundle

### Goal

Reduce the common JS every user pays for.

### Areas to inspect

- top-level providers in `src/main.tsx` and `src/App.tsx`
- shared layouts
- globally mounted widgets
- broad barrel exports
- utility files importing heavy libraries

### Common fixes

- replace broad eager imports with route-local imports
- move optional widgets behind lazy boundaries
- avoid importing large UI systems globally if only certain routes need them
- remove accidental cross-imports between dashboard and landing/features

### Acceptance

- `index` chunk drops materially after route and feature isolation

## Slice 7: Optional manual chunking

### Goal

Use Rollup chunk rules only after import boundaries are cleaned up.

### Possible chunk families

- `pdf`
- `landing-3d`
- `offer-builder`
- `vendor-react-core`
- `vendor-map`

### Note

Manual chunking should be a last-mile tool, not the first fix. If the import graph is wrong, manual chunks only hide the real issue.

## Recommended file audit order

Start here:

- `src/App.tsx`
- `src/main.tsx`
- `src/pages/LandingPage/LandingPage.tsx`
- `src/pages/settings/InvoiceSetupPage.tsx`
- `src/pages/settings/InvoicePdfDocument.tsx`
- `src/pages/settings/OfferBuilderHubPage.tsx`
- `src/pages/settings/OfferBuilderEditorPage.tsx`
- `src/pages/settings/OfferPuckEditor.tsx`
- `src/features/offer-puck/*`

Then inspect:

- shared layouts
- globally mounted components
- any page registry / routing helpers
- any barrel files that re-export many route modules

## Practical rollout order

### Week 1

- add bundle report tooling
- lazy-load landing route
- lazy-load PDF flows

### Week 2

- lazy-load offer builder/editor
- audit `App.tsx` and route setup
- measure new production build sizes

### Week 3

- reduce shared chunk leakage
- add optional manual chunks if still needed
- document acceptable chunk thresholds

## Guardrails

Do not:

- optimize only for raw chunk count without checking user flows
- move everything into tiny chunks that create too many requests
- use manual chunking to hide eager imports

Do:

- optimize according to actual route usage
- keep the main dashboard path lean
- keep specialist surfaces on demand
- re-measure after each slice

## Suggested target state

Not hard requirements, but a good direction:

- shared app/dashboard bundle materially below current size
- landing isolated from dashboard
- `react-pdf` fully on demand
- offer builder/editor fully on demand
- bundle analysis available on every release check

## Open questions for implementation

- Is `LandingPage` imported directly in route config or app shell?
- Is `react-pdf` pulled in by a shared settings page rather than a modal/action?
- Are offer-builder components imported by a settings hub that renders on every settings visit?
- Are there global widgets/providers importing route-specific code?

## Deliverables

When implementation starts, each slice should produce:

- changed files
- before/after bundle sizes
- note on user-facing impact
- any regressions caught

## Recommended next implementation order

1. bundle report tooling
2. `react-pdf` isolation
3. landing page route isolation
4. offer builder/editor isolation
5. shared `index` bundle audit
6. optional manual chunk cleanup
