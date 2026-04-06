# PHASE 0 PROMPTS

Use for truth sync, stale assumptions, and safety baseline work.

## Prompt A: One Truth Audit Slice

```text
Do not implement V3 broadly.

Implement only one Phase 0 truth-sync slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 0
- docs/v3/execute_v3.md Phase 0
- docs/v3/DATABASE_SCHEMA.md sections 2 and 3

Task:
Audit and fix only one stale assumption around [TOPIC].

Touch only:
- [FILE 1]
- [FILE 2 if truly needed]

Do not change:
- schema
- unrelated workers
- frontend unless this exact stale assumption is in UI code

Done means:
- one stale assumption is corrected
- the current repo truth matches the docs for this slice

Stop after this slice and tell me the next smallest truth-sync slice.
```

## Prompt B: Codegen Alignment Slice

```text
Implement only one Phase 0 codegen-alignment slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 0
- docs/v3/execute_v3.md Phase 0

Task:
Fix only one mismatch between migrations and generated database types related to [TOPIC].

Touch only:
- src/types/database.types.ts
- one caller file if needed

Do not change:
- business logic
- architecture

Stop after this slice.
```
