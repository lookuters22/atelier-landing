# PHASE 1 PROMPTS

Use for photographer settings and operator identity.

## Prompt A: Settings Helper Slice

```text
Implement only one Phase 1 settings slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 1
- docs/v3/execute_v3.md Phase 1
- docs/v3/DATABASE_SCHEMA.md section 5.1 photographers

Task:
Create or update only the shared settings helper for [ONE RESPONSIBILITY].

Touch only:
- [shared settings helper]
- [one narrow caller if needed]

Do not change:
- WhatsApp routing
- unrelated settings UI
- other helpers

Done means:
- the helper supports the documented settings contract for this one responsibility
- legacy `whatsapp_number` compatibility is preserved

Stop after this slice.
```

## Prompt B: Settings UI Slice

```text
Implement only one Phase 1 UI slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 1
- docs/v3/execute_v3.md Phase 1

Task:
Update only the settings UI for [ONE FIELD OR FIELD GROUP].

Touch only:
- src/pages/settings/SettingsHubPage.tsx
- one settings helper if required

Do not change:
- backend routing
- unrelated UI sections

Stop after this slice.
```
