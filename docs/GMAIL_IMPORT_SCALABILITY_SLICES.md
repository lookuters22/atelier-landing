# Gmail Import Scalability Slices

## Why This Exists

The current Gmail import foundation is good enough for staged rollout and early real usage, but it is not yet designed for unbounded scale.

The main risk is not the choice of Supabase + Inngest itself. That stack is fine.

The risk is in specific implementation details:

- per-thread Gmail metadata fetches are too chatty
- approve-time materialization is too heavy for a user click
- render-ready email HTML is stored inline in Postgres metadata
- Inbox overfetches message rows and computes latest-message client-side
- label imports are still reviewed thread-by-thread instead of as a grouped migration unit

This document turns those into concrete slices we can implement in order.

## Design Goal

We want Gmail import to scale across:

- more photographers
- larger historical imports
- more concurrent sync jobs
- larger HTML emails and richer assets
- onboarding flows where a Gmail label represents one ongoing project

Without:

- slow approval clicks
- bloated Postgres rows
- fragile client-side inbox queries
- per-thread human review for grouped migrations

## Non-Goals

This plan does not redesign all of Inbox.

This plan does not replace Supabase or Inngest.

This plan does not broaden Gmail import into custom IMAP yet.

This plan does not skip staging-first safety.

## Current Bottlenecks

### 1. Sync Worker Chatiness

Current behavior:

- `syncGmailLabelImportCandidates` lists Gmail threads
- then calls `threads.get` metadata per thread
- those calls are effectively sequential

Why it will hurt:

- higher Gmail API latency per label sync
- higher rate-limit pressure
- long worker duration when labels contain many threads

Target outcome:

- fewer Gmail round-trips per sync
- bounded concurrency
- shorter and more predictable Inngest runs

### 2. Approve-Time Heavy Work

Current behavior:

- approving one staged import performs:
  - token validation / refresh
  - Gmail full thread fetch
  - body extraction
  - remote asset inlining
  - sanitization
  - canonical thread/message inserts

Why it will hurt:

- slow operator UX
- variable latency on every approve click
- approval throughput collapses under larger imports

Target outcome:

- operator click stays fast
- expensive work happens ahead of time or in background

### 3. Render Artifacts Stored In Message Metadata

Current behavior:

- imported Gmail HTML is stored in `messages.metadata.gmail_import.body_html_sanitized`

Why it will hurt:

- Postgres row bloat
- larger read payloads for Inbox
- harder caching and reprocessing
- imported emails become heavier as assets are baked in

Target outcome:

- DB stores references and compact metadata
- larger render artifacts move to blob/object storage or another dedicated artifact path

### 4. Inbox Reads Too Much

Current behavior:

- unfiled inbox query selects threads plus nested messages
- latest message is chosen in the client after fetch

Why it will hurt:

- unnecessary payload growth per thread
- slower inbox loading as history grows
- heavier React-side sorting and parsing

Target outcome:

- Inbox reads a latest-message projection only
- thread list stays lightweight

### 5. Thread-Centric Review Does Not Scale For Onboarding

Current behavior:

- one staged row per Gmail thread
- one approval per thread
- approved rows become separate unfiled threads

Why it will hurt:

- terrible onboarding for photographers who already grouped work by label
- destroys project continuity
- too many operator actions per migration

Target outcome:

- one Gmail label can become one grouped migration unit
- approve once to create one project container plus attached threads

## Slice Plan

### Slice G1. Gmail Sync Concurrency + Projection Slimming

Goal:

- make label sync faster and less rate-limit prone

Scope:

- update `syncGmailLabelImportCandidates`
- keep staging table semantics unchanged

Changes:

- add bounded concurrency for Gmail `threads.get` metadata fetches
- keep a hard max thread cap per run
- consider reducing full metadata calls when `threads.list` already provides enough fields
- record worker duration / API count metrics for proof

Done when:

- the worker no longer performs effectively one-by-one metadata fetches
- runs are measurably faster for medium-size labels

### Slice G2. Precompute Materialization Artifact Before Approval

Goal:

- remove expensive Gmail/body/asset work from the human approval click

Scope:

- staging pipeline only
- approval semantics remain staging-first

Changes:

- add a render-preparation step after staging or as a follow-up worker
- fetch full Gmail body earlier
- extract / sanitize / asset-process into a prepared artifact
- store preparation status separately from final approval status

Approve button after this slice should:

- validate readiness
- create canonical thread/message from precomputed artifact
- not perform Gmail fetch + asset baking inline

Done when:

- approval latency is mostly DB work, not Gmail/network work

### Slice G3. Move Render Artifacts Out Of Message Metadata

Goal:

- stop storing large render-ready HTML blobs directly in message metadata

Scope:

- additive migration only
- preserve backwards compatibility during transition

Changes:

- introduce a dedicated email render artifact store
- store:
  - artifact id
  - thread/message linkage
  - html/text variants
  - asset bake stats
  - preparation timestamps
- prefer object/blob storage for large HTML payloads
- keep compact metadata in Postgres only

Done when:

- Inbox reads a lightweight pointer/reference
- render artifact size no longer bloats message rows

### Slice G4. Inbox Latest-Message Projection

Goal:

- make inbox list queries lightweight and predictable

Scope:

- unfiled inbox first

Changes:

- add a server-side projection for latest message fields per thread
- stop loading all nested messages in `useUnfiledInbox`
- expose:
  - latest sender
  - latest snippet/body preview
  - latest sanitized HTML reference if needed
  - last activity timestamp

Done when:

- inbox thread list no longer fetches full message arrays
- latest-message choice is server-side, not client-side

### Slice G5. Grouped Label Migration

Goal:

- make Gmail labels usable as project migration units, not just thread buckets

Scope:

- staging + review + approval UX

Changes:

- introduce grouped review by label/import batch
- preserve per-thread provenance
- add grouped approval path:
  - create one inquiry/project container
  - attach imported threads under it
- keep per-thread drill-down optional, not primary

Done when:

- importing a label with 4 project emails does not require 4 unrelated approvals
- approved grouped import preserves project continuity

### Slice G6. Durable Asset Strategy For Imported Emails

Goal:

- eliminate repeated slow third-party asset loads across refreshes

Scope:

- imported email rendering only

Changes:

- stop relying on partially self-contained HTML as the only artifact strategy
- move toward:
  - persistent cached/proxied assets
  - or a fully prepared artifact bundle
- improve remote-asset detection beyond current regex blind spots
- add artifact-level “self-contained / partially remote” diagnostics

Done when:

- refreshing the same imported message does not re-trigger third-party asset waterfalls for newly processed emails

## Recommended Order

Implement in this order:

1. `G2` Precompute materialization artifact before approval
2. `G4` Inbox latest-message projection
3. `G6` Durable asset strategy for imported emails
4. `G1` Gmail sync concurrency + projection slimming
5. `G5` Grouped label migration
6. `G3` Move render artifacts out of message metadata

## Why This Order

`G2` is first because it removes the most user-visible latency from the approval action.

`G4` is next because inbox reads will otherwise get heavier as imports grow.

`G6` is next because rich-email rendering quality and repeated asset waterfalls are already hurting UX.

`G1` matters for import throughput, but current thread caps keep it tolerable in the short term.

`G5` is a product-scale multiplier for onboarding and should happen before broad rollout.

`G3` is the deeper storage hardening step once artifact shape stabilizes.

## Shipping Guardrails

Every slice must preserve:

- strict tenant isolation
- service-role-only token access
- staging-first review semantics
- no direct blind writes into canonical projects from raw Gmail sync
- idempotent re-runs where possible

## Definition Of Scalable Enough

We should consider Gmail import “scalable enough for broad rollout” only when:

- label sync duration remains bounded and predictable
- approval clicks are fast and not Gmail-network bound
- Inbox does not overfetch full thread histories
- imported email artifacts do not bloat Postgres rows
- grouped label onboarding exists for real project migration
- imported message rendering does not repeatedly waterfall-fetch third-party assets

## Immediate Next Slice

If we are prioritizing current user pain and future scale together, the next slice should be:

`G2. Precompute Materialization Artifact Before Approval`

That gives us:

- faster approvals
- cleaner separation between Gmail fetch work and Inbox UX
- a better place to attach durable asset preparation
- a path toward moving render artifacts out of row metadata later
