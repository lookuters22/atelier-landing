# ONBOARDING EXPERIENCE REDESIGN SLICE 01: ENTRY AND STAGE

## Goal

Replace the current "large card with tabs" feeling with a staged onboarding entry experience that matches the dashboard's cinematic-to-focused behavior.

This slice is about:

- entry posture
- background treatment
- shell framing
- progress stance

It is **not** yet about rebuilding every step.

## Why This Slice Comes First

If the shell still feels like a modal form, every step redesign will inherit the wrong energy.

The first job is to change the stage.

## Product Direction

The user should feel:

- "I am entering a studio setup ritual"

not:

- "I opened a settings wizard"

## Required Experience Changes

### 1. Full-route stage

Keep `/onboarding` as a full-route experience.

The route should feel visually distinct from Settings and should not read like a child page inside a settings container.

### 2. Cinematic-to-focused entry

Borrow the emotional pattern from `Today`:

- soft atmospheric background
- refined entrance
- centered attention

Then tighten into a more functional guided workspace.

### 3. Progress posture

Replace the current flat "tab row" feel with one of these approved patterns:

- a left rail
- a step stack
- or a staged top progress strip with stronger hierarchy

But it must no longer feel like plain tabs.

## Motion Direction

Use Framer Motion only.

Allowed in this slice:

- shell fade/slide in
- progress item stagger
- content area transition between steps

Not allowed yet:

- bubble simulations
- GSAP
- complex field choreography

## Recommended Repo Focus

- onboarding shell
- onboarding progress component
- onboarding footer
- route stage/background composition

## Do Not

- do not change field content
- do not change payload or storage
- do not add new onboarding questions
- do not rebuild inner step UIs yet

## Done Means

- onboarding no longer feels like a generic modal form
- entry and shell are emotionally aligned with the dashboard
- the shell can support guided interactive steps later
