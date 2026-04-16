# ONBOARDING EXPERIENCE REDESIGN SLICE 02: IDENTITY MICROFLOW

## Goal

Turn Studio Identity from a static multi-field form into a guided step-by-step micro-conversation.

## Desired User Experience

The user should not see all identity fields at once.

Instead, the section should behave like:

1. prompt appears
2. user responds
3. response settles visually
4. next prompt arrives

Examples:

- "What is your studio called?"
- "Which currency do you usually quote in?"
- "What timezone should Ana work in?"
- "What should Ana call your manager?"

## Why This Matters

Identity is the easiest section.

If this step feels beautiful and guided, the user will trust the rest of onboarding.

If it feels like a form, the whole experience starts flat.

## Required UX Rules

### 1. One prompt at a time

Only one active identity question should be foregrounded at any moment.

Previous answers may remain visible as confirmed entries, but not as equally weighted form fields.

### 2. Soft response confirmation

When the user completes an answer:

- the field should settle with motion
- the answer should feel accepted
- the next question should enter intentionally

### 3. Keep deterministic storage

Even though the interaction is conversational, values still map to:

- `payload.settings_identity`

Do not introduce a second temporary schema for the animation layer.

### 4. Currency and timezone should feel curated

Use selects / curated options where appropriate.

Do not regress into arbitrary noisy text entry for structured values.

## Motion Notes

Use Framer Motion for:

- question enter/exit
- answer confirmation
- focus shift to next field

Optional:

- typewriter-style placeholder or label reveal

But do not fake user input.

If a typing effect is used, it should animate prompt copy, not invent values.

## Recommended Repo Focus

- identity step component
- shared onboarding stage for conversational step mode

## Do Not

- do not change the underlying storage contract
- do not add assistant chat bubbles
- do not make this look like a chatbot transcript

## Done Means

- identity feels guided and interactive
- users move through prompts with momentum
- values still save into the same payload contract
