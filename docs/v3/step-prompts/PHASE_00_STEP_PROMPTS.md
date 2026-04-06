# PHASE 0 STEP PROMPTS

## Step 0A

```text
Implement only Step 0A from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 0
- docs/v3/execute_v3.md Step 0A

Task:
Treat the rewritten docs in docs/v3 as the active source for the next build and align the current implementation slice to that truth.

Touch only the smallest files needed for this alignment.

Do not change schema or unrelated workers.

Stop after Step 0A and summarize what still disagrees with the docs.
```

## Step 0B

```text
Implement only Step 0B from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 0
- docs/v3/execute_v3.md Step 0B

Task:
Regenerate src/types/database.types.ts from the actual database contract for this slice.

Touch only:
- src/types/database.types.ts

Do not change runtime logic.

Stop after Step 0B.
```

## Step 0C

```text
Implement only Step 0C from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 0
- docs/v3/execute_v3.md Step 0C
- docs/v3/DATABASE_SCHEMA.md sections 2 and 3

Task:
Audit code for one stale assumption that no longer matches reality and fix only that one assumption.

Prefer a tenant-isolation stale assumption first if one exists.

Touch only the files required by that one stale assumption.

Do not broad-refactor.

Stop after Step 0C and name the next stale assumption separately.
```

## Step 0D

```text
Implement only Step 0D from docs/v3/execute_v3.md.

Task:
Do not remove current workers.

If any change in this slice would remove, replace, or bypass a current worker permanently, stop and preserve compatibility instead.

Touch only the minimum files needed to preserve the current workers while preparing the next slice.

Stop after Step 0D.
```

## Step 0E

```text
Implement only Step 0E from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 0
- docs/v3/execute_v3.md Step 0E
- docs/v3/DATABASE_SCHEMA.md section 3 Universal Rules

Task:
Audit one critical path specifically for tenant isolation.

Choose one:
- webhook-web
- webhook-approval
- api-resolve-draft
- outbound send path
- one service-role worker path

Touch only the files needed for that one path.

Done means:
- tenant ownership is verified more safely on that path
- no cross-tenant trust gap remains in that slice

Stop after Step 0E and name the next most dangerous tenant-isolation gap separately.
```
