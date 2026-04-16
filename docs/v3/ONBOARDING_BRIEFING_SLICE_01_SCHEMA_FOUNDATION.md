# ONBOARDING BRIEFING SLICE 01: SCHEMA FOUNDATION

## Goal

Create the storage foundation so the onboarding UI can save draft state safely and later fan out into
canonical runtime storage.

## Why this slice exists

The repo already has onboarding mapping helpers, but:

- `studio_business_profiles` is still only a target contract in docs
- there is no explicit editor snapshot contract for later editing from Settings

This slice makes those two foundations real.

## Scope

### 1. Add the `studio_business_profiles` migration

Create the additive migration for the target table described in `docs/v3/DATABASE_SCHEMA.md`.

Required columns:

- `id`
- `photographer_id` unique
- `service_types`
- `service_availability`
- `geographic_scope`
- `travel_policy`
- `booking_scope`
- `client_types`
- `deliverable_types`
- `lead_acceptance_rules`
- `language_support`
- `team_structure`
- `source_type`
- `created_at`
- `updated_at`

### 2. Regenerate database types

After migration:

- regenerate `src/types/database.types.ts`

### 3. Add editor-snapshot types/helpers

Add a dedicated editor contract for the settings snapshot.

Recommended new file:

- `src/types/onboardingBriefing.types.ts`

Recommended new helper:

- `src/lib/onboardingBriefingSettings.ts`

This helper should handle:

- reading `settings.onboarding_briefing_v1`
- validating its schema version
- writing it back without deleting unrelated settings keys

### 4. Keep the strict settings contract clean

Do **not** bloat `PhotographerSettings` with the entire onboarding form.

`PhotographerSettings` should stay focused on known identity/setup keys.

The editor snapshot should live as a separate versioned object inside `settings`, handled by a
separate helper/type.

## Recommended snapshot shape

```ts
type OnboardingBriefingSnapshotV1 = {
  schema_version: 1;
  status: "draft" | "completed";
  completed_steps: string[];
  last_saved_at: string;
  payload: OnboardingPayloadV4;
};
```

## Files To Touch

- `supabase/migrations/<timestamp>_studio_business_profiles.sql`
- `src/types/database.types.ts`
- `src/types/onboardingBriefing.types.ts` (new)
- `src/lib/onboardingBriefingSettings.ts` (new)
- optionally `src/lib/onboardingV4Payload.ts` only if a tiny type alignment is needed

## Do Not

- do not build the UI yet
- do not invent a new onboarding table for draft state
- do not make runtime read the settings snapshot
- do not store business scope or playbook policy only in settings and skip canonical storage

## Done Means

- `studio_business_profiles` exists in migrations
- generated DB types know about it
- the repo has one typed helper for the onboarding editor snapshot in settings
- no UI exists yet, but the persistence contract is now explicit and safe
