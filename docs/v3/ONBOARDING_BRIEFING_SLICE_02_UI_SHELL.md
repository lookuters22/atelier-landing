# ONBOARDING BRIEFING SLICE 02: UI SHELL

## Goal

Build the onboarding shell and draft-save behavior using the visual language of the current `Ctrl+K`
/ spotlight overlay, but sized and structured for a real multi-step briefing.

## Product Intent

This should feel like:

- a premium briefing overlay
- calm and editorial
- fast to understand

It should not feel like:

- a tiny command menu
- a generic SaaS wizard
- a concept animation demo

## Scope

### 1. Add a route-driven onboarding entry point

Recommended route:

- `/settings/onboarding`

This route should render:

- softened backdrop
- centered shell
- progress rail / step indicator
- main content area
- sticky footer with navigation actions

### 2. Reuse the spotlight visual language

Use the same design DNA as:

- `src/components/StudioSpotlight.tsx`
- `src/components/ui/command.tsx`

Specifically:

- blurred backdrop
- rounded centered surface
- restrained border / shadow treatment
- compact, elegant input/header rhythm

Do **not** literally render a `CommandList` for onboarding.

### 3. Draft save to settings snapshot

At this stage, moving between steps should save draft state to:

- `settings.onboarding_briefing_v1`

This is draft-save only.

Do not write canonical `playbook_rules` or `studio_business_profiles` yet.

### 4. Base shell sections

The shell must support these steps, even if later slices fill them:

- `identity`
- `scope`
- `voice`
- `authority`
- `vault`
- `review`

### 5. Keyboard and close behavior

Support:

- safe close and resume later
- step-to-step navigation without losing draft
- mobile and desktop layouts

## Recommended Component Split

- `src/pages/settings/OnboardingBriefingPage.tsx`
- `src/components/onboarding/OnboardingBriefingShell.tsx`
- `src/components/onboarding/OnboardingBriefingProgress.tsx`
- `src/components/onboarding/OnboardingBriefingFooter.tsx`

## UI Rules

- no floating physics bubbles in this slice
- no card flips
- no live AI calls
- no fancy motion beyond quiet fades / springs

The shell should be visually complete, but behaviorally simple.

## Files To Touch

- route wiring in app router / page routes
- new onboarding shell components
- onboarding draft helper usage from slice 01
- optional small shared UI primitives if genuinely needed

## Do Not

- do not implement real form mapping yet
- do not finalize onboarding
- do not add business logic to `SettingsHubPage` directly in this slice
- do not invent a second visual system that ignores the spotlight styling

## Done Means

- `/settings/onboarding` exists
- it looks like the command-palette family, but works as a multi-step briefing shell
- progress can be draft-saved into settings snapshot
- closing and reopening can resume the saved step state
