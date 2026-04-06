# PHASE 6 PROMPTS

Use for strict tool layer work.

## Prompt A: One Tool Schema Slice

```text
Implement only one Phase 6 tool-schema slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 6
- docs/v3/execute_v3.md Phase 6
- docs/v3/V3_OVERVIEW.md Tool Layer

Task:
Define only the Zod schema for [TOOL NAME].

Touch only:
- tool schema file

Do not create:
- a new worker
- a new agent
- overlapping tools

Stop after this slice.
```

## Prompt B: One Tool Implementation Slice

```text
Implement only one Phase 6 tool slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 6
- docs/v3/execute_v3.md Phase 6
- docs/v3/ARCHITECTURE.md Decision Modes and Decision Authority Contract

Task:
Implement only [TOOL NAME].

The tool must define:
- what it reads
- what it writes
- whether it is read-only or write-capable
- whether verifier approval is required

Touch only:
- one tool implementation file
- one schema file
- one test or caller if needed

Stop after this slice.
```
