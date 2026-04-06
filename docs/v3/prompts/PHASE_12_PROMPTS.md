# PHASE 12 PROMPTS

Use for backfill and stress-test replay.

## Prompt A: One Replay Scenario Slice

```text
Implement only one Phase 12 replay slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 12
- docs/v3/execute_v3.md Phase 12
- the one relevant transcript or stress case

Task:
Create only one replay or regression test for [SCENARIO].

Touch only:
- one replay or QA file
- one small helper if needed

Do not change:
- runtime logic
- unrelated tests

Stop after this slice.
```

## Prompt B: One Backfill Slice

```text
Implement only one Phase 12 backfill slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 12
- docs/v3/execute_v3.md Phase 12
- docs/v3/DATABASE_SCHEMA.md only the relevant target sections

Task:
Create only one backfill path for [SETTINGS / PLAYBOOK / MEMORY / ATTACHMENTS].

Touch only:
- one script or helper

Do not change:
- runtime orchestration
- unrelated migrations

Stop after this slice.
```
