# PHASE 9 PROMPTS

Use for the learning loop.

## Prompt A: Resolution Classifier Slice

```text
Implement only one Phase 9 learning slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 9
- docs/v3/execute_v3.md Phase 9
- docs/v3/ARCHITECTURE.md Learning Model
- docs/v3/DATABASE_SCHEMA.md sections 5.15, 5.17, and 5.18

Task:
Implement only the resolution classifier for photographer answers.

Touch only:
- one learning helper
- one caller if needed

Do not change:
- unrelated tools
- UI

Stop after this slice.
```

## Prompt B: One Writeback Path Slice

```text
Implement only one Phase 9 writeback path.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 9
- docs/v3/execute_v3.md Phase 9

Task:
Implement only the writeback path for [playbook_rules / memories / escalation_requests link].

Touch only:
- one helper
- one narrow caller

Do not duplicate the same decision across multiple storage layers.

Stop after this slice.
```
