# ATELIER OS V3.1 EXECUTION PLAN

## 1. Purpose

This is the implementation roadmap for the next architecture described in:

- `docs/v3/ARCHITECTURE.md`
- `docs/v3/DATABASE_SCHEMA.md`

It is written for AI coding inside this repo.

This plan must preserve what already works, document current drift honestly, and move the system toward:

- a policy-driven operator
- photographer-specific permissions
- non-linear action selection
- explicit uncertainty detection
- WhatsApp escalation to the photographer
- reusable learning only when confirmed

This plan also assumes one non-negotiable trust requirement:

- one photographer must never receive, query, draft, send, or view another photographer's data

## 2. Prime Directive

### 2.1 Build Additively

Do not rip out the existing pipeline in one shot.

The current repo is a hybrid:

- real Supabase schema
- real Inngest workers
- real approval loop
- mixed frontend wiring
- mixed WhatsApp experiments

We must use a strangler pattern.

### 2.2 Migrations Are The Source Of Truth

For schema work:

- write a migration
- apply it
- regenerate `src/types/database.types.ts`
- update docs if the contract changed

Do not let code, docs, and migrations drift apart.

### 2.3 Small, Verifiable Steps Only

No giant prompts like "build the whole AI system".

Work in thin slices:

- one migration
- one helper
- one tool
- one event contract
- one worker refactor

### 2.4 Preserve Compatibility Until Cutover

Until the new path is proven:

- keep the current approval loop
- keep existing web/email ingress working
- keep compatibility tables such as `clients`
- keep `threads.wedding_id`
- keep the current settings key `whatsapp_number` while adding `admin_mobile_number`

### 2.5 Do Not Invent Missing Architecture

If a table, enum, agent role, tool, event, or API surface is not named in:

- `docs/v3/DATABASE_SCHEMA.md`
- `docs/v3/ARCHITECTURE.md`
- this plan

do not invent it casually in code.

Instead:

- reuse an existing contract
- add it to the docs first
- or stop and tighten the contract before coding further

In particular, do not invent:

- photographer-specific field names
- new freeform policy blobs when a canonical table already exists
- extra specialist agents for every business topic
- extra background workers when a tool or helper would do
- duplicate tables that overlap with `playbook_rules`, `memories`, `documents`, or `studio_business_profiles`

### 2.6 Phase Output Contract

Each phase should end with a narrow, verifiable result.

Default expectation for a completed phase:

- schema changes are in migrations only
- generated database types are regenerated if schema changed
- shared helpers are created before worker-by-worker duplication
- new behavior is covered by at least focused tests or replay checks
- docs are updated if the contract changed

Do not mix unrelated refactors into the same phase just because the files are nearby.

### 2.7 Prefer Concrete Contracts Over Cleverness

When a phase says "add support" or "introduce" something, the coding agent should implement:

- explicit file(s)
- explicit schema fields
- explicit event payloads
- explicit input and output types

Do not leave critical runtime behavior implied only by prompts or comments.

### 2.8 Tenant Isolation Is Pre-Production Critical

Do not treat tenant isolation as a cleanup item after V3 is "working."

For this system, tenant isolation is a foundation requirement.

That means the new path should not be considered production-ready until:

- tenant ownership is proven on all critical reads and writes
- service-role queries follow the documented `photographer_id` or parent-chain proof rules
- approval and outbound paths are tenant-safe
- context building is tenant-safe
- ingress paths do not trust spoofable tenant identity from unverified client payloads

If a slice improves features but weakens or bypasses tenant safety, the slice is not done.

## 3. Current Repo State To Respect

Before coding, remember:

- The frontend is a four-pane React dashboard with real and prototype surfaces mixed together.
- The backend is Supabase Edge Functions + Inngest.
- Current client ingress exists for web and email.
- Current operator/client WhatsApp behavior is experimental and must be rewritten.
- The current linear workers still power important flows.
- The actual schema is smaller than older docs claimed.

Current implemented database tables:

- `photographers`
- `weddings`
- `clients`
- `threads`
- `messages`
- `drafts`
- `tasks`
- `knowledge_base`
- `memories`
- `thread_summaries`
- `calendar_events`
- `wedding_milestones`

## 4. What We Are Actually Building

The target system is not "Ana knows everything".

The target system is:

- Ana knows baseline studio rules from onboarding
- Ana checks permissions before acting
- Ana detects when policy or evidence is missing
- Ana asks the photographer on WhatsApp when needed
- Ana stores the result as one-off memory or reusable playbook

In other words:

- onboarding gives the base
- runtime verification enforces boundaries
- escalation handles uncertainty
- learning only happens with explicit confirmation

## 5. Phase Roadmap

## [ ] Phase 0: Truth Sync And Safety Baseline

**Goal:** Align docs, schema truth, and codegen before feature work.

### Step 0A (complete)

Treat the rewritten docs in `docs/v3/` as the active source for the next build.

**Repo alignment:** `docs/v3/README.md` states the canonical root; root `.cursorrules` and `docs/v3/.cursorrules` declare the same for agents.

### Step 0B

Regenerate `src/types/database.types.ts` from the actual database after every schema phase.

### Step 0C

Audit code for assumptions that no longer match reality:

- docs that mention missing tables
- code paths that assume stale enum values
- settings helpers that only know `whatsapp_number`
- code paths that trust tenant identity too loosely

### Step 0D (complete)

Do not remove current workers yet.

**Preservation rule:** All Inngest workers stay registered in `supabase/functions/inngest/index.ts` until a **later cutover phase** explicitly authorizes removal or replacement. Phase 0 and narrow slices must not delete worker modules, drop imports, or remove `functions` array entries—including legacy WhatsApp helpers (`internalConcierge`, `whatsappOrchestrator` v2) and all `ai/intent.*` handlers. New behavior stays additive (strangler) alongside existing registration.

### Step 0E (complete)

Audit current ingress, approval, outbound, and service-role paths specifically for tenant isolation.

At minimum, review:

- `webhook-web`
- `webhook-approval`
- `api-resolve-draft`
- outbound send path
- any service-role worker that queries across weddings, threads, drafts, tasks, or memories

Document or fix the most dangerous cross-tenant trust gaps before expanding the new path.

**Slice completed:** `webhook-approval` previously emitted `approval/draft.approved` using only JWT `photographer_id` and body `draft_id`, without verifying the draft’s thread belongs to that tenant. Added the same `drafts` → `threads!inner(photographer_id)` ownership check used in `api-resolve-draft` before emitting the event.

## [ ] Phase 1: Photographer Settings And Operator Identity

**Goal:** Establish the operator WhatsApp contract and onboarding anchor without breaking current settings.

### Step 1A (complete)

Add and standardize the photographer settings contract in helpers, not only in ad hoc component code.

Target keys:

- `studio_name`
- `manager_name`
- `photographer_names`
- `timezone`
- `currency`
- `whatsapp_number` (legacy compatibility)
- `admin_mobile_number` (canonical operator identity)
- `onboarding_completed_at`
- `playbook_version`

**Implemented:** `PhotographerSettings` + `PHOTOGRAPHER_SETTINGS_KEYS` in `src/types/photographerSettings.types.ts`; `parsePhotographerSettings`, `mergePhotographerSettings`, `isPhotographerSettingsKey` in `src/lib/photographerSettings.ts`; Edge re-export `supabase/functions/_shared/photographerSettings.ts`.

### Step 1B (complete)

Create a shared settings reader/writer helper, for example:

- `supabase/functions/_shared/settings.ts`
- `src/lib/photographerSettings.ts`

**Implemented:** `readPhotographerSettings` / `writePhotographerSettingsMerged` (any `SupabaseClient`) in `src/lib/photographerSettings.ts`; `readPhotographerSettingsAdmin` / `patchPhotographerSettingsAdmin` (service role) in `supabase/functions/_shared/settings.ts`.

### Step 1C (complete)

Update `src/pages/settings/SettingsHubPage.tsx` to support the target settings contract while preserving the current saved value.

**Implemented:** General section loads/saves contract keys via `readPhotographerSettings` / `writePhotographerSettingsMerged`; WhatsApp line uses the same merge writer so other `settings` keys are preserved. `onboarding_completed_at` shown read-only.

### Step 1D (complete)

Do not change client routing yet. Only prepare identity and settings.

**Boundary (enforced for Phase 1):**

- **Client routing:** No changes to React Router routes, nav shells, or URL structure for email/web/manager flows.
- **WhatsApp / ingress:** No change to `webhook-whatsapp`, `triage.ts` branching, or Inngest event routing toward operator vs client lanes — cutover belongs to later phases.
- **Done in Phase 1:** `photographers.settings` contract (helpers + `SettingsHubPage`); operator/admin identity keys stored only; runtime behavior unchanged until explicitly migrated.

## [ ] Phase 2: Schema Foundation For Policy-Driven Runtime

**Goal:** Add the tables and columns the new architecture actually needs.

### Step 2A

Create additive migrations for the missing target tables:

- `people`
- `contact_points`
- `wedding_people`
- `thread_weddings`
- `thread_participants`
- `message_attachments`
- `playbook_rules`
- `escalation_requests`
- `documents`

### Step 2B

Add target columns to existing tables:

- `weddings.compassion_pause`
- `weddings.strategic_pause`
- `weddings.agency_cc_lock`
- `threads.channel`
- `threads.external_thread_key`
- `threads.status`
- `threads.automation_mode`
- `threads.last_inbound_at`
- `threads.last_outbound_at`
- `threads.needs_human`
- `messages.provider_message_id`
- `messages.idempotency_key`
- `messages.raw_payload`
- `messages.metadata`
- `drafts.photographer_id`
- `drafts.decision_mode`
- `drafts.source_action_key`
- `drafts.locked_for_sending_at`

### Step 2C

Add the unique constraints described in `DATABASE_SCHEMA.md`.

Especially:

- normalized contact points
- provider thread ids
- provider message ids
- message attachment urls

### Step 2E

Add tenant-safety schema support early, not at the end.

For schema slices that feed AI workers, prefer:

- direct `photographer_id`
- unique constraints scoped by `photographer_id`
- ownership-proof-friendly foreign keys

Do not postpone these because they are part of the safety model, not optional cleanup.

### Step 2D

Regenerate database types immediately after this phase.

## [ ] Phase 3: Deterministic Identity And Dedupe Layer

**Goal:** Make "do not create multiple entries for one real thing" a system property.

### Step 3A

Create shared normalization helpers:

- email normalization
- phone normalization
- WhatsApp normalization
- canonical name normalization

Suggested path:

- `supabase/functions/_shared/utils/normalizeEmail.ts`
- `supabase/functions/_shared/utils/normalizePhone.ts`
- `supabase/functions/_shared/utils/normalizeName.ts`

### Step 3B

Create deterministic identity helpers for:

- people
- contact points
- threads
- thread-to-wedding candidate matches

### Step 3C

Do not let workers insert weddings, people, or threads directly if a reusable resolver helper should own that behavior.

### Step 3D

When a thread may map to more than one wedding, write candidate rows into `thread_weddings` instead of forcing a bad merge.

### Step 3E

Do not trust client-supplied tenant identity when a safer resolution path exists.

Ingress and resolver code should derive tenant identity from:

- verified JWT
- trusted operator identity
- deterministic owned parent records

If a request body can spoof `photographer_id`, treat that as a trust gap to remove during the migration.

## [ ] Phase 4: Onboarding And Playbook Seeding

**Goal:** Give Ana enough baseline knowledge to avoid pinging the photographer for trivial things.

### Step 4A

Design the onboarding payload and store it as:

- photographer settings
- `studio_business_profiles`
- `playbook_rules`
- optional `knowledge_base` seed entries

### Step 4B

Minimum onboarding capture:

- studio identity
- service types and service availability
- geographic scope and travel policy
- booking scope and client types
- deliverable types and language support
- team structure and lead acceptance rules
- approval philosophy
- scheduling authority
- discount authority
- invoice/payment rules
- banking exception rules
- planner and agency rules
- audience privacy rules
- publication rules
- RAW-file rules
- artistic revision rules
- visual review rules
- PR and vendor credit rules
- proactive follow-up rules
- escalation preferences

### Step 4C

Split onboarding output into the correct storage layers.

- `photographers.settings` for identity and setup metadata
- `studio_business_profiles` for what the studio offers
- `playbook_rules` for how Ana behaves
- optional `knowledge_base` seed entries for reusable standard knowledge

These playbook rules are for tenant-global or channel-wide behavior only.

Do not store wedding-specific, person-specific, or thread-specific exceptions in `playbook_rules`.

The onboarding flow should map answers into stable preference categories and action families instead of inventing photographer-specific field names.

The onboarding flow should also map studio-scope answers into stable business-profile categories instead of storing freeform blobs that the runtime cannot reason about.

### Step 4D

Support restricted action classes from day one.

Examples:

- `discount_quote = ask_first`
- `release_raw_files = ask_first`
- `publication_permission = ask_first`
- `schedule_call = auto`

### Step 4D.1

Build an explicit action-permission matrix during onboarding.

For every important canonical `action_key`, onboarding should make it possible to resolve:

- what Ana may do alone
- what Ana may draft only
- what Ana must ask first
- what Ana must never do

Do not treat this as implied prose only.

Store it in a way the runtime can query through `playbook_rules.decision_mode`.

### Step 4E

Support deterministic business-scope decisions from day one.

Examples:

- decline video inquiries if video is not offered
- decline destination inquiries outside the allowed travel scope
- route in-scope weddings differently from out-of-scope family sessions
- stop Ana from proposing albums or raws if those deliverables are not part of the studio profile

### Step 4F

Do not store onboarding as one giant freeform questionnaire blob and call the phase done.

The implementation is only complete when onboarding answers are mapped into:

- `photographers.settings`
- `studio_business_profiles`
- `playbook_rules`

in structured form the runtime can actually query.

## [ ] Phase 5: Decision Context Builder

**Goal:** Replace thin context assembly with the full policy-aware context required by the new runtime.

### Step 5A

Replace or extend `buildAgentContext()` with a new decision context builder, for example:

- `supabase/functions/_shared/context/buildDecisionContext.ts`

### Step 5B

The context builder must gather:

- tenant identity
- studio business profile
- channel
- thread
- recent messages
- thread summary
- primary wedding
- candidate weddings
- participants and audience
- relationship modes and authority roles
- selected wedding memory
- relevant playbook rules
- relevant global knowledge
- documents and attachments if needed
- open escalation state
- offline or operator-injected context when relevant

Audience must be resolved deterministically before AI reasoning.

Do not ask the model to infer visible participants from unstructured thread text alone.

Inject backend-resolved audience facts such as:

- visible `thread_participants`
- audience labels
- `agency_cc_lock`
- channel visibility notes
- recipient counts
- `broadcast_risk`

The builder must not stop at thin context only.

It should explicitly populate:

- `memoryHeaders` for scan
- `selectedMemories` for full durable records actually used in reasoning
- `globalKnowledge` for curated tenant-wide guidance actually used in reasoning

Do not leave `selectedMemories` and `globalKnowledge` as permanent empty arrays in the new path.

### Step 5C

Keep the header-scan pattern for long memory.

Load:

- memory headers first
- full content only for selected records

This should be a retrieval pipeline, not a single fetch.

Suggested order:

1. recent session state and thread summary
2. memory header scan
3. playbook and knowledge candidate selection
4. fetch full selected memories
5. fetch full selected knowledge or documents only when needed

This keeps context small without collapsing the deeper memory layers.

### Step 5D

Do not let orchestrators make raw service-role queries everywhere if the context builder should own the data contract.

### Step 5E

Add verification tests for the context builder.

At minimum, test that:

- the builder can return header-only context when that is enough
- the builder promotes specific memories into `selectedMemories` when the action needs them
- the builder retrieves tenant-wide guidance into `globalKnowledge` when the action needs it
- the builder does not over-fetch unrelated long memory
- the builder injects backend-resolved audience facts before model reasoning
- the builder computes broadcast or reply-all risk as a message-level safety fact
- the builder resolves who is payer, planner, logistics contact, and approval contact when known
- the builder can merge operator-injected context with thread context without pretending it came from email

### Step 5F

Make the decision-context contract explicit in code.

The context builder should return one typed object owned by one helper.

Do not let each worker assemble its own ad hoc subset of:

- playbook rules
- memories
- audience facts
- documents
- authority roles

If a worker needs decision context, it should call the shared builder instead of re-querying the world differently.

### Step 5G

The decision context builder must be tenant-safe by construction.

It should accept resolved tenant identity as a required input and must not return mixed-tenant data.

Do not let workers call a context builder that can silently over-fetch across photographers.

## [ ] Phase 6: Strict Tool Layer

**Goal:** Give the orchestrator safe limbs instead of broad freeform behavior.

### Step 6A

Keep and improve strict Zod schemas in:

- `supabase/functions/_shared/tools/schemas.ts`

### Step 6B

Add target tools:

- `toolCalculator`
- `toolOperator`
- `toolVerifier`
- `toolEscalate`
- `toolArchivist`
- `toolDocuments`
- `toolAudienceCheck`

### Step 6C

Rules for tools:

- tools return structured data only
- tools do not write client-facing prose
- tools do not silently ignore conflicts
- all write-capable tools must respect `decision_mode`
- risky tools must require structured decision justification in their Zod input, not freeform hidden reasoning

For actions like escalation, approval-first decisions, blocked sends, or sensitive execution, the schema should require a compact object such as:

- `why_blocked` or `why_allowed`
- `missing_capability_or_fact`
- `risk_class`
- `evidence_refs`
- `recommended_next_step`

This forces the model to state the exact operational reason for the action before the tool is called.

### Step 6D

`toolVerifier` is mandatory before execution.

It must check:

- evidence sufficiency
- audience safety
- broadcast or reply-all risk
- playbook rules
- pause flags
- `agency_cc_lock`
- whether the action is `auto`, `draft_only`, `ask_first`, or `forbidden`
- whether the request is a blocked visual-review case
- whether the request is a banking exception or payment-reconciliation case

For high `broadcast_risk`, `toolVerifier` must block `auto` reply behavior for that message.

This is a message-level gate, not a reason to mutate thread-level manual overrides automatically.

`toolEscalate` must not accept a bare question string alone.

It must require:

- the requested action key
- the structured decision justification
- the proposed photographer question
- the suggested default resolution if one exists

This is for auditability, verifier quality, and later learning.

### Step 6D.1

Require every blocked or approval-seeking action to produce an escalation-ready shape.

The runtime should be able to say, in structured form:

- what was asked
- what Ana wanted to do
- what `decision_mode` blocked the action
- what exact question should go to the photographer
- what the default recommendation is, if any
- where the answer is expected to be stored afterward

### Step 6E

Do not create overlapping tools with blurry ownership.

Before adding any new tool, define:

- what it reads
- what it writes
- whether it is pure read-only or write-capable
- whether verifier approval is required before it can run
- which agent roles may call it

If two proposed tools mostly do the same thing, merge them instead of adding both.

## [ ] Phase 6.5: Agent Role Split

**Goal:** Make the multi-agent model explicit so context, permissions, and responsibilities do not blur together.

### Step 6.5A

Define the target role set:

- main orchestrator
- verifier
- operator escalation agent
- writer or persona agent
- archivist or learning path

### Step 6.5B

For each role, define:

- inputs it is allowed to receive
- memory layers it is allowed to receive
- tools it may call
- actions it may propose
- actions it may execute directly, if any

### Step 6.5C

Do not give the writer the full operational context by default.

The writer should receive:

- approved factual output
- narrow personalization context
- limited continuity memory

### Step 6.5D

Keep the orchestrator and verifier as the heavy-context roles.

They are the main consumers of:

- `selectedMemories`
- `globalKnowledge`
- playbook rules
- audience state
- escalation state

### Step 6.5E

If a future specialist is added, define its context contract before wiring it into production.

Do not create new subagents that receive broad unrestricted context by default.

### Step 6.5F

Sensitive-data flows must stay narrow.

Do not give normal writer or orchestrator prompts unrestricted access to passport data, dates of birth, government identifiers, or similar high-risk PII.

Restricted asset sends should be handled through document metadata plus verifier-gated approval flows.

### Step 6.5G

Role and authority checks must be first-class.

The orchestrator and verifier should be able to distinguish:

- visible sender
- planner
- payer
- billing contact
- logistics contact

### Step 6.5H

Make the implementation split explicit:

- agents are reasoning roles
- tools are bounded capabilities
- workers are operational runtime units

For V3, keep the role count low and push specialization into tools first.

Default expectation:

- orchestrator, verifier, and writer are the main AI roles
- escalation and archivist may stay lightweight modes rather than full peer agents
- calendar, documents, billing math, audience checks, and CRM mutation should be tools or deterministic helpers, not separate autonomous agents
- outbound, approvals, webhooks, and sleepers should remain workers because they own retries, delivery, and background execution
- approval contact

Do not assume the visible sender is the authority for money, scheduling, or approvals.

## [ ] Phase 7: Replace Hardcoded Intent Routing With Action-Based Orchestration

**Goal:** Move from fixed specialist categories to non-linear action proposals.

### Step 7A

Event Versioning Contract:

- do not delete current `ai/intent.*` workers yet
- old events and new V3 events must coexist during transition
- use strictly versioned payloads and event names where contracts diverge
- do not let legacy webhooks crash new workers or let new payloads break old paths

First, convert current workers into callable tools or adapters where possible.

### Step 7B

Introduce a new main client orchestrator for email/web that:

- builds decision context
- proposes candidate actions
- uses strict tools
- verifies before act
- chooses between auto, draft, ask, or block

### Step 7C

Keep the approval loop in place for client-facing outbound until the new path is proven.

Approval and outbound paths in this phase must be idempotent.

At minimum:

- duplicate approvals must not send twice
- worker retries must not send twice
- duplicate provider callbacks must not create duplicate outbound messages

Approval resolution must also reject stale drafts before locking for send.

Minimum stale-draft rule:

- if `threads.last_inbound_at > drafts.created_at`, reject approval
- invalidate the old draft
- show the operator a clear warning that new client context arrived and Ana is re-evaluating

### Step 7D

Current files likely touched:

- `supabase/functions/_shared/inngest.ts`
- `supabase/functions/inngest/index.ts`
- `supabase/functions/inngest/functions/triage.ts`
- new orchestrator module under `supabase/functions/inngest/functions/`

### Step 7E

Do not cut over to the new orchestration path just because the happy path works once.

Legacy routing should remain in place until:

- replay tests pass
- approval and outbound idempotency passes
- stale-draft invalidation passes
- high-risk verifier blocks pass
- operator escalation flow passes

## [ ] Phase 8: Operator WhatsApp Lane

**Goal:** Make WhatsApp the dedicated photographer <-> Ana control channel.

### Step 8A

Rewrite the WhatsApp contract.

Target behavior:

- inbound WhatsApp messages from the photographer go to the operator orchestrator
- outbound WhatsApp messages from Ana are clarifications, escalations, and high-signal notifications
- client WhatsApp is out of scope for this channel

### Step 8B

Refactor `webhook-whatsapp/index.ts` to:

- normalize the incoming sender
- compare it to `admin_mobile_number`
- reject or ignore non-operator senders for this lane
- persist raw payload and attachments
- emit an operator event instead of a client-support event

### Step 8C

Replace the old internal concierge model with an operator orchestrator that can:

- accept commands
- answer from verified data
- ask the photographer short blocked-action questions
- capture the answer into `escalation_requests`

It should also support manual context injection such as:

- "I already got the timeline on WhatsApp"
- "I met them in London yesterday"
- "gift them two albums"
- "delay this delivery by two days"

### Step 8D

Do not mix operator WhatsApp with client WhatsApp routing in the same event names.

### Step 8E

Add operator escalation triage.

Urgent escalation classes should push immediately to WhatsApp.

Non-urgent escalation classes should be batchable into a digest or held in the dashboard queue without buzzing the photographer each time.

At minimum, the delivery policy should distinguish:

- urgent now
- batch later
- dashboard only

### Step 8F

Make escalation phrasing consistent.

Every escalation sent to the photographer should be:

- short
- specific
- operational
- framed around one decision at a time

Do not send vague open-ended prompts when a bounded approval question can be asked instead.

Do not hardcode every escalation type into its own worker.

This is a delivery-policy layer on top of one operator lane, not a reason to create an escalation swarm.

## [ ] Phase 9: Learning Loop

**Goal:** Let Ana improve over time without over-generalizing.

### Step 9A

Whenever the photographer answers an escalation, ask the system to classify the outcome as:

- one-off case decision
- reusable global or channel-wide playbook rule

### Step 9B

If reusable:

- create or update `playbook_rules`

If one-off:

- store case memory and keep the decision linked to the escalation record

### Step 9B.1

When the photographer answers, store the answer through a strict resolution rule:

- reusable answer -> `playbook_rules`
- case-specific approved exception -> `memories`
- sensitive asset or compliance handling -> `documents` plus audit link if needed
- still unresolved -> keep `escalation_requests` open or create the next explicit follow-up state

Do not leave an approved answer living only in raw thread text or WhatsApp text.

### Step 9C

Capture approval edits and rewrite feedback as learning inputs, but do not auto-promote them to global rules without explicit photographer confirmation.

### Step 9D

When a repeated new pattern appears across weddings and does not fit the current category map, review whether to add:

- a new action family
- a new topic
- a new verifier risk class

Do not create new categories from a single weird thread.

### Step 9E

When learning writes back, store the result in one place only.

Examples:

- reusable studio rule -> `playbook_rules`
- one-off case exception -> `memories`
- blocked photographer clarification -> `escalation_requests`

Do not duplicate the same decision across multiple storage layers unless one row is explicitly just an audit link to the source.

## [ ] Phase 10: Proactive Automation And Pause Guards

**Goal:** Make background timers safe in the new system.

### Step 10A

Add the wedding pause columns if they are not already migrated:

- `compassion_pause`
- `strategic_pause`
- `agency_cc_lock`

### Step 10B

Open and patch every sleeper:

- `milestoneFollowups.ts`
- `prepPhaseFollowups.ts`
- `postWeddingFlow.ts`
- `calendarReminders.ts`

### Step 10C

After every sleep boundary:

- re-query wedding state
- re-check pause flags
- abort safely if paused

### Step 10D

Where follow-ups are promises rather than milestone booleans, prefer explicit tasks rather than vague memory.

The model must not invent arbitrary timers.

Allowed follow-up shapes:

- update a known `wedding_milestones` boolean
- create a standard `tasks` row with a `due_date`

For important outbound asks, `toolOperator` may create a deduped `awaiting_reply` task.

Rules:

- only for approved action classes
- dedupe by open state and action context
- use policy or workflow due dates when available
- do not close purely because an inbound reply exists
- let the orchestrator classify the inbound reply as answer, deferral, or still-unresolved
- if the reply is a deferral, keep the task open and move the due date forward according to policy instead of completing it

Strategic pause should also support non-emergency business states such as:

- stalled negotiation awaiting photographer strategy
- intentional hold after a pricing dispute
- planner or agency conflict
- PR dispute or publication issue

## [ ] Phase 11: Frontend Operator Surfaces

**Goal:** Give the photographer real control over the system.

### Step 11A

Settings/onboarding:

- operator number
- approval matrix
- baseline playbook editor

This phase must also surface deterministic audience configuration and visibility controls where needed.

It should include onboarding inputs for the stable preference categories, not just raw freeform text.

### Step 11B

Inbox/pipeline:

- candidate wedding linking
- audience view
- attachment awareness
- thread automation mode controls

### Step 11C

Escalation surface:

- open escalation requests
- resolved escalations
- promote-to-playbook controls
- visual-review queue
- banking-exception queue
- PR/publication dispute queue

### Step 11D

Pause controls:

- compassion pause
- strategic pause
- agency CC lock

### Step 11E

Manual override controls:

- set thread to `auto`
- set thread to `draft_only`
- set thread to `human_only`
- clear `needs_human` when the photographer chooses to resume automation

## [ ] Phase 11.5: Observability & Telemetry

**Goal:** Treat observability as a core safety feature so we can measure how Ana behaves under real production conditions.

### Step 11.5A

Implement structured logging or a simple metrics table to track:

- `blocks_by_verifier`
- `escalation_rate`
- `idempotency_saves`
- `playbook_hit_rate`

### Step 11.5B

Every metric event should be attributable to:

- photographer
- thread
- wedding when known
- action key
- risk class when applicable

### Step 11.5C

Use telemetry to validate rollout safety during replay and early production:

- Are verifier blocks clustered around one missing rule area?
- Are escalations rising because onboarding is weak?
- Are duplicate-send protections catching real retries?
- Is the system using playbook rules enough to justify automation?

## [ ] Phase 12: Backfill And Stress Tests

**Goal:** Prove the new architecture against real wedding threads before cutover.

### Step 12A

Backfill identity:

- migrate existing `clients` into `people` and `contact_points`
- create `wedding_people`
- infer `thread_participants`

### Step 12B

Backfill current settings and known studio defaults into `playbook_rules`.

### Step 12C

Replay real wedding threads one by one and verify:

- identity resolution
- no duplicate weddings
- audience safety
- restricted-action escalation
- case-specific vs reusable learning
- pause behavior
- role and authority resolution
- visual-review escalation
- banking-exception handling
- offline context injection

### Step 12D

Only after these pass should we retire legacy routing and unused workers.

**Current status (this slice):** Legacy routing is **preserved**. `triage` continues to dispatch `ai/intent.*` only; `ai/orchestrator.client.v1` is not fan-out from triage until a dedicated cutover phase. All Inngest workers remain registered in `supabase/functions/inngest/index.ts`. Do **not** delete legacy paths, drop imports, or flip cutover flags until Step 12C replay and stress exit criteria are satisfied — the single retention flag lives in `supabase/functions/_shared/legacyRoutingCutoverGate.ts` (`LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA`).

## 6. Files And Areas Most Likely To Change

### Schema

- `supabase/migrations/*`
- `src/types/database.types.ts`

### Shared backend helpers

- `supabase/functions/_shared/inngest.ts`
- `supabase/functions/_shared/supabase.ts`
- `supabase/functions/_shared/settings.ts`
- `supabase/functions/_shared/context/*`
- `supabase/functions/_shared/tools/*`
- `supabase/functions/_shared/utils/*`

### Webhooks and ingress

- `supabase/functions/webhook-web/index.ts`
- `supabase/functions/webhook-whatsapp/index.ts`
- `supabase/functions/webhook-approval/index.ts`
- `supabase/functions/api-resolve-draft/index.ts`

### Inngest registry and workers

- `supabase/functions/inngest/index.ts`
- `supabase/functions/inngest/functions/triage.ts`
- new orchestrators under `supabase/functions/inngest/functions/`
- sleeper functions under `supabase/functions/inngest/functions/`

### Frontend

- `src/pages/settings/SettingsHubPage.tsx`
- `src/hooks/*`
- inbox, today, pipeline, and settings mode components

## 7. Rules For AI Coding During Execution

When this file is used in a prompt:

1. Identify the current phase and step.
2. Check `docs/v3/ARCHITECTURE.md` and `docs/v3/DATABASE_SCHEMA.md` first.
3. Write only the code for the current step.
4. Prefer additive changes over destructive refactors.
5. Regenerate or update types after schema changes.
6. Do not silently invent fields or tables that are not defined in the schema doc.
7. Do not remove legacy paths until the new path is proven by replaying real wedding threads.
