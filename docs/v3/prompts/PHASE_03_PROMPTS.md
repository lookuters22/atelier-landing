# PHASE 3 PROMPTS

Use for deterministic identity and dedupe.

## Prompt A: Normalization Helper Slice

```text
Implement only one Phase 3 normalization slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 3
- docs/v3/execute_v3.md Phase 3
- docs/v3/ARCHITECTURE.md section 8

Task:
Create only the shared [EMAIL / PHONE / NAME] normalization helper.

Touch only:
- the new helper file
- one narrow caller if required

Do not change:
- schema
- other resolvers
- workers broadly

Stop after this slice.
```

## Prompt B: Identity Resolver Slice

```text
Implement only one Phase 3 resolver slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 3
- docs/v3/execute_v3.md Phase 3
- docs/v3/DATABASE_SCHEMA.md sections for the relevant identity tables

Task:
Build only the resolver for [people / contact_points / threads / thread_weddings].

Touch only:
- one resolver helper
- one narrow caller if needed

Do not change:
- unrelated workers
- unrelated entity creation logic

Stop after this slice.
```
