# PHASE 5 PROMPTS

Use for decision context builder work.

## Prompt A: Context Type Slice

```text
Implement only one Phase 5 context-contract slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 5
- docs/v3/execute_v3.md Phase 5
- docs/v3/ARCHITECTURE.md memory and audience sections

Task:
Define only the typed decision-context object.

Touch only:
- one context type file
- one builder file if needed

Do not change:
- workers
- tools

Stop after this slice.
```

## Prompt B: Retrieval Helper Slice

```text
Implement only one Phase 5 retrieval slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 5
- docs/v3/execute_v3.md Phase 5
- docs/v3/DATABASE_SCHEMA.md only the relevant table sections

Task:
Build only the retrieval helper for [memories / playbook / globalKnowledge / audience facts].

Touch only:
- one shared retrieval helper
- one builder caller

Do not change:
- worker-specific ad hoc queries
- unrelated retrieval helpers

Stop after this slice.
```
