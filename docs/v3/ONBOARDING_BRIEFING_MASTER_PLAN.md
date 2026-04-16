# ONBOARDING BRIEFING MASTER PLAN

## 1. Purpose

This document is the implementation packet for the new onboarding UI.

It is written so Cursor can build the feature in safe, narrow slices without:

- collapsing all onboarding data into one `settings` blob
- inventing new preference storage outside the documented layers
- overdesigning the UI before the persistence contract is stable

This plan assumes the desired product direction is:

- onboarding should feel like **briefing a senior studio manager**
- the visual language should borrow from the current `Ctrl+K` / spotlight overlay
- users should be able to return later from **Settings** and edit the same briefing

## 2. Current Repo Truth

### What already exists

- `photographers.settings` exists and already stores identity/setup metadata
- onboarding mapping helpers already exist in:
  - `src/lib/onboardingV4Payload.ts`
  - `src/lib/onboardingBusinessScopeDeterministic.ts`
  - `src/lib/onboardingStoragePlaybookRules.ts`
  - `src/lib/onboardingActionPermissionMatrixScheduling.ts`
  - `src/lib/onboardingCaptureEscalationPreferences.ts`
  - `src/lib/onboardingKnowledgeBaseStructured.ts`
- the current settings page can read/write known settings contract keys
- the current command-dialog visual language already exists in:
  - `src/components/StudioSpotlight.tsx`
  - `src/components/ui/command.tsx`

### What does not exist yet

- no dedicated onboarding UI
- no end-to-end onboarding save/finalize action
- no `studio_business_profiles` migration in the checked-in schema yet
- no hydration path that reconstructs onboarding state for editing later

## 3. Non-Negotiables

### 3.1 Split storage remains canonical

Onboarding must still fan out into:

- `photographers.settings` for identity + onboarding metadata
- `studio_business_profiles` for what the studio offers
- `playbook_rules` for reusable behavior policy
- optional `knowledge_base` entries for reusable standard knowledge

### 3.2 Editable snapshot in settings is allowed, but editor-only

Because the product needs later editing from Settings, we will keep one versioned onboarding
snapshot in `photographers.settings`.

That snapshot exists for:

- draft save
- resume later
- Settings re-entry
- review/audit of what the UI captured

That snapshot must **not** become the runtime source of truth for policy or business scope.

### 3.3 The UI must stay deterministic

Do not use:

- sliders for tone
- drag-and-drop matrices
- giant prose textareas as the primary capture path

Prefer:

- chips
- cards
- archetype selectors
- tags
- scenario choices
- one optional note field per row when nuance is needed

### 3.4 Keep the visual language premium but restrained

Use the spotlight / command-dialog styling as inspiration:

- centered shell
- blurred backdrop
- refined card surfaces
- quiet motion

Do **not** build a hyper-animated concept piece first.

V1 should feel calm, premium, and obvious to use.

## 4. Product Shape

## 4.1 Shell

Use a dedicated route-driven onboarding flow, for example:

- `/settings/onboarding`

The route should render as a centered, command-dialog-inspired briefing shell over a softened
backdrop. This keeps the look close to `Ctrl+K` while giving the flow enough room for real forms.

### Why route-driven instead of a tiny modal

- the flow has multiple sections
- users need resume/edit support
- Settings must deep-link into it later
- browser refresh and navigation should not destroy progress

## 4.2 Sections

V1 briefing sections:

1. Studio Identity
2. Business Scope
3. Voice & Standard Knowledge
4. Approval Philosophy
5. The Vault: Money, Contracts, Sensitive Policies
6. Review & Finalize

## 4.3 Step-to-storage mapping

### Studio Identity

Maps mainly to:

- `photographers.settings`

Examples:

- studio name
- manager name
- photographer names
- timezone
- currency
- operator WhatsApp identity

### Business Scope

Maps mainly to:

- `studio_business_profiles`

Examples:

- offered service types
- travel stance
- geographic scope
- deliverables
- out-of-scope lead behavior

### Voice & Standard Knowledge

Maps mainly to:

- optional `knowledge_base` seeds
- small playbook instructions where needed
- editable snapshot in settings

Examples:

- tone archetype
- banned phrases
- signature preference
- standard explanation snippets

### Approval Philosophy

Maps mainly to:

- `playbook_rules.decision_mode`

Examples:

- can Ana schedule alone
- can Ana move calls
- can Ana draft only
- what always needs approval

### The Vault

Maps mainly to:

- `playbook_rules`

Examples:

- discounts
- payment exceptions
- invoice handling
- RAW files
- publication permission
- vendor / planner rules

## 5. Editable Snapshot Contract

Store one versioned editor snapshot in `photographers.settings`:

`settings.onboarding_briefing_v1`

Recommended shape:

```ts
type OnboardingBriefingSnapshotV1 = {
  schema_version: 1;
  status: "draft" | "completed";
  completed_steps: string[];
  last_saved_at: string; // ISO
  payload: OnboardingPayloadV4;
};
```

Also store:

- `settings.onboarding_briefing_updated_at`

### Rules

- the snapshot may mirror the UI state closely
- the runtime must ignore it for policy/scope decisions
- final publish writes canonical stores first, then refreshes the snapshot to match

## 6. Load / Save Precedence

### Draft save

Saving progress during onboarding writes only:

- `settings.onboarding_briefing_v1`
- `settings.onboarding_briefing_updated_at`

It does **not** rewrite canonical `playbook_rules` or `studio_business_profiles` on every keystroke.

### Finalize

Finalizing the briefing:

1. validates the snapshot / payload
2. maps it with `mapOnboardingPayloadToStorage`
3. writes canonical stores transactionally
4. updates `onboarding_completed_at`
5. refreshes the snapshot status to `completed`

### Re-enter from Settings later

Load precedence:

1. draft snapshot if it exists and is newer than canonical hydration
2. otherwise derive a snapshot from canonical stored layers
3. use that derived snapshot as the editable UI source

## 7. Canonical Action Vocabulary For V1

Do not invent action keys ad hoc in component code.

Use this onboarding v1 action set:

- `schedule_call`
- `move_call`
- `discount_quote`
- `send_invoice`
- `payment_plan_exception`
- `late_payment_extension`
- `release_raw_files`
- `publication_permission`
- `planner_coordination`
- `vendor_credit_request`
- `respond_to_art_feedback`
- `share_private_client_data`
- `proactive_followup`
- `operator_notification_routing`

### Explicitly deferred

Do **not** solve inquiry progression preference normalization in this onboarding build.

Still deferred:

- consultation-first vs pricing-first inquiry policy family
- brochure-first vs call-first progression
- budget-gap strategy normalization

That remains the unresolved `Phase 4 Step 4G` family from `execute_v3.md`.

## 8. UI Rules For Cursor

- Use the command-dialog shell as the aesthetic reference, not as a literal command menu.
- Keep the onboarding centered and quiet.
- Do not implement floating physics bubbles in v1.
- Do not implement live LLM streaming preview in v1.
- Use deterministic example swaps for tone preview.
- Mobile must work from day one.
- Keyboard support matters:
  - `Esc` closes only when safe
  - step navigation must not drop unsaved draft state

## 9. Slice Order

Implement in this exact order:

1. `ONBOARDING_BRIEFING_SLICE_01_SCHEMA_FOUNDATION.md`
2. `ONBOARDING_BRIEFING_SLICE_02_UI_SHELL.md`
3. `ONBOARDING_BRIEFING_SLICE_03_SCOPE_AND_VOICE.md`
4. `ONBOARDING_BRIEFING_SLICE_04_AUTHORITY_AND_VAULT.md`
5. `ONBOARDING_BRIEFING_SLICE_05_FINALIZE_AND_SETTINGS_REENTRY.md`

Each slice must ship independently.

Do not jump to slice 5 before slices 1 and 2 are real.
