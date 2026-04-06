# PHASE 2 STEP PROMPTS

## Step 2A

```text
Implement only Step 2A from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 2
- docs/v3/execute_v3.md Step 2A
- docs/v3/DATABASE_SCHEMA.md only the sections for the missing target tables

Task:
Create additive migrations for the missing target tables only.

Touch only:
- supabase/migrations/*
- src/types/database.types.ts if regeneration is needed

Do not change workers or frontend.

Stop after Step 2A.
```

## Step 2B

```text
Implement only Step 2B from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 2
- docs/v3/execute_v3.md Step 2B
- docs/v3/DATABASE_SCHEMA.md only the sections for the existing tables being extended

Task:
Add the target columns to existing tables exactly as documented.

Touch only:
- one migration
- src/types/database.types.ts if needed

Do not change workers.

Stop after Step 2B.
```

## Step 2C

```text
Implement only Step 2C from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 2
- docs/v3/execute_v3.md Step 2C
- docs/v3/DATABASE_SCHEMA.md constraint sections

Task:
Add only the unique constraints described in the schema docs.

Touch only:
- one migration

Do not add unrelated schema changes.

Stop after Step 2C.
```

## Step 2D

```text
Implement only Step 2D from docs/v3/execute_v3.md.

Task:
Regenerate database types immediately after this phase slice.

Touch only:
- src/types/database.types.ts

Stop after Step 2D.
```

## Step 2E

```text
Implement only Step 2E from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 2
- docs/v3/execute_v3.md Step 2E
- docs/v3/DATABASE_SCHEMA.md section 3 Universal Rules

Task:
Add one tenant-safety schema support slice only.

Choose one:
- direct photographer_id on one AI-facing table
- one unique constraint scoped by photographer_id
- one foreign-key path that makes ownership proof safer

Touch only:
- one migration
- generated types if needed

Stop after Step 2E.
```
