# ONBOARDING RUNTIME FINALIZATION IMPLEMENTATION PACKET

## What is true today

The onboarding UI currently saves and completes an **editor snapshot** in `photographers.settings`.

That snapshot lives at:

- `settings.onboarding_briefing_v1`

The current completion path is in:

- `src/hooks/useOnboardingBriefingDraft.ts`

Today, `completeOnboarding()`:

1. marks the snapshot `status` as `"completed"`
2. writes `payload.settings_meta.onboarding_completed_at`
3. writes top-level `photographers.settings.onboarding_completed_at`

It does **not** finalize the onboarding payload into canonical runtime tables.

That means finishing onboarding does **not** currently make Ana runtime-ready.

## Why that is a problem

The codebase is already structured around split runtime truth:

- `photographers.settings` = studio identity / setup metadata
- `studio_business_profiles` = what the studio offers
- `playbook_rules` = reusable studio policy / authority / behavioral rules
- `knowledge_base` = reusable global studio knowledge

The onboarding snapshot itself is explicitly documented as editor-only:

- `src/types/onboardingBriefing.types.ts`

Runtime already reads canonical stores, not the snapshot blob. The clearest proof is:

- `supabase/functions/_shared/context/buildDecisionContext.ts`
- `supabase/functions/_shared/context/fetchActivePlaybookRulesForDecisionContext.ts`

Those functions load active `playbook_rules` for live decision-making.

So right now the onboarding flow is good for:

- draft save
- resume
- review
- completed badge/status

But it is **not** good enough for:

- "finish onboarding and immediately let runtime use these preferences"

## Existing mapping helper that should be used

The repo already has the correct split-storage mapper:

- `src/lib/onboardingV4Payload.ts`

Use:

- `mapOnboardingPayloadToStorage(photographerId, payload)`

It already returns:

- `settingsPatch`
- `studioBusinessProfile`
- `playbookRules`
- `knowledgeBaseSeeds`

It also already exposes:

- `mergeOnboardingSettingsPatch(existing, patch)`

So the missing piece is not data modeling. The missing piece is the **real finalizer**.

## Runtime-ready target behavior

When the user clicks the final onboarding completion CTA, the app should:

1. read the latest onboarding snapshot payload
2. validate that it exists and is structurally usable
3. map it through `mapOnboardingPayloadToStorage`
4. write the mapped data into canonical runtime tables
5. update the snapshot to `status: "completed"`
6. preserve the snapshot for re-entry/editing
7. return success only when canonical writes succeed

After that, runtime should be able to use the onboarding output immediately through its normal read paths.

## Important design constraint: make finalization atomic

Do **not** implement runtime finalization as a loose client-side series of:

- update settings
- then upsert business profile
- then delete rules
- then insert rules
- then insert KB

That would be vulnerable to partial writes.

The Supabase browser client does not give us a real multi-statement SQL transaction across those tables from the UI layer.

Recommended implementation:

1. create one server-side finalize entry point
2. do all canonical writes inside one transaction there
3. call that server-side entry point from `completeOnboarding()`

Preferred options:

- a Postgres RPC
- or an Edge Function that uses a single transaction-capable server-side path

If choosing between the two, prefer the approach that best fits existing project conventions and tenant authorization. The key requirement is **transactional writes**.

## Canonical write contract

The finalizer must perform the following writes for one `photographer_id`.

### 1. Merge `photographers.settings`

Use:

- `mergeOnboardingSettingsPatch`
- `mergeOnboardingBriefingSnapshotIntoSettings`

Required behavior:

- merge `settingsPatch` into the existing JSON
- preserve unrelated settings keys
- keep `onboarding_briefing_v1` in settings for editor re-entry
- set `onboarding_completed_at`
- keep identity fields in top-level settings if present in payload:
  - `studio_name`
  - `manager_name`
  - `photographer_names`
  - `timezone`
  - `currency`
  - `whatsapp_number`
  - `admin_mobile_number`

### 2. Upsert `studio_business_profiles`

Use the single row from:

- `mapping.studioBusinessProfile`

Behavior:

- upsert by `photographer_id`
- replace onboarding-owned fields with the mapped row
- keep this row canonical for runtime business scope reads

### 3. Replace only onboarding-owned `playbook_rules`

This is the most important safety rule.

Do **not** wipe all rules for the photographer.

Only replace rows owned by onboarding finalization.

Current mapper source types are too loose:

- `"onboarding"`
- `"onboarding_default"`

Tighten them into explicit owned cohorts, for example:

- `onboarding_briefing_v1`
- `onboarding_briefing_default_v1`
- `onboarding_briefing_matrix_v1`
- `onboarding_briefing_escalation_v1`

Then the finalizer can safely:

1. delete existing `playbook_rules` rows for that photographer where `source_type` is one of the onboarding-owned values
2. insert the fresh mapped onboarding rows

Do not touch manually curated or operator-learned rules outside that owned cohort.

Files involved:

- `src/lib/onboardingStoragePlaybookRules.ts`
- `src/lib/onboardingV4Payload.ts`

### 4. Replace only onboarding-owned `knowledge_base` rows

Apply the same ownership rule to onboarding-derived KB.

Do **not** delete the photographer's full `knowledge_base`.

Recommended ownership marker:

- `metadata.onboarding_source = "onboarding_briefing_v1"`

Structured onboarding KB already has:

- `metadata.onboarding_kb_v1`

That is helpful, but it is better to add a stable ownership marker too so replacement is deterministic.

Recommended behavior:

1. delete existing onboarding-owned KB rows for the photographer
2. insert the fresh onboarding KB rows

Files involved:

- `src/lib/onboardingKnowledgeBaseStructured.ts`
- `src/lib/onboardingV4Payload.ts`

### 5. Refresh the editor snapshot to completed

Keep the snapshot in settings.

Required behavior:

- `status = "completed"`
- `completed_steps = all onboarding steps`
- `current_step = "review"`
- `last_saved_at = now`
- `payload.settings_meta.onboarding_completed_at = now`

This is still useful for:

- re-entry
- editing later
- showing last completed payload

But it must remain editor state, not runtime truth.

## Suggested implementation shape

### A. Add a dedicated finalizer module

Recommended new file:

- `src/lib/completeOnboardingRuntime.ts`

Suggested responsibilities:

1. accept `photographerId`
2. load current settings + onboarding snapshot
3. validate snapshot payload
4. map via `mapOnboardingPayloadToStorage`
5. call server-side finalize entry point
6. return the finalized snapshot / metadata back to UI

This keeps `useOnboardingBriefingDraft.ts` small.

### B. Add a server-side transactional finalizer

Recommended name:

- `finalize_onboarding_briefing_v1`

Possible home:

- Supabase RPC
- or a dedicated Edge Function

It should receive:

- `photographer_id`
- `settings_json`
- `studio_business_profile`
- `playbook_rules`
- `knowledge_base_rows`

And inside one transaction:

1. update `photographers.settings`
2. upsert `studio_business_profiles`
3. delete onboarding-owned `playbook_rules`
4. insert onboarding-owned `playbook_rules`
5. delete onboarding-owned `knowledge_base`
6. insert onboarding-owned `knowledge_base`

### C. Update the React hook

Change:

- `src/hooks/useOnboardingBriefingDraft.ts`

So `completeOnboarding()` no longer directly performs only a settings update.

Instead it should:

1. call the new finalizer
2. set local state from the returned completed payload
3. fire `fireDataChanged("settings")`
4. optionally fire any other invalidation event if business profile / playbook consumers need refresh

## Recommended file-level changes

### `src/hooks/useOnboardingBriefingDraft.ts`

Replace the current in-hook completion write with a call into the new finalizer service.

### `src/lib/onboardingStoragePlaybookRules.ts`

Add explicit onboarding-owned source type constants and use them consistently for:

- explicit playbook seeds
- default `discount_quote`
- scheduling matrix derived rows
- escalation routing derived row

### `src/lib/onboardingKnowledgeBaseStructured.ts`

Add a stable ownership marker into metadata for onboarding-derived rows so they can be safely replaced later.

### `src/lib/onboardingV4Payload.ts`

Keep the mapping split as-is, but update it if needed to preserve the new explicit ownership metadata/source types.

### New server-side file(s)

Depending on implementation choice:

- new SQL migration for RPC
- or new Supabase Edge Function

## Acceptance criteria

The implementation is done when all of the following are true:

1. Completing onboarding updates top-level `photographers.settings` identity fields and `onboarding_completed_at`.
2. Completing onboarding upserts `studio_business_profiles`.
3. Completing onboarding replaces only onboarding-owned `playbook_rules`.
4. Completing onboarding replaces only onboarding-owned `knowledge_base` rows.
5. Runtime `buildDecisionContext` can pick up onboarding-derived policy through normal `playbook_rules` loading.
6. The onboarding snapshot remains in settings for draft/re-entry/editing.
7. No unrelated settings keys are lost.
8. No manually curated `playbook_rules` are deleted.
9. No unrelated `knowledge_base` rows are deleted.
10. Finalization is transactional or transaction-equivalent from the server side.

## Good verification steps

### Verify settings

After completion, confirm `photographers.settings` contains:

- `studio_name`
- `manager_name`
- `photographer_names`
- `timezone`
- `currency`
- `whatsapp_number`
- `admin_mobile_number`
- `onboarding_completed_at`
- `onboarding_briefing_v1.status = "completed"`

### Verify business scope

Confirm one `studio_business_profiles` row exists for the photographer and reflects:

- offered services
- geography
- travel
- deliverables
- lead acceptance
- language support
- extensions

### Verify playbook

Confirm onboarding-owned rules exist in `playbook_rules` and include:

- tone / voice rules
- authority rules
- scheduling matrix rules
- escalation routing
- default `discount_quote` if still required

### Verify KB

Confirm onboarding-owned rows exist in `knowledge_base` and can be identified by onboarding ownership metadata.

### Verify runtime

Run a flow that loads decision context and confirm the returned `playbookRules` includes the onboarding-derived policy.

## Full vibecoder prompt

Use this prompt as-is for implementation:

```text
Implement real runtime finalization for onboarding in this repo.

Context:
- The current onboarding completion path only marks the editor snapshot complete in photographers.settings.
- The editor snapshot key is settings.onboarding_briefing_v1.
- That snapshot is editor/draft-resume state only, not runtime truth.
- Runtime already reads canonical stores like playbook_rules and studio_business_profiles.

What exists already:
- src/hooks/useOnboardingBriefingDraft.ts
  - completeOnboarding() currently only writes the completed snapshot + onboarding_completed_at into photographers.settings.
- src/types/onboardingBriefing.types.ts
  - explicitly says runtime policy and business scope must read canonical tables, not only the snapshot blob.
- src/lib/onboardingV4Payload.ts
  - mapOnboardingPayloadToStorage(photographerId, payload)
  - mergeOnboardingSettingsPatch(existing, patch)
  - this already maps the onboarding payload into:
    - settingsPatch
    - studioBusinessProfile
    - playbookRules
    - knowledgeBaseSeeds
- src/lib/onboardingStoragePlaybookRules.ts
  - builds onboarding-derived playbook rule inserts
- src/lib/onboardingKnowledgeBaseStructured.ts
  - builds onboarding-derived KB seed rows
- supabase/functions/_shared/context/buildDecisionContext.ts
  - runtime loads active playbook_rules from canonical storage

Goal:
- make onboarding completion runtime-ready
- keep the onboarding snapshot for editor re-entry
- do not make the snapshot the runtime source of truth

Requirements:
1. Add a real finalizer for onboarding completion.
2. On complete:
   - read the latest onboarding snapshot payload
   - map it with mapOnboardingPayloadToStorage
   - write canonical stores
   - update the snapshot to completed
3. Canonical stores to write:
   - photographers.settings (merge, preserve unrelated keys)
   - studio_business_profiles (upsert by photographer_id)
   - playbook_rules (replace only onboarding-owned rows)
   - knowledge_base (replace only onboarding-owned rows)
4. Keep onboarding_briefing_v1 in settings for later edit/re-entry.
5. Do not delete unrelated manually curated playbook_rules.
6. Do not delete unrelated knowledge_base rows.
7. Prefer a server-side transactional implementation (RPC or Edge Function) instead of a client-side sequence of writes.

Implementation details:
- Create a dedicated finalizer module, e.g. src/lib/completeOnboardingRuntime.ts
- Update src/hooks/useOnboardingBriefingDraft.ts so completeOnboarding() calls the finalizer instead of only updating settings directly
- Tighten onboarding-owned playbook rule source_type values so they can be replaced safely as a cohort
  Suggested source_type values:
  - onboarding_briefing_v1
  - onboarding_briefing_default_v1
  - onboarding_briefing_matrix_v1
  - onboarding_briefing_escalation_v1
- Add a stable onboarding ownership marker to onboarding-derived knowledge_base metadata so those rows can be safely replaced
  Suggested marker:
  - metadata.onboarding_source = "onboarding_briefing_v1"

Server-side write contract:
1. merge settingsPatch into photographers.settings
2. merge the completed onboarding snapshot into settings
3. upsert studio_business_profiles by photographer_id
4. delete only onboarding-owned playbook_rules for that photographer
5. insert the mapped onboarding playbook_rules
6. delete only onboarding-owned knowledge_base rows for that photographer
7. insert the mapped onboarding knowledge_base rows

Acceptance criteria:
- Completing onboarding updates top-level settings identity fields and onboarding_completed_at
- Completing onboarding writes studio_business_profiles
- Completing onboarding writes onboarding-derived playbook_rules
- Completing onboarding writes onboarding-derived knowledge_base rows
- Runtime can read the onboarding-derived policy through the normal playbook_rules path
- The onboarding snapshot remains available for editing later
- No unrelated settings keys are lost
- No unrelated playbook_rules are deleted
- No unrelated knowledge_base rows are deleted

Please implement the code changes, and include:
- the new finalizer service/module
- the server-side transactional writer
- any source_type / metadata ownership constants needed
- a short verification note describing what changed and how the replacement safety works
```

## Bottom line

The repo is already very close.

The architecture is right.
The mapping helper is right.
The missing piece is a real runtime finalizer that writes canonical stores atomically and keeps the snapshot only as the editor layer.
