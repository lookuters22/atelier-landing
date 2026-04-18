# ONBOARDING RUNTIME FINALIZATION: 4-SLICE PROMPTS

## Purpose

This document breaks onboarding runtime finalization into 4 implementation slices so it can be delegated cleanly and safely.

The goal is to move onboarding from:

- editor snapshot only

to:

- editor snapshot + canonical runtime storage finalization

without changing the core payload schema.

## Repo truth

Current state:

- `src/hooks/useOnboardingBriefingDraft.ts`
  - `completeOnboarding()` only marks the snapshot complete and updates `photographers.settings.onboarding_completed_at`
- `src/types/onboardingBriefing.types.ts`
  - explicitly says onboarding snapshot is editor-only and runtime should use canonical tables
- `src/lib/onboardingV4Payload.ts`
  - already maps onboarding payload into canonical storage buckets
- runtime already reads canonical `playbook_rules`

So the missing work is finalization, ownership safety, and integration.

## Slice plan

### Slice 1

Ownership hardening for onboarding-managed runtime rows.

### Slice 2

Server-side transactional finalizer for canonical runtime writes.

### Slice 3

UI hook integration so onboarding completion actually calls the finalizer.

### Slice 4

Verification, regression safety, and settings re-entry confidence.

---

## Slice 1 Prompt

```text
Implement Slice 1 of onboarding runtime finalization: ownership hardening for onboarding-managed runtime rows.

Repo context:
- The onboarding editor snapshot is stored in photographers.settings under onboarding_briefing_v1.
- That snapshot is editor-only, not runtime truth.
- Runtime reads canonical tables like playbook_rules and studio_business_profiles.
- The eventual finalizer will need to safely replace only onboarding-owned rows in playbook_rules and knowledge_base.

Why this slice exists:
- Right now onboarding-generated playbook rules use loose source_type values like "onboarding" and "onboarding_default".
- That is not safe enough for replacement because the finalizer must never delete unrelated manually curated rules.
- We also need a stable ownership marker for onboarding-derived knowledge_base rows so only those rows are replaced later.

Goals for this slice:
1. Introduce explicit, stable onboarding-owned source_type constants for playbook_rules.
2. Ensure all onboarding-derived playbook rule builders use those constants consistently.
3. Introduce a stable ownership marker for onboarding-derived knowledge_base rows.
4. Keep the existing payload/storage mapping behavior intact otherwise.
5. Do not implement finalization yet in this slice.

Read these docs first:
- docs/v3/ONBOARDING_RUNTIME_FINALIZATION_IMPLEMENTATION_PACKET.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_05_FINALIZE_AND_SETTINGS_REENTRY.md
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/DATABASE_SCHEMA.md
- docs/v3/ARCHITECTURE.md

Focus areas in those docs:
- onboarding snapshot is editor-only, not runtime truth
- runtime truth split across photographers.settings, studio_business_profiles, playbook_rules, knowledge_base
- finalization must replace only onboarding-owned rows, never unrelated tenant data

Files to inspect first:
- src/lib/onboardingStoragePlaybookRules.ts
- src/lib/onboardingKnowledgeBaseStructured.ts
- src/lib/onboardingV4Payload.ts
- src/lib/onboardingActionPermissionMatrixScheduling.ts

Required playbook ownership changes:
- Replace loose source_type defaults with explicit owned values, for example:
  - onboarding_briefing_v1
  - onboarding_briefing_default_v1
  - onboarding_briefing_matrix_v1
  - onboarding_briefing_escalation_v1
- Use stable exported constants instead of repeating string literals.
- Make sure these source_type values are applied to:
  - explicit onboarding playbook seeds
  - derived default discount_quote rule
  - scheduling matrix derived rules
  - escalation routing derived rule

Required KB ownership changes:
- Add a stable ownership marker to onboarding-derived knowledge_base rows.
- Recommended metadata marker:
  - metadata.onboarding_source = "onboarding_briefing_v1"
- Preserve the existing structured metadata under onboarding_kb_v1.
- Use exported constants for the ownership marker key/value if appropriate.

Constraints:
- Do not change the onboarding payload schema.
- Do not implement the finalizer yet.
- Do not add destructive replacement logic yet.
- Keep current mapping outputs compatible with future server-side finalization.

Acceptance criteria:
- All onboarding-derived playbook rule rows can be identified by explicit onboarding-owned source_type values.
- All onboarding-derived knowledge_base rows can be identified by stable onboarding ownership metadata.
- Existing mapping code still compiles and behaves the same aside from the stronger ownership markers.

Please implement the code changes and include a short summary of:
- the new source_type constants
- the KB ownership marker
- any places where future finalization can now safely target onboarding-owned rows
```

---

## Slice 2 Prompt

```text
Implement Slice 2 of onboarding runtime finalization: the server-side transactional finalizer.

Repo context:
- The onboarding payload-to-storage mapper already exists in src/lib/onboardingV4Payload.ts.
- Current completion only updates photographers.settings and marks the onboarding snapshot complete.
- Runtime uses canonical tables:
  - photographers.settings
  - studio_business_profiles
  - playbook_rules
  - knowledge_base
- Slice 1 should already have introduced explicit onboarding-owned playbook source_type constants and a stable onboarding KB ownership marker.

Goal:
- Add a real server-side finalizer that writes onboarding completion into canonical runtime tables transactionally.

Important:
- Do not implement this as a loose client-side sequence of Supabase writes.
- Use a server-side transactional path: RPC or Edge Function, whichever best fits the repo.
- The key requirement is transaction-safe canonical writes.

Files to inspect first:
- docs/v3/ONBOARDING_RUNTIME_FINALIZATION_IMPLEMENTATION_PACKET.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_05_FINALIZE_AND_SETTINGS_REENTRY.md
- docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md
- docs/v3/DATABASE_SCHEMA.md
- docs/v3/ARCHITECTURE.md
- src/lib/onboardingV4Payload.ts
- src/lib/onboardingBriefingSettings.ts
- src/lib/photographerSettings.ts
- src/hooks/useOnboardingBriefingDraft.ts
- src/types/database.types.ts

What to build:
1. Add a dedicated finalizer service/module, e.g.:
   - src/lib/completeOnboardingRuntime.ts
2. Add the server-side transactional writer:
   - recommended as a Supabase RPC or equivalent server-side implementation
3. The finalizer should:
   - read the current onboarding snapshot payload
   - validate that a usable snapshot exists
   - map it with mapOnboardingPayloadToStorage(photographerId, payload)
   - build the completed snapshot/settings object
   - submit the canonical writes through the server-side finalization path

Server-side write contract:
1. merge settingsPatch into photographers.settings
2. merge the completed onboarding snapshot into settings
3. upsert studio_business_profiles by photographer_id
4. delete only onboarding-owned playbook_rules for that photographer
5. insert mapped onboarding playbook_rules
6. delete only onboarding-owned knowledge_base rows for that photographer
7. insert mapped onboarding knowledge_base rows

Requirements:
- Preserve unrelated keys in photographers.settings
- Preserve onboarding_briefing_v1 for editor re-entry
- Do not delete unrelated playbook_rules
- Do not delete unrelated knowledge_base rows
- Return enough result information for the UI hook to refresh local state cleanly

Constraints:
- No schema rewrite
- No snapshot-as-runtime-truth shortcut
- No broad rule deletions

Acceptance criteria:
- There is now a real server-side finalization path
- It performs canonical writes transactionally or transaction-equivalently on the server side
- It targets only onboarding-owned playbook and KB rows for replacement
- It preserves the completed editor snapshot in settings

Please implement the code and include a short summary of:
- where the server-side finalizer lives
- how the replacement safety works
- how the transaction boundary is enforced
```

---

## Slice 3 Prompt

```text
Implement Slice 3 of onboarding runtime finalization: hook the onboarding UI completion flow into the new finalizer.

Repo context:
- Slice 2 should have added a real finalizer service/module and server-side transactional canonical writer.
- Right now src/hooks/useOnboardingBriefingDraft.ts completeOnboarding() only marks the snapshot completed in photographers.settings.

Goal:
- Make onboarding completion actually call the new runtime finalizer.

Files to inspect first:
- docs/v3/ONBOARDING_RUNTIME_FINALIZATION_IMPLEMENTATION_PACKET.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_05_FINALIZE_AND_SETTINGS_REENTRY.md
- src/hooks/useOnboardingBriefingDraft.ts
- src/lib/completeOnboardingRuntime.ts (or whatever finalizer file exists from Slice 2)
- src/lib/onboardingBriefingSettings.ts
- src/lib/onboardingV4Payload.ts

Required changes:
1. Update completeOnboarding() in src/hooks/useOnboardingBriefingDraft.ts
2. Replace the current direct settings-only completion logic with a call to the real finalizer
3. Keep local React state correct after successful completion:
   - completedSteps should be updated
   - payload should reflect onboarding_completed_at
   - saveError should still surface failures cleanly
4. Keep existing autosave/draft behavior unchanged
5. Preserve the onboarding snapshot for later re-entry

Behavior requirements:
- The UI should only consider onboarding truly completed after the finalizer succeeds
- If finalization fails, do not silently mark the UI complete
- Fire the existing settings invalidation event after success
- Add any additional invalidation only if necessary and consistent with the repo

Constraints:
- Do not regress the draft/resume flow
- Do not move runtime logic back into the hook
- The hook should orchestrate, not own storage finalization details

Acceptance criteria:
- Completing onboarding from the UI now triggers canonical runtime finalization
- The hook remains clean and mostly UI-facing
- Errors from finalization are surfaced properly
- Draft save/resume still works

Please implement the changes and include a short summary of:
- how completeOnboarding() changed
- what state is updated after success
- how failure behavior works now
```

---

## Slice 4 Prompt

```text
Implement Slice 4 of onboarding runtime finalization: verification, regression safety, and settings re-entry confidence.

Repo context:
- Slice 1 should have hardened ownership markers
- Slice 2 should have added the transactional finalizer
- Slice 3 should have wired the UI hook into it

Goal:
- Add verification coverage and sanity checks so we know runtime finalization is safe and usable.

Files to inspect first:
- docs/v3/ONBOARDING_RUNTIME_FINALIZATION_IMPLEMENTATION_PACKET.md
- docs/v3/ONBOARDING_BRIEFING_SLICE_05_FINALIZE_AND_SETTINGS_REENTRY.md
- docs/v3/DATABASE_SCHEMA.md
- src/hooks/useOnboardingBriefingDraft.ts
- src/lib/completeOnboardingRuntime.ts
- src/lib/onboardingV4Payload.ts
- supabase/functions/_shared/context/buildDecisionContext.ts
- existing tests or verification harnesses in the repo

Required verification coverage:
1. Completing onboarding updates top-level settings identity fields and onboarding_completed_at
2. Completing onboarding writes or updates studio_business_profiles
3. Completing onboarding replaces only onboarding-owned playbook_rules
4. Completing onboarding replaces only onboarding-owned knowledge_base rows
5. Runtime decision-context loading can see onboarding-derived playbook policy through normal canonical reads
6. The onboarding snapshot remains available for editor re-entry after completion
7. Unrelated settings keys survive
8. Unrelated manual playbook rules survive
9. Unrelated knowledge_base rows survive

What to add:
- automated tests where the repo already supports them
- otherwise focused verification helpers or harness coverage
- small defensive assertions if needed

Also review re-entry safety:
- confirm the completed snapshot remains usable for reopening onboarding later
- do not implement a full canonical-to-editor hydration rewrite in this slice unless needed

Constraints:
- Keep this slice verification-focused
- Do not redesign onboarding UI
- Do not broaden the finalizer scope beyond onboarding-owned data

Acceptance criteria:
- There is concrete verification proving the finalizer is writing canonical runtime state
- There is concrete verification proving unrelated rows are not deleted
- There is confidence that settings re-entry still works off the retained snapshot

Please implement the verification work and include a short summary of:
- what was tested
- what safety guarantees are now covered
- any residual risk that remains
```
