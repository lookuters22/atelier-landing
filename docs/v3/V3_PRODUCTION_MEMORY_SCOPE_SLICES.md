# V3 Production Memory Scope Slices

This document turns [V3_PRODUCTION_MEMORY_SCOPE_PLAN.md](/C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_MEMORY_SCOPE_PLAN.md) into execution-safe slices.

## Scope guardrails

- Do not reopen scoring, hygiene workers, clustering, TTL, or memory embeddings in these slices.
- Do not change the writer firewall.
- Do not rewrite `buildDecisionContext` into a mode mega-function.
- Keep every slice additive and reversible.
- Keep reply-mode safety ahead of assistant-mode capability.

## Slice 1 - Schema foundation only

### Goal

Make memory scope explicit in the database without changing runtime behavior yet.

### Implement

- Add `scope` to `memories` with enum values:
  - `project`
  - `person`
  - `studio`
- Add `person_id` to `memories` as nullable FK to `people(id)`
- Add `archived_at` to `memories`
- Backfill:
  - `wedding_id IS NOT NULL -> scope='project'`
  - `wedding_id IS NULL -> scope='studio'`
- Add partial indexes for:
  - project
  - person
  - studio
- Regenerate `src/types/database.types.ts`

### Do not implement yet

- no CHECK constraint yet
- no reader changes
- no writer changes
- no assistant builder

### Acceptance criteria

- migration is additive
- existing code keeps working unchanged
- types compile with the new fields present

## Slice 2 - Reply-mode selector hardening

### Goal

Make cross-project leakage unrepresentable in reply mode.

### Implement

- update `fetchMemoryHeaders.ts` to become scope-aware
- update `selectRelevantMemoriesForDecisionContext.ts` so:
  - `scope='project'` memories from another project are excluded, not merely down-ranked
  - studio rows are capped inside the reply-mode selection
- optionally add a quiet header cap

### Do not implement yet

- no person-scope retrieval yet
- no assistant builder
- no writer changes

### Acceptance criteria

- reply-mode cross-project memory leak is blocked by selector logic
- regression tests prove it

## Slice 3 - Writer alignment + constraint close

### Goal

Start writing explicit scope on new memory rows, then close the schema contract.

### Implement

- update `captureDraftLearningInput.ts`
- update learning-loop memory writeback path(s)
- set `scope` explicitly on insert
- add `person_id` only when deterministically available and correct
- after writer migration, add the `CHECK` constraint

### Acceptance criteria

- new memory writes always set valid scope
- invalid state is rejected by the DB after constraint lands

## Slice 4 - Person-scope retrieval for reply mode

### Goal

Let reply mode use durable person memory safely.

### Implement

- pass participant `person_id`s from `buildDecisionContext` into memory selection
- allow `scope='person'` rows only when the person is in the thread context

### Acceptance criteria

- repeat-client / planner / venue continuity can follow the person across projects
- person memory does not surface when the person is not in scope

## Slice 5 - Assistant builder

### Goal

Create a studio-level assistant retrieval mode without weakening reply-mode safety.

### Implement

- add `buildAssistantContext.ts`
- create `AssistantContext`
- default assistant retrieval to studio scope + policy + CRM digest
- allow explicit project/person expansion
- log scope expansions and selected memory IDs
- mark the context as client-facing forbidden

### Acceptance criteria

- assistant mode exists as a separate retrieval surface
- it does not reuse reply-mode assumptions
- it cannot be accidentally fed into a client-facing writer path

## Deferred after Slice 5

- memory scoring
- access logging
- hygiene worker
- clustering / consolidation
- memory embeddings on `memories`
- TTL / auto-prune
- supersession / lineage

These stay deferred until real product/volume signals justify them.
