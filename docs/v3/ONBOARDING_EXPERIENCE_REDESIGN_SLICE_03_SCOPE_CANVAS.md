# ONBOARDING EXPERIENCE REDESIGN SLICE 03: BUSINESS SCOPE CANVAS

## Goal

Rebuild Business Scope into the most expressive and tactile part of onboarding.

This is the one place where the UI should visibly feel alive.

## Core Direction

Business Scope should become a selection canvas, not a stacked settings form.

## Required Experience Model

### 1. Service bubbles / pebbles

The offered services area should become a bubble field.

Approved examples:

- Weddings
- Family
- Maternity
- Brand
- Video

Interaction:

- bubbles appear with gentle motion
- hover / focus raises them slightly
- selection creates a satisfying active state
- selected items feel "captured" or docked

These still map to the canonical deterministic service set.

### 2. Geography and travel as tactile cards

Geography and travel should not look like ordinary pills.

They should feel like:

- stance cards
- stronger, intentional selections
- visible chosen position

### 3. Deliverables as iconic tokens

Deliverables should be more visual than plain chips.

Still deterministic underneath, but visually faster to parse.

### 4. Custom additions remain secondary

`business_scope_extensions` stays correct architecturally.

But the UI should treat custom additions as:

- optional structured add-ons
- not equal to core canonical selections

## Motion Notes

Use Framer Motion for:

- bubble entry
- bubble selection
- bubble docking / active settle
- card emphasis transitions

Do not use GSAP in this slice unless Framer Motion proves insufficient.

## Architectural Rule

No custom user additions may change the deterministic canonical branching set.

Custom additions still belong only in:

- `payload.business_scope_extensions`

## Recommended Repo Focus

- Business Scope step
- small bubble/card visual primitives if needed

## Do Not

- do not invent new service enums
- do not create freeform scope logic
- do not hide deterministic choices behind purely decorative interaction

## Done Means

- Business Scope feels playful but premium
- canonical selections remain clear
- custom additions remain secondary and safe
