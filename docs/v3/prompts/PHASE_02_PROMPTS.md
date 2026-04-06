# PHASE 2 PROMPTS

Use for additive schema foundation work.

## Prompt A: One New Table Slice

```text
Implement only one Phase 2 schema slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 2
- docs/v3/execute_v3.md Phase 2
- docs/v3/DATABASE_SCHEMA.md only the section for [TABLE NAME]

Task:
Add only the [TABLE NAME] migration.

Touch only:
- supabase/migrations/*
- src/types/database.types.ts if regeneration is needed

Do not change:
- workers
- frontend
- unrelated tables

Done means:
- the table exists exactly as documented for this slice
- no overlapping duplicate table is created

Stop after this slice and suggest the next smallest schema slice.
```

## Prompt B: Existing Table Column Slice

```text
Implement only one Phase 2 column-group slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 2
- docs/v3/execute_v3.md Phase 2
- docs/v3/DATABASE_SCHEMA.md only the section for [EXISTING TABLE]

Task:
Add only these columns to [EXISTING TABLE]:
- [COLUMN 1]
- [COLUMN 2]

Touch only:
- one migration
- src/types/database.types.ts if regeneration is needed

Do not change:
- workers
- other tables

Stop after this slice.
```
