# PHASE 11.5 PROMPTS

Use for observability and telemetry.

## Prompt A: One Metric Slice

```text
Implement only one Phase 11.5 telemetry slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 11.5
- docs/v3/execute_v3.md Phase 11.5

Task:
Add only the metric for [blocks_by_verifier / escalation_rate / idempotency_saves / playbook_hit_rate].

Touch only:
- one logging or metric file
- one caller if needed

Do not build a full observability platform in this slice.

Stop after this slice.
```
