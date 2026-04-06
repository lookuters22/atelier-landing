# PHASE 4 PROMPTS

Use for onboarding, business profile, and playbook seeding.

## Prompt A: Onboarding Payload Slice

```text
Implement only one Phase 4 onboarding slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 4
- docs/v3/execute_v3.md Phase 4
- docs/v3/ARCHITECTURE.md onboarding and category sections
- docs/v3/DATABASE_SCHEMA.md sections 5.1, 5.1A, and 5.17

Task:
Define only the onboarding payload shape for [ONE CATEGORY GROUP].

Touch only:
- one shared type or helper file
- one narrow caller if needed

Do not change:
- full onboarding UI
- runtime workers
- unrelated settings

Done means:
- this onboarding category group maps to structured storage
- no giant freeform blob is used as the solution

Stop after this slice.
```

## Prompt B: Business Profile Persistence Slice

```text
Implement only one Phase 4 business-profile slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 4
- docs/v3/execute_v3.md Phase 4
- docs/v3/DATABASE_SCHEMA.md section 5.1A

Task:
Create only the persistence helper for `studio_business_profiles`.

Touch only:
- one helper
- one calling file if needed

Do not change:
- playbook writes
- onboarding UI

Stop after this slice.
```

## Prompt C: Playbook Seed Slice

```text
Implement only one Phase 4 playbook seeding slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 4
- docs/v3/execute_v3.md Phase 4
- docs/v3/DATABASE_SCHEMA.md section 5.17

Task:
Map only one onboarding category group into canonical `playbook_rules`.

Touch only:
- one mapping helper
- one persistence helper or caller

Do not change:
- unrelated onboarding groups
- workers

Stop after this slice.
```
