# App Scalability Slices

## Why This Document Exists

The app already has a strong architectural direction:

- Supabase for database, auth, and edge functions
- Inngest for durable async workflows
- tenant-aware data boundaries
- staged write patterns instead of unsafe direct mutation

That foundation is good.

What is not yet fully scalable is how some product flows are implemented on top of that foundation.

This document turns the biggest cross-app scalability risks into concrete implementation slices.

The goal is to avoid building ourselves into a corner where:

- user clicks become slow
- reads become heavier as data grows
- metadata blobs turn into storage junk drawers
- worker behavior becomes hard to observe
- the operator product becomes too manual to scale

## Scope

This plan covers app-wide scalability beyond the Gmail-specific roadmap.

It includes:

- read model scalability
- write path scalability
- async workflow scalability
- AI/orchestrator scalability
- operator/product scalability

It does not replace the Gmail-specific plan in:

- [GMAIL_IMPORT_SCALABILITY_SLICES.md](/C:/Users/Despot/Desktop/wedding/docs/GMAIL_IMPORT_SCALABILITY_SLICES.md)

That document should be treated as a focused sub-plan.

## Design Principles

Every scalability slice in this document should preserve:

- strict tenant isolation
- additive migrations only
- event-driven async work where appropriate
- deterministic/idempotent write paths
- clear separation between canonical records and derived/render artifacts
- operator-safe product behavior

## Scalability Categories

We need to scale in three different senses:

### 1. Infrastructure Scalability

Can the app survive more users, more jobs, more data, and more concurrent activity?

### 2. Codebase Scalability

Can we keep shipping changes without turning business logic into duplicated fragile spaghetti?

### 3. Product/Operational Scalability

Can real operators and photographers use the system efficiently when usage volume grows?

This plan addresses all three.

## Current App-Wide Weak Spots

### 1. Read Models Are Too Heavy In Some Surfaces

Examples:

- Inbox thread list still derives latest-message state from nested rows in the client
- some screens load broader row payloads than they need
- projections are inconsistent across product surfaces

Why it hurts:

- more data transferred than needed
- slower UI under larger accounts
- more client-side sorting and shaping work

### 2. Large Artifacts Are Being Stored Inline In Relational Rows

Examples:

- Gmail-render HTML in message metadata
- potentially other future render/export blobs following the same path

Why it hurts:

- row bloat
- slower reads
- larger replication/storage cost
- harder artifact lifecycle management

### 3. Heavy Work Still Happens Inside User Actions

Examples:

- approval flows that trigger network-heavy enrichment work inline
- actions that mix UI intent with expensive processing

Why it hurts:

- slower clicks
- worse UX under load
- more retries and inconsistent partial failure handling

### 4. Async Work Exists, But Observability And Backpressure Are Still Thin

Examples:

- some flows require log inspection to understand failures
- provider limits are handled ad hoc per function
- not all workflows expose crisp durable status

Why it hurts:

- failures are harder to diagnose
- concurrency spikes can create hidden operational pain
- support/debug cost rises with user count

### 5. AI Paths Can Become Expensive And Slow As Context Grows

Examples:

- orchestrator flows that assemble broad context
- repeated LLM calls when deterministic rules could short-circuit work
- growing memory/playbook/history surfaces

Why it hurts:

- cost grows faster than value
- latency becomes less predictable
- scaling the business becomes more expensive than needed

### 6. Domain Write Logic Is Distributed Across Too Many Call Sites

Examples:

- edge functions doing multi-step write logic directly
- repeated patterns for insert/update/finalize behavior
- mixed use of app-layer orchestration and DB atomicity

Why it hurts:

- behavior drifts over time
- bug fixes require touching multiple paths
- harder to guarantee consistency under scale

### 7. Operator Workflows Still Have Manual Throughput Limits

Examples:

- Gmail thread-by-thread approval
- context linking and review actions that do not batch well
- UI flows that assume low-volume operator review

Why it hurts:

- ops cost rises with each new account
- onboarding becomes slower than acquisition
- internal team becomes the bottleneck

## Slice Plan

## Slice A1. Unified Read Model And Projection Layer

### Goal

Reduce overfetching and make high-traffic screens read compact, purpose-built projections instead of raw relational shapes.

### Problems This Fixes

- client-side derivation of latest message/thread state
- repeated bespoke select shapes across screens
- slow growth in list-query payload size

### Scope

- Inbox
- Today
- Escalations list
- operator queues
- any other repeated “list of entities with latest state” screens

### Required Changes

- define projection shapes for high-traffic surfaces
- move “latest message” and “last activity” resolution server-side
- standardize lightweight list queries
- reduce nested relation reads for list screens
- add explicit read-model ownership per surface

### Likely Implementation Options

- SQL views
- RPCs returning compact row shapes
- denormalized summary columns maintained by writes/workers
- a mix of the above where appropriate

### Done When

- list screens do not fetch whole message arrays just to render the latest item
- common list surfaces use stable compact projections
- client code no longer sorts or derives latest-message state from full nested datasets

## Slice A2. Artifact Storage Boundary

### Goal

Move large render/export artifacts out of relational row metadata and into a dedicated artifact strategy.

### Problems This Fixes

- metadata row bloat
- heavy record reads
- poor lifecycle control for rich artifacts

### Scope

- imported email HTML
- future generated documents or rich previews
- any large stored blobs currently living in JSON metadata

### Required Changes

- define artifact classes:
  - render artifact
  - export artifact
  - attachment-derived artifact
- create storage strategy:
  - blob/object storage for large payloads
  - compact DB references and stats
- define artifact lifecycle:
  - created_at
  - prepared_at
  - invalidated_at
  - source linkage
- preserve backwards compatibility during transition

### Done When

- large HTML/blob payloads are not stored directly inside core app rows long-term
- DB rows store references, provenance, and compact metadata only
- renderers can resolve artifacts without bloating list queries

## Slice A3. Async-First Heavy User Actions

### Goal

Make user-facing actions fast by moving expensive work out of the click path.

### Problems This Fixes

- slow approve flows
- variable action latency
- inline network-heavy processing

### Scope

- Gmail approve/materialization
- any similar “click does a lot of fetch/process/write work” flows

### Required Changes

- identify expensive synchronous actions
- split them into:
  - user intent capture
  - durable queued work
  - explicit status update
- expose clear status:
  - queued
  - processing
  - ready
  - failed
- keep idempotent retries

### Product Requirement

Users should not have to guess whether a long-running action is broken or just working.

### Done When

- approvals and other heavy actions feel fast
- expensive enrichment/render preparation is done before or after the click, not inside it
- users see explicit durable status for async work

## Slice A4. Inngest Operational Hardening

### Goal

Make workers observable, rate-limit aware, and safer under concurrency.

### Problems This Fixes

- silent or hard-to-diagnose worker failures
- provider/API pressure under scale
- inconsistent job visibility

### Scope

- all production Inngest workers
- especially Gmail, outbound, and operator-related workflows

### Required Changes

- standardize worker outcome telemetry
- define per-provider concurrency/rate-limit strategy
- standardize retry categories:
  - retryable
  - terminal
  - partial success
- standardize status persistence back to DB rows when user-visible
- define replay and dead-letter/recovery procedures

### Operational Deliverables

- runbook for failed workers
- status field conventions
- metric/log schema for key worker outcomes

### Done When

- worker state is visible without digging through ad hoc logs
- bursts do not create hidden provider-limit failures
- support/debug workflow is documented and repeatable

## Slice A5. AI Cost And Latency Budgeting

### Goal

Keep AI/orchestrator flows economically and operationally scalable as data and usage grow.

### Problems This Fixes

- too many model calls per business action
- oversized context assembly
- unpredictable latency and cost growth

### Scope

- orchestrator flows
- operator learning loop
- draft generation/classification paths
- retrieval/context assembly

### Required Changes

- define budget rules for:
  - max model calls per action
  - max context size by flow
  - deterministic short-circuit opportunities
- add routing rules so simple/deterministic cases avoid expensive LLM work
- slim retrieval/context assembly
- separate “must be model-driven” from “can be deterministic”

### Done When

- common flows have predictable AI cost envelopes
- context assembly is bounded by design
- deterministic policy/rule paths avoid unnecessary model calls

## Slice A6. Domain Service Consolidation

### Goal

Reduce drift by centralizing important business write paths into explicit domain services or atomic DB boundaries.

### Problems This Fixes

- duplicated write logic across edge functions
- inconsistent multi-step updates
- harder-to-maintain business rules

### Scope

- canonical thread/message creation
- import approval/materialization
- escalation resolution
- playbook/memory/candidate promotions
- any other multi-table business action

### Required Changes

- inventory important write flows
- identify which should live in:
  - DB atomic RPCs
  - shared service-layer modules
- eliminate duplicated business logic in route handlers
- standardize return receipts and idempotent semantics

### Done When

- important domain writes have one clear owner
- route handlers become thinner
- consistency rules are enforced in one place

## Slice A7. Operator Throughput And Batch UX

### Goal

Make operator workflows scale with customer count without requiring linearly more manual review effort.

### Problems This Fixes

- one-by-one approvals
- repetitive manual review tasks
- onboarding flows that do not preserve grouped context

### Scope

- Gmail import review
- Today queue actions
- escalations triage
- linking / classification admin actions

### Required Changes

- introduce grouped review where the product domain naturally supports it
- add batch actions where safe
- preserve context continuity in migration/onboarding flows
- keep drill-down available without forcing drill-down for every item

### Product Requirement

Operator throughput must scale better than 1 operator action per imported thread/case/item.

### Done When

- grouped workflows are first-class
- batch-safe actions exist
- onboarding/migration preserves project continuity instead of exploding into unfiled fragments

## Slice A8. Data Refresh And Client State Consistency

### Goal

Make frontend data updates more predictable and less dependent on ad hoc polling and broad refetches.

### Problems This Fixes

- stale list/detail mismatches
- count vs list divergence
- unnecessary load from broad refetch patterns

### Scope

- Settings Gmail surfaces
- Inbox
- Today
- staging/review UIs

### Required Changes

- define per-surface query ownership
- reduce duplicate fetches for the same conceptual dataset
- use projection-driven refetch targets
- standardize optimistic vs durable refresh behavior
- make polling explicit and temporary where necessary, not a default long-term strategy

### Done When

- counts and lists stay aligned
- detail surfaces and summary surfaces agree
- frontend is not papering over backend shape problems with repeated broad refetching

## Recommended Order

Implement in this order:

1. `A3` Async-first heavy user actions
2. `A1` Unified read model and projection layer
3. `A4` Inngest operational hardening
4. `A7` Operator throughput and batch UX
5. `A2` Artifact storage boundary
6. `A8` Data refresh and client state consistency
7. `A6` Domain service consolidation
8. `A5` AI cost and latency budgeting

## Why This Order

### `A3` first

Because user-facing latency is the fastest way to make the app feel unscalable.

### `A1` second

Because heavy reads will quietly drag down most screens as real data grows.

### `A4` third

Because async-heavy systems only stay trustworthy if operations can see and manage them.

### `A7` fourth

Because product/ops scalability becomes a real bottleneck fast during onboarding and daily use.

### `A2` fifth

Because once artifact patterns stabilize, we should move them out of metadata before the bloat spreads.

### `A8`, `A6`, `A5`

These provide the next layer of resilience:

- more consistent frontend behavior
- cleaner business write ownership
- bounded AI cost and latency

## Relationship To Gmail Plan

The Gmail scalability roadmap should be treated as the first concrete subdomain where these patterns are exercised.

Mapping:

- Gmail `G1` aligns with app `A4`
- Gmail `G2` aligns with app `A3`
- Gmail `G3` aligns with app `A2`
- Gmail `G4` aligns with app `A1`
- Gmail `G5` aligns with app `A7`
- Gmail `G6` aligns with app `A2` and `A3`

## Definition Of “Scalable Enough”

We should consider the app broadly scalable enough for wider rollout only when:

- major user actions do not block on expensive inline work
- high-traffic screens read compact projections, not raw heavy shapes
- large artifacts are not bloating transactional rows
- worker health and failure states are visible and operationally manageable
- operator workflows support grouping and batching where the domain allows it
- frontend state stays aligned without broad polling as a crutch
- AI-heavy flows have explicit cost/latency budgets

## Immediate Recommendation

If the goal is “do not build something that becomes unscalable,” the next cross-app slice should be:

`A3. Async-First Heavy User Actions`

Why:

- it improves UX immediately
- it reduces pressure on request-time work
- it creates a cleaner contract for later artifact preparation
- it pairs directly with Gmail import pain you are already seeing

After that, do:

- `A1. Unified Read Model And Projection Layer`

Those two slices together will remove the biggest short-term scale risks without forcing a platform rewrite.
