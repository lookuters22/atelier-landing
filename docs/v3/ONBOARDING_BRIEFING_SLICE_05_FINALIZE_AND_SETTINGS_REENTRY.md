# ONBOARDING BRIEFING SLICE 05: FINALIZE AND SETTINGS RE-ENTRY

## Goal

Make onboarding real:

- finalize the briefing into canonical storage
- support later editing from Settings
- keep the settings snapshot and canonical stores in sync

## Scope

### 1. Add one canonical finalize action

Recommended service entry point:

- `completeOnboardingV4`

It should:

1. read/validate the snapshot payload
2. call `mapOnboardingPayloadToStorage`
3. write canonical stores transactionally
4. update onboarding metadata
5. refresh the settings snapshot to `completed`

## Transaction Contract

Recommended order:

1. merge identity/meta into `photographers.settings`
2. upsert `studio_business_profiles`
3. replace only onboarding-derived `playbook_rules`
4. upsert optional onboarding-derived `knowledge_base` seeds
5. set `onboarding_completed_at`
6. update `onboarding_briefing_v1.status = "completed"`

## Safe replace rule for onboarding-derived playbook rows

Do not delete unrelated manually curated rules.

Before building the finalizer, make sure onboarding-generated rules can be replaced as a cohort.

Recommended approach:

- tighten onboarding-generated `source_type` values so they are clearly owned by this briefing flow

Example source types:

- `onboarding_briefing_v1`
- `onboarding_briefing_default_v1`
- `onboarding_briefing_matrix_v1`

Then replace only rows matching that owned cohort for the current photographer.

## 2. Settings Re-entry

### Settings page behavior

The settings page should become the re-entry point for the onboarding briefing.

Recommended entry cards:

- `Edit Studio Briefing`
- `Edit Business Scope`
- `Edit Ana's Authority`

These should deep-link into:

- `/settings/onboarding`
- with section or step params if needed

### Hydration behavior

When opening onboarding later:

1. prefer the editable snapshot if it exists
2. otherwise derive an editor snapshot from canonical stores
3. render the onboarding UI from that editor snapshot

Recommended new helper:

- `src/lib/onboardingBriefingHydration.ts`

This helper should reconstruct a usable `OnboardingPayloadV4`-shaped editor object from:

- `photographers.settings`
- `studio_business_profiles`
- onboarding-owned `playbook_rules`
- onboarding-owned `knowledge_base` seeds where needed

## 3. Review Screen

The final review screen should show plain-language summaries:

- Who We Are
- What We Offer
- How Ana Speaks
- What Ana May Do
- What Ana Must Ask About

Do not show raw JSON.

## Recommended Files

- onboarding finalizer service / server action / edge function
- playbook replace helper for onboarding-owned rows
- hydration helper for Settings re-entry
- `SettingsHubPage` entry cards / links
- review summary components

## Do Not

- do not rewrite all `playbook_rules` for the photographer
- do not make the settings snapshot the runtime source of truth
- do not silently drop unknown settings keys while updating the snapshot
- do not block later editing by only storing canonical rows with no hydration path

## Done Means

- finalize writes canonical stores transactionally
- reopening onboarding from Settings is possible
- the UI can resume from snapshot or derive from canonical state
- runtime still reads split canonical stores, not the editable snapshot
