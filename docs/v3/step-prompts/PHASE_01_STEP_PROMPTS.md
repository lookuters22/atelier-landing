# PHASE 1 STEP PROMPTS

## Step 1A

```text
Implement only Step 1A from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 1
- docs/v3/execute_v3.md Step 1A
- docs/v3/DATABASE_SCHEMA.md section 5.1 photographers

Task:
Add and standardize the photographer settings contract in shared code, not ad hoc component logic.

Support these keys:
- studio_name
- manager_name
- photographer_names
- timezone
- currency
- whatsapp_number
- admin_mobile_number
- onboarding_completed_at
- playbook_version

Touch only the smallest helper or type files needed.

Do not change routing yet.

Stop after Step 1A.
```

## Step 1B

```text
Implement only Step 1B from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 1
- docs/v3/execute_v3.md Step 1B

Task:
Create the shared settings reader/writer helper.

Touch only:
- supabase/functions/_shared/settings.ts
- src/lib/photographerSettings.ts

If one of those files should not exist, create only the smallest correct helper path.

Do not change UI yet.

Stop after Step 1B.
```

## Step 1C

```text
Implement only Step 1C from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 1
- docs/v3/execute_v3.md Step 1C

Task:
Update src/pages/settings/SettingsHubPage.tsx to support the target settings contract while preserving current saved values.

Touch only:
- src/pages/settings/SettingsHubPage.tsx
- one settings helper if needed

Do not change WhatsApp routing or unrelated settings sections.

Stop after Step 1C.
```

## Step 1D

```text
Implement only Step 1D from docs/v3/execute_v3.md.

Task:
Prepare identity and settings only. Do not change client routing yet.

If your implementation tries to reroute client channels or cut over WhatsApp behavior, stop and keep the change limited to identity prep.

Touch only the minimum files required to preserve this boundary.

Stop after Step 1D.
```
