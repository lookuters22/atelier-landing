# PHASE 3 STEP PROMPTS

## Step 3A

```text
Implement only Step 3A from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 3
- docs/v3/execute_v3.md Step 3A

Task:
Create the shared normalization helpers for this slice.

Implement only one helper first:
- normalizeEmail
- normalizePhone
- normalizeName

Touch only the helper file and one narrow caller if needed.

Stop after Step 3A.
```

## Step 3B

```text
Implement only Step 3B from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 3
- docs/v3/execute_v3.md Step 3B
- docs/v3/DATABASE_SCHEMA.md identity-related table sections

Task:
Create deterministic identity helpers for one entity area only:
- people
- contact points
- threads
- thread-to-wedding candidate matches

Touch only that helper slice.

Stop after Step 3B.
```

## Step 3C

```text
Implement only Step 3C from docs/v3/execute_v3.md.

Task:
Prevent direct ad hoc inserts where a reusable resolver helper should own the behavior.

Refactor only one worker or caller to use the shared resolver.

Do not refactor multiple workers in one pass.

Stop after Step 3C.
```

## Step 3D

```text
Implement only Step 3D from docs/v3/execute_v3.md.

Task:
When a thread may map to more than one wedding, write candidate rows into thread_weddings instead of forcing a bad merge.

Touch only the resolver or matching logic required for this behavior.

Do not redesign unrelated matching logic.

Stop after Step 3D.
```

## Step 3E

```text
Implement only Step 3E from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 3
- docs/v3/execute_v3.md Step 3E

Task:
Remove one trust path that relies on client-supplied tenant identity when a safer resolution path exists.

Prefer one of:
- verified JWT
- trusted operator identity
- owned parent-record lookup

Touch only the ingress or resolver files needed for that one trust gap.

Stop after Step 3E.
```
