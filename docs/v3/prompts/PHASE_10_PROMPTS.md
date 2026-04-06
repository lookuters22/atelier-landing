# PHASE 10 PROMPTS

Use for proactive automation, pauses, and awaiting-reply behavior.

## Prompt A: Sleeper Guard Slice

```text
Implement only one Phase 10 sleeper-guard slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 10
- docs/v3/execute_v3.md Phase 10
- docs/v3/ARCHITECTURE.md Proactive Automation and Pauses

Task:
Patch only [WORKER NAME] to re-check pause and lock state after waking.

Touch only:
- one sleeper worker

Do not change:
- other sleepers
- orchestration
- UI

Stop after this slice.
```

## Prompt B: Awaiting-Reply Slice

```text
Implement only one Phase 10 awaiting-reply slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 10
- docs/v3/execute_v3.md Phase 10
- docs/v3/DATABASE_SCHEMA.md section 5.13 tasks

Task:
Implement only the resolver behavior for [answer / deferral / still-unresolved].

Touch only:
- one helper
- one caller or worker if needed

Do not invent arbitrary timers.

Stop after this slice.
```
