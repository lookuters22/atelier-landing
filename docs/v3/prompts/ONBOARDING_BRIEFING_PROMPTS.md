# ONBOARDING BRIEFING PROMPTS

Use this file when building the onboarding / studio briefing flow.

This prompt pack assumes you already want the dedicated onboarding work described in:

- `docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md`
- `docs/v3/ONBOARDING_BRIEFING_SLICE_01_SCHEMA_FOUNDATION.md`
- `docs/v3/ONBOARDING_BRIEFING_SLICE_02_UI_SHELL.md`
- `docs/v3/ONBOARDING_BRIEFING_SLICE_03_SCOPE_AND_VOICE.md`
- `docs/v3/ONBOARDING_BRIEFING_SLICE_04_AUTHORITY_AND_VAULT.md`
- `docs/v3/ONBOARDING_BRIEFING_SLICE_05_FINALIZE_AND_SETTINGS_REENTRY.md`

## Core Rules For Every Prompt

- implement one slice only
- do not collapse policy or business scope into one `settings` blob
- `photographers.settings` may store an editable onboarding snapshot, but runtime must still read canonical split storage
- use the `Ctrl+K` / spotlight shell as visual inspiration, not as a literal command menu
- keep the UI calm, premium, mobile-safe, and deterministic
- do not invent new action keys casually

## Always Read First

```text
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md
- docs/v3/ARCHITECTURE.md section "Onboarding"
- docs/v3/DATABASE_SCHEMA.md sections 5.1, 5.1A, and 5.17
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
```

## Prompt 1: Schema Foundation Slice

```text
Implement only the onboarding briefing schema foundation slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 2 and Phase 4
- docs/v3/ARCHITECTURE.md onboarding section
- docs/v3/DATABASE_SCHEMA.md sections 5.1 and 5.1A
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_01_SCHEMA_FOUNDATION.md

Task:
- create the additive migration for `studio_business_profiles`
- regenerate `src/types/database.types.ts`
- add one typed helper for the editor-only onboarding snapshot in `photographers.settings`

Touch only:
- one migration
- generated database types
- one new onboarding snapshot type file
- one new onboarding snapshot helper
- one narrow existing helper only if needed for alignment

Do not change:
- onboarding UI
- settings page UI
- runtime workers
- finalization flow

Important constraints:
- do not create a separate onboarding drafts table
- do not bloat `PhotographerSettings` with the whole onboarding form
- do not make runtime read the settings snapshot

Done means:
- `studio_business_profiles` exists in migrations
- DB types know about it
- a typed helper can read/write `settings.onboarding_briefing_v1` safely

Stop after this slice.
```

## Prompt 1A: Schema Foundation Start Slice

Use this as the **actual first build prompt**.

It is intentionally narrower than Prompt 1 so it fits the Cursor rules about very small slices,
limited file touch count, and additive schema-first work.

```text
Implement only the onboarding briefing schema foundation START slice.

Follow the Cursor rules in:
- docs/v3/.cursorrules

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 2 and Phase 4
- docs/v3/ARCHITECTURE.md section "Onboarding"
- docs/v3/DATABASE_SCHEMA.md sections 5.1 and 5.1A
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_01_SCHEMA_FOUNDATION.md
- supabase/migrations/*

Task:
- create only the additive migration for `studio_business_profiles`
- regenerate only `src/types/database.types.ts`

Touch only:
- one new migration file
- `src/types/database.types.ts`
- one doc only if the migration forces a tiny contract correction

Do not change:
- onboarding UI
- settings page UI
- onboarding snapshot helpers
- runtime workers
- finalization flow
- unrelated docs

Important constraints:
- this is schema-first only
- do not create a separate onboarding drafts table
- do not invent fields beyond the documented `studio_business_profiles` contract
- preserve tenant ownership discipline (`photographer_id`)
- keep the migration additive
- after the migration, regenerate the database types and stop

Before coding:
- restate the exact files you will touch
- confirm that this slice is intentionally limited to migration + generated types only

Done means:
- `studio_business_profiles` exists in migrations
- `src/types/database.types.ts` includes the new table
- no UI or helper code was added yet

Stop after this slice.
```

## Prompt 2: UI Shell Slice

```text
Implement only the onboarding briefing UI shell slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 11
- docs/v3/ARCHITECTURE.md onboarding section
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_02_UI_SHELL.md
- src/components/StudioSpotlight.tsx
- src/components/ui/command.tsx

Task:
Build the dedicated onboarding shell route at `/settings/onboarding` using the spotlight / command-dialog visual language as inspiration.

Touch only:
- route wiring
- one new page
- onboarding shell components
- onboarding snapshot helper usage
- one small shared UI primitive only if genuinely necessary

Do not change:
- canonical storage writes
- finalization flow
- business scope forms
- settings page structure beyond linking if absolutely necessary
- unrelated styling systems

Important constraints:
- this must be route-driven, not a tiny modal
- it must save draft progress into `settings.onboarding_briefing_v1`
- it must not write `playbook_rules` or `studio_business_profiles` yet
- do not literally render a command palette list for onboarding
- no floating bubbles, card flips, or live AI preview in this slice

Done means:
- `/settings/onboarding` exists
- the shell looks like the same design family as Ctrl+K
- draft step state persists to the onboarding snapshot
- close/reopen can resume safely

Stop after this slice.
```

## Prompt 3: Identity, Scope, And Voice Slice

```text
Implement only the onboarding briefing identity / scope / voice slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 4 and Phase 11
- docs/v3/ARCHITECTURE.md sections on onboarding and photographer preference categories
- docs/v3/DATABASE_SCHEMA.md sections 5.1 and 5.1A
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_03_SCOPE_AND_VOICE.md
- src/lib/onboardingV4Payload.ts
- src/lib/onboardingBusinessScopeDeterministic.ts
- src/lib/onboardingKnowledgeBaseStructured.ts

Task:
Build only these onboarding sections:
- Studio Identity
- Business Scope
- Voice & Standard Knowledge

Touch only:
- the onboarding page / shell children for these sections
- one or two narrow onboarding components
- one mapping helper for display labels to canonical values if needed
- snapshot read/write integration

Do not change:
- authority matrix
- vault scenarios
- finalization logic
- runtime workers
- unrelated settings sections

Important constraints:
- use chips, cards, tags, and archetypes
- do not use sliders
- do not invent unsupported service or deliverable keys
- voice preview must be deterministic example swapping, not a live LLM call
- all values must align cleanly with `OnboardingPayloadV4`

Done means:
- these three sections are usable
- snapshot saves structured values
- the stored values map cleanly into the existing onboarding payload helpers

Stop after this slice.
```

## Prompt 4: Authority And Vault Slice

```text
Implement only the onboarding briefing authority and vault slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 4 and Phase 11
- docs/v3/ARCHITECTURE.md sections on decision modes and onboarding
- docs/v3/DATABASE_SCHEMA.md section 5.17
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_04_AUTHORITY_AND_VAULT.md
- src/lib/onboardingV4Payload.ts
- src/lib/onboardingStoragePlaybookRules.ts
- src/lib/onboardingActionPermissionMatrixScheduling.ts
- src/lib/onboardingCaptureEscalationPreferences.ts

Task:
Build only these onboarding sections:
- Approval Philosophy
- The Vault

Touch only:
- the onboarding page / shell children for these sections
- one or two narrow onboarding components
- one mapping helper from UI chip choice to `decision_mode` or action matrix values
- snapshot read/write integration

Do not change:
- finalization logic
- settings re-entry
- unresolved inquiry progression policy family
- unrelated workers or runtime policy reads

Important constraints:
- use the 4-chip autonomy model
- group scenarios by category
- store structured choices, not prose-only notes
- do not invent new action keys outside the v1 onboarding briefing action set
- keep optional note fields as supporting nuance only

Done means:
- users can complete the authority matrix and vault sections
- the snapshot captures values that can later become canonical `playbook_rules`
- no final canonical persistence happens yet

Stop after this slice.
```

## Prompt 5: Finalize And Settings Re-Entry Slice

```text
Implement only the onboarding briefing finalize and settings re-entry slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 4 and Phase 11
- docs/v3/ARCHITECTURE.md onboarding section
- docs/v3/DATABASE_SCHEMA.md sections 5.1, 5.1A, and 5.17
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_05_FINALIZE_AND_SETTINGS_REENTRY.md
- src/lib/onboardingV4Payload.ts
- src/lib/photographerSettings.ts
- the onboarding snapshot helper from slice 01

Task:
- add one canonical `completeOnboardingV4` finalization path
- transactionally persist canonical onboarding storage
- support reopening onboarding later from Settings

Touch only:
- one onboarding finalizer service / action / edge path
- one helper to replace onboarding-owned playbook rows safely
- one helper to hydrate editor state from canonical stores
- narrow settings entry links or cards
- the onboarding review/finalize area

Do not change:
- unrelated settings sections
- runtime worker behavior
- non-onboarding playbook rows
- broad dashboard redesign

Important constraints:
- finalization must call `mapOnboardingPayloadToStorage`
- replace only onboarding-owned `playbook_rules`, never all rules
- update `onboarding_completed_at`
- refresh the onboarding snapshot to `completed`
- runtime must still ignore the editable snapshot for policy/scope decisions

Done means:
- onboarding can be finalized into canonical storage
- reopening from Settings is possible
- hydration can derive editor state from canonical storage when needed

Stop after this slice.
```

## Prompt 6: Full Guided Sequence For Vibecoder

```text
We are implementing the onboarding / studio briefing feature in narrow slices.

You must follow the onboarding briefing docs exactly.

Read first:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md
- docs/v3/ARCHITECTURE.md section "Onboarding"
- docs/v3/DATABASE_SCHEMA.md sections 5.1, 5.1A, and 5.17
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md

Then implement ONLY this slice:
- [PASTE EXACT SLICE DOC PATH HERE]

Repo context:
- `photographers.settings` may contain an editor-only onboarding snapshot for later editing
- runtime policy and scope must still come from canonical split storage
- the onboarding visual language should borrow from the current Ctrl+K / spotlight shell
- the onboarding route is `/settings/onboarding`
- the experience should feel like briefing a senior studio manager, not configuring software

Non-negotiables:
- one slice only
- touch only the files required for that slice
- do not invent extra storage layers
- do not move runtime policy into `settings`
- do not overdesign beyond the slice

Before coding:
- restate the exact files you will touch
- restate what you will not touch

After coding:
- summarize exactly how the implementation matches the slice doc
- stop
```

## Prompt 7: Review / Guardrail Prompt

Use this when you want the vibecoder to review its own work before continuing.

```text
Review the onboarding briefing implementation strictly against these docs:
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- [PASTE THE RELEVANT SLICE DOC]
- docs/v3/ARCHITECTURE.md onboarding section
- docs/v3/DATABASE_SCHEMA.md sections 5.1, 5.1A, and 5.17

Check for these failure modes:
- policy or business scope incorrectly stored only in `photographers.settings`
- runtime source of truth confused with editor snapshot
- unsupported service types or action keys invented ad hoc
- UI interaction pattern violating the deterministic rules (sliders, drag-and-drop matrix, prose-only capture)
- too many unrelated files changed for one slice
- finalization replacing all playbook rules instead of onboarding-owned rows only

Output:
1. pass/fail
2. exact issues
3. exact files/lines to revisit

Do not rewrite code in this step unless explicitly asked.
```
