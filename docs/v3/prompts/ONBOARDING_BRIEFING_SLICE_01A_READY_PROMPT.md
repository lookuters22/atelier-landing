# ONBOARDING BRIEFING SLICE 01A READY PROMPT

Use this as the first prompt to start implementation.

It is intentionally narrower than the broader schema-foundation prompt so it fits:

- `docs/v3/.cursorrules`
- the repo rule to work in very small slices
- the preference for additive schema-first changes before helper/UI work

```text
Implement only the onboarding briefing schema foundation START slice.

Follow the Cursor rules in:
- docs/v3/.cursorrules

Canonical doc set for this build:
- docs/v3/

Read first:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md
- docs/v3/ARCHITECTURE.md section "Onboarding"
- docs/v3/DATABASE_SCHEMA.md sections 5.1 and 5.1A
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_01_SCHEMA_FOUNDATION.md

Also inspect:
- supabase/migrations/*
- src/types/database.types.ts

Repo context you must respect:
- onboarding will later use a dedicated route-driven UI at `/settings/onboarding`
- onboarding may store an editor-only snapshot in `photographers.settings` for draft/resume/edit
- runtime must still read canonical split storage
- `studio_business_profiles` is the canonical store for business scope
- do not collapse onboarding into one `settings` blob
- do not invent a separate onboarding drafts table
- preserve compatibility surfaces like existing settings keys

Your task in this prompt:
- create only the additive migration for `studio_business_profiles`
- regenerate only `src/types/database.types.ts`

The `studio_business_profiles` table contract should match the docs:
- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL UNIQUE
- `service_types` JSONB NOT NULL DEFAULT '[]'::jsonb
- `service_availability` JSONB NOT NULL DEFAULT '{}'::jsonb
- `geographic_scope` JSONB NOT NULL DEFAULT '{}'::jsonb
- `travel_policy` JSONB NOT NULL DEFAULT '{}'::jsonb
- `booking_scope` JSONB NOT NULL DEFAULT '{}'::jsonb
- `client_types` JSONB NOT NULL DEFAULT '[]'::jsonb
- `deliverable_types` JSONB NOT NULL DEFAULT '[]'::jsonb
- `lead_acceptance_rules` JSONB NOT NULL DEFAULT '{}'::jsonb
- `language_support` JSONB NOT NULL DEFAULT '[]'::jsonb
- `team_structure` JSONB NOT NULL DEFAULT '{}'::jsonb
- `source_type` TEXT NOT NULL DEFAULT 'onboarding'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Touch only:
- one new migration file
- `src/types/database.types.ts`
- one doc only if the migration reveals a tiny contract mismatch that must be corrected

Do not change:
- onboarding UI
- settings page UI
- onboarding snapshot helper
- `src/lib/onboardingV4Payload.ts`
- runtime workers
- finalization logic
- unrelated docs

Implementation rules:
- keep the migration additive
- include `photographer_id` tenant ownership as documented
- do not invent extra columns not already in the documented table contract
- if the generated types disagree with the migration after regeneration, trust the migration and fix the generated output only
- stop after schema + generated types are complete

Before coding:
- state the exact files you will touch
- confirm this is intentionally schema-only

After coding:
- summarize the migration added
- confirm `src/types/database.types.ts` was regenerated
- recommend the next smallest safe slice

Stop after this slice.
```
