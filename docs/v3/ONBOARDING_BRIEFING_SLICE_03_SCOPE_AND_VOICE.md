# ONBOARDING BRIEFING SLICE 03: SCOPE AND VOICE

## Goal

Implement the first half of the actual onboarding inputs:

- Studio Identity
- Business Scope
- Voice & Standard Knowledge

This slice should make the product feel real without touching the high-stakes authority rules yet.

## Sections In Scope

### 1. Studio Identity

Capture:

- `studio_name`
- `manager_name`
- `photographer_names`
- `timezone`
- `currency`
- operator phone identity (`admin_mobile_number`; preserve `whatsapp_number` compatibility as needed)

Maps mainly to:

- `payload.settings_identity`
- `payload.settings_meta` later on finalize

### 2. Business Scope

Capture:

- offered service types
- travel stance
- geographic scope
- deliverables
- out-of-scope lead behavior
- language support

Maps mainly to:

- `payload.studio_scope`
- `payload.business_scope_deterministic`

### 3. Voice & Standard Knowledge

Capture:

- one tone archetype
- banned phrases tags
- signature / closing preference
- optional reusable standard language snippets

Maps mainly to:

- `payload.knowledge_seeds`
- snapshot-only UI state
- very small playbook seed additions only if needed

## UI Guidance

### Studio Identity

Keep this simple and fast.

### Business Scope

Use tactile cards and chips.

Important rule:

- UI labels may be luxurious or editorial
- stored values must stay aligned with the deterministic helper contract

Example:

- display label `Luxury weddings`
- stored canonical value `weddings`

Do not invent unsupported service keys unless you first extend:

- `src/lib/onboardingBusinessScopeDeterministic.ts`
- the architecture/schema docs

### Voice & Standard Knowledge

Use discrete tone archetypes, not sliders.

Use deterministic example swaps for preview, not live AI generation.

## Canonical Mapping Rules

### Service types

Only expose categories the deterministic helper can actually store/query in v1, unless a separate
slice expands that helper first.

### Deliverables

Only expose deliverable kinds that the deterministic helper supports.

### Tone

Tone does not directly become a numeric scale.

Store:

- chosen archetype
- banned phrases
- optional reusable standard copy

## Recommended Files

- onboarding step components for `identity`, `scope`, `voice`
- small mapping helpers for display label -> canonical value
- deterministic preview component for voice examples

## Do Not

- do not add authority matrix questions yet
- do not add high-stakes commercial scenarios yet
- do not make freeform prose the only storage path for voice
- do not invent service types outside the deterministic contract

## Done Means

- the first three sections are usable
- draft-save captures structured values in the settings snapshot
- the values align cleanly with `OnboardingPayloadV4`
- no canonical final persist happens yet
