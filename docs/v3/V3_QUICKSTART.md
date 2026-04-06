# ATELIER OS V3 QUICKSTART

## 1. Purpose

This is the first file a vibecoding agent should read.

Use this file to pick the phase and the smallest safe slice.

Do not start with the full V3 docs unless the slice truly needs them.

## 2. The Core Rule

For any task:

1. choose one phase
2. do one slice only
3. touch only the files needed for that slice
4. stop after that slice

If the request feels bigger than one slice, it is too big.

## 3. Which File To Read Next

- need the big picture: read `docs/v3/V3_OVERVIEW.md`
- need the phase map: read `docs/v3/V3_BUILD_INDEX.md`
- need exact implementation steps: read `docs/v3/execute_v3.md`
- need exact table or enum shape: read `docs/v3/DATABASE_SCHEMA.md`
- need architecture rules: read `docs/v3/ARCHITECTURE.md`
- need prompting examples: read `docs/v3/V3_PROMPTING_GUIDE.md`
- need copy-paste prompts for a specific phase: read `docs/v3/prompts/README.md`
- need copy-paste prompts for each exact step: read `docs/v3/step-prompts/README.md`

## 4. Phase Picker

### Phase 0

Use for:

- truth sync
- stale assumptions
- codegen alignment

Smallest safe slices:

- one stale type fix
- one settings drift fix
- one migration truth audit

### Phase 1

Use for:

- photographer settings
- operator identity
- `admin_mobile_number`

Smallest safe slices:

- one settings helper
- one settings UI field
- one WhatsApp identity helper

### Phase 2

Use for:

- new tables
- new columns
- new constraints

Smallest safe slices:

- one migration for one table
- one migration for one existing-table column group
- one enum addition

### Phase 3

Use for:

- dedupe
- normalization
- identity resolution

Smallest safe slices:

- one normalization helper
- one people/contact resolver
- one thread match helper

### Phase 4

Use for:

- onboarding
- business profile
- playbook seeding

Smallest safe slices:

- one onboarding payload shape
- one business-profile persistence helper
- one playbook write helper

### Phase 5

Use for:

- decision context
- memory retrieval
- audience facts

Smallest safe slices:

- one shared context type
- one context builder helper
- one retrieval helper

### Phase 6

Use for:

- tools
- verifier input and output
- structured tool contracts

Smallest safe slices:

- one tool schema
- one tool implementation
- one verifier rule

### Phase 6.5

Use for:

- role boundaries
- context contracts
- tool permissions by role

Smallest safe slices:

- one role contract
- one prompt/input boundary
- one role wiring change

### Phase 7

Use for:

- main orchestrator
- action-based routing
- cutover-safe orchestration

Smallest safe slices:

- one event contract
- one orchestrator skeleton
- one legacy worker adapter

### Phase 8

Use for:

- operator WhatsApp lane
- escalation delivery
- manual context injection

Smallest safe slices:

- one WhatsApp ingress change
- one operator event shape
- one escalation batching rule

### Phase 9

Use for:

- learning loop
- memory vs playbook writeback

Smallest safe slices:

- one resolution classifier
- one playbook promotion helper
- one memory writeback helper

### Phase 10

Use for:

- sleepers
- pauses
- awaiting reply

Smallest safe slices:

- one sleeper pause patch
- one task deferral rule
- one awaiting-reply resolver

### Phase 11

Use for:

- onboarding UI
- approvals UI
- escalation queue UI

Smallest safe slices:

- one form section
- one dashboard panel
- one queue view

### Phase 11.5

Use for:

- observability
- metrics
- structured logging

Smallest safe slices:

- one metric
- one log event
- one dashboard stat

### Phase 12

Use for:

- backfill
- replay tests
- stress tests

Smallest safe slices:

- one backfill script
- one replay scenario
- one regression test

## 5. Golden Prompt

```text
Implement only one slice.

Read first:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for the chosen phase
- only the exact sections needed for that slice

Touch only:
- [file 1]
- [file 2]

Do not change:
- unrelated workers
- unrelated UI
- legacy paths outside this slice

Done means:
- [result 1]
- [result 2]

Stop after this slice and tell me the next smallest safe slice.
```

## 6. Never Do This

- do not implement a whole phase at once
- do not read all V3 docs in full for a tiny change
- do not invent missing contracts from memory
- do not add new agents when a tool or helper is enough
- do not touch unrelated files "while here"
