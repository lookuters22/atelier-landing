# ONBOARDING EXPERIENCE REDESIGN MASTER PLAN

## 1. Purpose

This document defines the **experience-layer rebuild** of onboarding.

It does **not** replace the existing storage and persistence plan in:

- `docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md`
- `docs/v3/ONBOARDING_BRIEFING_SLICE_*.md`

Instead, it changes the **interaction model, shell, pacing, and motion language** so onboarding feels aligned with:

- the cinematic entrance of `Today`
- the focused, intentional behavior of `StudioSpotlight`
- the premium editorial tone of the product

In short:

- keep the data model
- rebuild the experience

## 2. What Is Wrong With The Current UI

The current onboarding is functional, but it feels like:

- a settings form inside a large card
- a static modal with tabs
- a clean admin surface, not a premium studio system

That creates three product problems:

1. The emotional pacing is wrong.
   Users are asked to fill forms instead of feeling guided through a studio setup ritual.

2. The interaction language is too flat.
   Selection, progress, confirmation, and completion all feel visually similar.

3. The shell does not inherit the dashboard's strongest traits.
   `Today` has atmosphere, motion, and posture.
   `StudioSpotlight` has focus and invitation.
   Onboarding currently borrows neither strongly enough.

## 3. Non-Negotiables

### 3.1 Storage architecture stays exactly split

Do not collapse onboarding back into one settings blob.

Canonical storage remains:

- `photographers.settings` = studio identity + metadata
- `studio_business_profiles` = what the studio offers
- `playbook_rules` = how Ana behaves
- optional `knowledge_base` = reusable standard language and policy wording

The editable draft snapshot in `photographers.settings` remains editor-only.

### 3.2 The new UX must still support draft save / resume

The redesign may become more guided and animated, but it must still:

- autosave the draft snapshot
- restore progress safely
- support later re-entry from Settings

### 3.3 The UI should feel interactive, not linear in the bad way

The experience should be sequenced, but not dead.

Meaning:

- identity should feel like a guided conversation
- business scope should feel like a live canvas
- policy sections should feel structured and responsive
- review should feel ceremonial and conclusive

### 3.4 Match the dashboard, not generic onboarding templates

The visual and motion system must inherit from existing product strengths:

- `DynamicBackground`
- `PageTransition`
- `ZenLobby`
- `StudioSpotlight`

Do not import random SaaS onboarding patterns that ignore the product's actual personality.

## 4. Experience Direction

## 4.1 Product metaphor

The right metaphor is:

**"Setting up your studio mind for Ana"**

Not:

- "Complete your profile"
- "Configure your account"
- "Fill out onboarding"

This means the experience should feel like:

- a guided briefing
- an elegant setup ritual
- a sequence of confident prompts

## 4.2 Emotional pacing

The onboarding should move through four moods:

1. **Arrival**
   A cinematic but restrained welcome that matches `Today`.

2. **Guided setup**
   One clear prompt at a time, especially in identity.

3. **Interactive definition**
   Visual selection systems for scope and policy.

4. **Handoff**
   A satisfying completion moment that transitions into the dashboard.

## 4.3 Core shell behavior

Do not keep the current "large card with tab row" as the final pattern.

The rebuilt onboarding should use:

- a full-route experience at `/onboarding`
- centered or stage-like main content
- step-aware transitions
- an anchored but non-clunky progress system

Recommended structure:

- **Arrival shell** for the first setup moments
- **Guided canvas shell** for interactive steps
- **Completion shell** for the final handoff

These can share one implementation foundation, but should not all look identical.

## 5. UX Model By Section

## 5.1 Studio Identity

This should become a guided conversational microflow.

Desired behavior:

- user clicks `Start onboarding`
- stage softens and the first question appears alone
- example:
  - "What is your studio called?"
- after entry:
  - subtle confirmation / type settle
  - next field advances in place

Recommended prompt order:

1. studio name
2. default currency
3. timezone
4. what Ana should call the manager / operator
5. photographer names
6. operator WhatsApp / admin mobile

Important:

- this should feel progressive and animated
- not like six fields shown at once

## 5.2 Business Scope

This is the most visual section.

Desired behavior:

- the user enters a scope canvas
- service types appear as **bubbles / pebbles**
- they float or rest with gentle motion
- tapping selects them with clear feedback
- selected items dock into the active state

Other scope controls:

- geography as tactile region cards
- travel policy as stronger stance cards
- deliverables as oversized chips / tokens
- custom additions remain secondary structured extensions

Important:

- keep deterministic data capture underneath
- but make the interaction expressive

## 5.3 Voice & Knowledge

Desired behavior:

- tone archetypes appear as elevated selection cards
- choosing one updates a deterministic preview with a soft crossfade
- banned phrases behave like living tags
- standard lines feel like guided snippets, not generic textareas

## 5.4 Authority

Desired behavior:

- grouped policy board
- strong scenario rows
- autonomy chips with satisfying selection feedback
- visible category rhythm

This should feel:

- executive
- precise
- not cluttered

## 5.5 The Vault

Desired behavior:

- a more serious visual mode
- denser cards
- fewer but more focused prompts per screen
- sensitive language capture, not duplicate decision controls

The Vault should read as:

- "when Ana is allowed to respond, what exact language should she use?"

## 5.6 Review & Completion

Desired behavior:

- a dossier-like summary
- clear sections
- visible studio identity
- scope
- voice
- authority
- vault language

Final action should not feel like a normal submit button.

It should feel like:

- `Initialize Ana`
- or `Complete studio setup`

After success:

- show a lightweight celebratory transition
- then land the user inside the dashboard with continuity

## 6. Motion System

Use **Framer Motion** as the primary motion layer.

Why:

- route and step transitions already lean React-first
- interactive state transitions are easier to keep consistent
- we do not need GSAP yet for the first rebuild

GSAP is optional later for:

- one cinematic arrival
- one background reveal
- one advanced bubble choreography pass

### Motion rules

- no constant movement everywhere
- one meaningful motion per interaction
- ease curves should be soft and decelerating
- transitions should feel premium, not playful-app bubbly

Core motion families:

- shell fade + rise
- card stagger
- chip selection press + settle
- preview crossfade
- bubble drift + dock
- completion bloom / dissolve

## 7. Dashboard Alignment Rules

The new onboarding must visually align with the product shell.

Borrow from `Today`:

- atmospheric background staging
- elegant type hierarchy
- a sense of occasion on entry

Borrow from `StudioSpotlight`:

- focused entry
- single-intent posture
- softened backdrop and centered attention

Do not copy `Today` literally.

Instead:

- start with a cinematic arrival tone
- quickly tighten into a guided workspace

This "cinematic to workspace" transition is the correct bridge.

## 8. Build Strategy

Implement the redesign in narrow slices.

Do not ask Cursor to "redesign onboarding" in one pass.

## 8.1 Slice order

1. `ONBOARDING_EXPERIENCE_REDESIGN_SLICE_01_ENTRY_AND_STAGE.md`
2. `ONBOARDING_EXPERIENCE_REDESIGN_SLICE_02_IDENTITY_MICROFLOW.md`
3. `ONBOARDING_EXPERIENCE_REDESIGN_SLICE_03_SCOPE_CANVAS.md`
4. `ONBOARDING_EXPERIENCE_REDESIGN_SLICE_04_POLICY_SURFACES.md`
5. `ONBOARDING_EXPERIENCE_REDESIGN_SLICE_05_REVIEW_AND_HANDOFF.md`

## 9. What This Redesign Must Not Break

- draft autosave
- `/onboarding` primary route
- settings re-entry
- the canonical split storage model
- existing payload helpers
- finalization plan

## 10. Definition Of Success

The redesign is successful when onboarding feels like:

- part of Atelier OS
- premium enough for a luxury studio
- structured enough for an enterprise workflow
- modern enough to feel alive
- guided enough that users enjoy completing it

Not when it simply looks "nicer."
