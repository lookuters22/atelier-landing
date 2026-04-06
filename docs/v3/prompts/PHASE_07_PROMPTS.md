# PHASE 7 PROMPTS

Use for action-based orchestration.

## Prompt A: Event Contract Slice

```text
Implement only one Phase 7 event-contract slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 7
- docs/v3/execute_v3.md Phase 7

Task:
Define only the event contract for [EVENT NAME].

Touch only:
- shared Inngest event schema
- one caller or receiver if needed

Do not change:
- legacy worker cutover
- unrelated events

Stop after this slice.
```

## Prompt B: Orchestrator Skeleton Slice

```text
Implement only the first safe Phase 7 orchestrator slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 7
- docs/v3/execute_v3.md Phase 7
- docs/v3/V3_OVERVIEW.md sections on the orchestrator and runtime flow

Task:
Create only the orchestrator skeleton for [CHANNEL].

Touch only:
- one orchestrator file
- one event registration file if needed

Do not change:
- outbound
- approvals
- legacy cutover behavior

Stop after this slice.
```
