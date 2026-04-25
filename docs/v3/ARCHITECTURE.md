# ATELIER OS V3.1 ARCHITECTURE

> **Current-state note (2026):** Primary **email classification** is **Gmail delta → `inbox/thread.requires_triage.v1` → `processInboxThreadRequiresTriage`**. Pre-ingress **`comms/email.received`**, **`comms/web.received`**, and Inngest **`traffic-cop-triage`** are **retired** (see `ORCHESTRATOR_DECOMMISSION_SLICE_ROADMAP.md`). Operator WhatsApp legacy remains on **`legacy-whatsapp-ingress`**.

## 1. Purpose

This document defines the target runtime for the app in this repository.

It has two jobs:

1. Describe the repo as it actually exists today, so AI coding does not build on false assumptions.
2. Define the next architecture we are moving toward: a policy-driven, non-linear operator that acts according to each photographer's wishes, knows when it does not know enough, escalates over WhatsApp, and only learns reusable behavior when the photographer confirms it.

This revision replaces the older V3 story that treated WhatsApp as a client-facing routing channel.

New rule:

- **Client new-lead intake** in this product is **email** via **post-ingest** routing (`inbox/thread.requires_triage.v1` → dispatch, including `ai/intent.intake` when applicable). **Web is not a client intake channel** for migration planning. Retired pre-ingress **`comms/email.received`** is **not** part of the live Inngest contract.
- **Dashboard web** (historical **`comms/web.received`**) was the **photographer ↔ Ana** lane; **`webhook-web`** no longer emits that event (410 `web_pre_ingress_retired`). Same *purpose family* as operator WhatsApp: studio tooling, not end-client lead capture.
- **Email** remains the primary asynchronous client ↔ studio channel for replies; V3 “email/web” orchestrator cutovers for **known-wedding** traffic may use `reply_channel: "web"` in **dashboard** contexts only, not as “web intake.”
- WhatsApp (operator line) is the channel between the **photographer** and Ana for clarifications and escalations.
- If we later add client WhatsApp, that must be a separate channel contract and not be mixed with the operator line.

## 2. Current Repo Truth (April 2026)

### Frontend

The frontend is a React 19 + Vite + TypeScript dashboard with a four-pane shell.

Current primary modes:

- `today`
- `inbox`
- `pipeline`
- `calendar`
- `workspace`
- `directory`
- `settings`

Important truth:

- Some screens are backed by live Supabase queries.
- Some manager screens are still prototype or demo surfaces backed by local data.
- The dashboard is a hybrid of real product behavior and design/prototype behavior.

Examples:

- `src/hooks/useWeddings.ts`, `usePendingApprovals.ts`, `useUnfiledInbox.ts`, `useTasks.ts` query Supabase.
- `src/pages/manager/*` still include demo-style multi-photographer views and local datasets.
- `src/pages/settings/SettingsHubPage.tsx` currently writes `photographers.settings.whatsapp_number`.

### Backend

The backend is Supabase Edge Functions on Deno with Inngest for durable execution.

Current ingress functions:

- `webhook-web`
- `webhook-whatsapp`
- `webhook-approval`
- `api-resolve-draft`

Current Inngest function roster (representative — see `supabase/functions/inngest/index.ts` for the served bundle):

- `legacy-whatsapp-ingress` (operator WhatsApp legacy → internal concierge only)
- `process-inbox-thread-requires-triage` (Gmail/thread post-ingest classifier)
- `intake`
- `commercial`
- `logistics`
- `projectManager`
- `concierge`
- `studio`
- `persona`
- `rewrite`
- `outbound`
- `internalConcierge`
- `whatsappOrchestrator`
- `calendarReminders`
- `milestoneFollowups`
- `prepPhaseFollowups`
- `postWeddingFlow`

Important truth:

- The runtime is still a V1/V2 hybrid.
- **Email / dashboard-web legacy `ai/intent.*` dispatch from post-ingest routing** (vs env-gated `ai/orchestrator.client.v1`) is inventoried for retirement sequencing in [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) — **that doc’s “triage.ts” framing is historical** after pre-ingress retirement; no worker removal implied; preserves rollback when CUT gates are off.
- Most client-facing AI still flows through **`processInboxThreadRequiresTriage` / dispatch → one specialist worker → persona → draft approval → outbound** (same specialist workers; ingress path changed).
- There is an experimental V2 WhatsApp orchestrator, but it does not yet implement the target policy-verifier-learning model.
- There is still legacy/experimental WhatsApp logic in the codebase that does not match the new operator-only WhatsApp direction.

### Database

Tables that actually exist in migrations today:

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

Important truth:

- The generated frontend `src/types/database.types.ts` is stale and does not fully reflect the migrations.
- Older docs mention tables such as `vendors` and `deliverables`, but they do not exist in the current migration chain.

### Known Drift To Correct

This doc set must explicitly correct the following drift:

- Docs previously described a more advanced V3 runtime than the repo actually has.
- The current settings surface stores `whatsapp_number`, while the older V3 docs introduced `admin_mobile_number`.
- The older V3 docs assumed client WhatsApp routing. The new design uses WhatsApp only for photographer <-> Ana communication.
- The repo still uses hardcoded intent buckets (`intake`, `commercial`, `logistics`, `project_management`, `concierge`, `studio`) in important places. The target runtime should move toward action proposals and permission checks instead.

## 3. Design Stance

The target system is not:

- a fixed waterfall
- a giant prompt full of edge cases
- a hardcoded manager playbook pretending to fit every photographer

The target system is:

- a small fixed safety kernel
- a photographer-specific operating playbook
- a case-memory system
- a verifier that checks whether a proposed action is allowed
- an operator channel that lets Ana ask the photographer when policy or evidence is missing

This is the core principle:

Ana does not need to know everything.
Ana needs to know when she does not know enough to act safely.

## 4. Fixed Kernel vs Photographer-Defined Behavior

### Fixed Kernel

The following behavior is global and non-negotiable:

- strict tenant isolation
- deterministic identity resolution and dedupe checks
- no unsupported facts
- no silent policy invention
- every meaningful action must have an explicit permission mode
- every risky proposed action must carry structured decision justification
- reusable rules are only created from onboarding, explicit photographer confirmation, or deliberate promotion of a prior decision
- the verifier sits between proposed actions and execution

Tenant isolation is not a later hardening pass.

It is part of the fixed kernel and must be in place before the new path is trusted for production sends, drafts, tasks, memories, or project views.

### Strict Precedence Hierarchy

When rules, memories, and evidence conflict, the verifier and orchestrator must resolve them in this exact order:

1. database pause or lock flags and manual overrides
2. backend audience and visibility facts
3. global or channel-wide playbook rules
4. case or wedding memory
5. current proven evidence
6. escalation if conflict still cannot be safely resolved

Examples:

- `automation_mode = 'human_only'` overrides all lower layers
- audience visibility facts override any model guess about who can safely receive a message
- a global playbook rule may be narrowed by case memory only when that exception is already recorded as case truth and marked as an authorized exception
- if current evidence appears to contradict playbook or memory and the conflict is not safely resolvable, Ana must escalate instead of guessing

Verifier rule:

- ordinary factual memory is not enough to override reusable studio policy
- only case memory carrying an explicit authorized-exception marker may narrow a playbook rule

### Photographer-Defined Behavior

The following behavior is tenant-specific and must not be hardcoded in product logic:

- tone and brand voice
- pricing philosophy
- discount authority
- planner and agency etiquette
- who must be CC'd on which topics
- RAW file policy
- publication permission policy
- revision tolerance
- artistic preferences
- how assertive or conservative Ana should be
- which actions Ana may do alone
- which actions always require approval

### Photographer Preference Categories

The system does not need a separate database field for every way a photographer phrases a preference.

It does need a stable internal category map so onboarding answers, WhatsApp instructions, and escalations can be stored consistently.

The initial preference category set should cover at least:

- studio identity and voice
- scheduling and meetings
- pricing and discount authority
- invoicing, billing, and payment handling
- banking exceptions and reconciliation
- planner, agency, and CC etiquette
- audience privacy and visibility
- file release policy
- publication, PR, and vendor credit rules
- artistic revision and visual exception handling
- sensitive data and compliance assets
- proactive follow-up and automation limits
- escalation preferences

This category map is intentionally finite.

New categories should be added only when repeated real-world cases prove the current map is too coarse.

### Studio Business Profile Categories

Playbook rules are only half of onboarding.

Before Ana can decide how to act, Ana must know what the studio actually offers.

This business-profile layer is separate from the runtime playbook.

The initial business-profile category set should cover at least:

- service types
- service availability
- geographic scope
- travel policy
- booking scope
- client types
- deliverable types
- lead acceptance rules
- language support
- team structure

**Extensions (`studio_business_profiles.extensions`):** one versioned JSON object (`BusinessScopeExtensionsV1`) for **additional** photographer-defined labels (e.g. custom service or deliverable names) with optional `behaves_like_*` hints pointing at existing canonical enums. It does **not** extend the finite runtime vocabulary: deterministic branching stays on the core JSONB columns and playbook rules; extensions are for display, review, and retrieval only.

Examples:

- a photographer may shoot weddings and family sessions but not video
- a photographer may travel only within Europe, not worldwide
- a photographer may accept local weekday sessions but not multi-day commercial work
- a photographer may offer albums and digital galleries, but never raw delivery by default

This layer answers:

- what the studio does
- where the studio works
- what the studio never offers
- which inquiries Ana may decline immediately

The playbook answers something different:

- how Ana is allowed to behave inside that business scope

## 5. The System We Are Building

### The Goal

We are building a non-linear operator.

That means:

- the system should not rely on a fixed sequence like `triage -> specialist -> output`
- the system should derive the task from context
- the system should reason over policies, memory, identity, and audience before acting
- the system should escalate when uncertain

### The Output of Reasoning Is Not An "Intent"

The target orchestrator should not primarily think in terms of coarse intent labels.

It should think in terms of candidate actions, for example:

- `draft_reply`
- `send_reply`
- `schedule_call`
- `move_call`
- `create_task`
- `mark_invoice_paid`
- `issue_invoice`
- `update_wedding_state`
- `pause_automation`
- `request_clarification`
- `escalate_to_photographer`
- `store_case_memory`
- `promote_rule_to_playbook`

Each candidate action must then pass through permissions and verification.

### Multi-Agent Stance

The target runtime should behave more like a disciplined multi-agent system than a single giant assistant.

The design direction is intentionally a hybrid of two strong patterns seen in modern coding agents:

- Codex-style strengths:
  - one main controller owns the task
  - bounded subtasks can run in parallel
  - each task should have a narrow scope
  - context should be isolated so one task does not pollute another
- Claude Code-style strengths:
  - specialized subagents with separate context windows
  - project memory and operating rules loaded explicitly
  - hooks, gates, and policy checks around tool use
  - tool access can differ by agent role

For this wedding system, that means:

- one main orchestrator decides what needs to happen
- specialist agents or tools handle bounded work
- verifier logic gates risky actions
- the writer is a narrow drafting agent, not the decision-maker
- escalation and learning are first-class flows, not fallback hacks

This is not a free-for-all swarm.

It is a controlled delegation model with:

- role separation
- narrow context per role
- explicit permissions
- explicit escalation
- explicit learning boundaries

### Agent vs Tool vs Worker

These are not the same thing.

The target system should keep them clearly separated.

#### Agents

Agents are reasoning roles.

They decide, verify, draft, escalate, or classify.

Examples:

- main orchestrator
- verifier
- writer or persona
- lightweight escalation mode
- lightweight learning or archivist mode

Agents should stay few in number.

#### Tools

Tools are bounded capabilities the agents may call.

They should return structured data, not freeform prose.

Examples:

- audience check
- document lookup
- calculator
- operator mutation helper
- verifier check
- escalation creator
- archivist writeback

Tools are how the system exposes safe limbs to the orchestrator without spawning extra reasoning agents.

#### Workers

Workers are operational runtime units.

They own ingestion, retries, idempotent side effects, background jobs, and event handling.

Examples:

- inbound webhooks
- orchestration event handlers
- outbound sender
- approval resolver
- scheduled follow-up workers
- operator WhatsApp handler

Workers should exist for execution boundaries, not because every business topic needs its own AI brain.

#### Rule Of Thumb

- if it reasons, it is usually an agent role
- if it fetches, computes, or mutates in a bounded way, it is usually a tool
- if it owns events, retries, sleeps, or delivery, it is usually a worker

For this system:

- add more deterministic layers before adding more agents
- add more tools before adding more specialist AI roles
- add workers only when a distinct execution boundary or retry boundary is needed

## 6. Decision Modes

Every action in the target system must resolve to one of these modes:

- `auto`: Ana may do the action without asking.
- `draft_only`: Ana may prepare the artifact, but not send or commit it.
- `ask_first`: Ana must ask the photographer before taking the action.
- `forbidden`: Ana must not do the action and must escalate or decline.

These modes are the core bridge between onboarding, playbook rules, and runtime verification.

### Decision Authority Contract

For every canonical `action_key`, the system must be able to answer all six of these questions:

- what Ana may do alone
- what Ana may draft only
- what Ana must ask first
- what Ana must never do
- how Ana should ask when blocked
- how the approved answer should be remembered

The runtime is not complete if any of those six questions are left vague for an important action family.

In practice, that means:

- `playbook_rules.decision_mode` answers the first four
- the escalation model answers how Ana should ask
- the learning model answers how the approved answer should be remembered

This is the core contract that makes Ana behave like a real manager instead of a generic assistant.

## 7. Channel Model

### Client Channels

Client-facing communication channels in the target model:

- email
- web

These channels may create drafts, tasks, updates, and escalations.

### Operator Channel

WhatsApp is the operator channel only.

Use it for:

- photographer commands to Ana
- Ana questions to the photographer
- minimal high-signal notifications when Ana is blocked or needs approval
- approval or clarification of one-off decisions
- explicit playbook instructions from the photographer

Do not use the operator WhatsApp lane as a generic client support channel.

## 8. Identity, Audience, and Dedupe Model

This is one of the most important architecture changes.

**Repo note (unfiled / unresolved email):** The dashboard “Unfiled” inbox is **`threads.wedding_id IS NULL`**. Triage’s deterministic wedding link is **`clients.email` → `wedding_id`**; the OpenAI roster matchmaker path is **gated** by `enforceStageGate` (no deterministic wedding → enforced **`intake`**, so matchmaker does not run today). See `docs/v3/UNFILED_UNRESOLVED_MATCHING_SLICE.md`.

### Key Rule: A Wedding Is Not A Thread

The current repo already hints at this problem. The next architecture must make it explicit.

Truths:

- one wedding can have many threads
- one thread can mention more than one wedding
- one real-world person can appear across many weddings
- one organization can be both a planner, referrer, payer, or collaborator depending on context

Because of that, we must separate:

- weddings
- people
- contact points
- threads
- participants
- thread-to-wedding links

### Identity Resolution

Identity resolution should be deterministic first and model-assisted second.

Order:

1. Normalize contact points.
2. Check exact deterministic matches.
3. Check canonical links already stored in the database.
4. If still ambiguous, create candidate associations with confidence and do not invent a new record unless the system is confident enough or the user confirms it.

### Relationship Modes And Authority

Real wedding threads show that one person may play multiple roles at once.

Examples:

- bride and referral partner
- planner and commercial gatekeeper
- father and payer
- assistant and contract courier

The system must therefore separate:

- relationship mode
- audience visibility
- billing authority
- logistics authority
- approval authority

These are not interchangeable.

They affect:

- who may receive which information
- who may approve which action
- who should be chased for money
- who should be asked for timeline details
- what tone Ana should use

If the authority chain is unclear, Ana should escalate instead of assuming the visible sender is the decision-maker.

### Audience Safety

Before draft or send, the verifier must know:

- who is in the thread
- who is on the visible audience
- whether a topic is safe for this audience

This is required for cases like:

- agency commission should not be visible to the couple
- private pricing logic should not leak to vendors
- planner-only instructions should not be sent to the bride

This audience state must be resolved deterministically before model reasoning.

Do not ask the model to guess the visible audience from thread text alone.

The backend should resolve and inject facts such as:

- visible participants from `thread_participants`
- audience labels
- `agency_cc_lock`
- channel visibility notes
- recipient counts and `broadcast_risk` for high-CC or reply-all situations

High-CC or broadcast patterns should be treated as message-level safety facts.

Do not mutate `threads.automation_mode` automatically just because one inbound message has reply-all risk.

Instead, the verifier should use backend-resolved `broadcast_risk` to block `auto` reply behavior for that message and force `draft_only`, `ask_first`, or escalation as needed.

### Manual Context Injection

Important operational context often exists outside email threads.

Examples:

- the photographer met the couple in person
- the photographer already received a timeline on WhatsApp
- the photographer wants to gift albums
- the photographer is delayed in transit

The system must support explicit manual context injection from the operator lane or dashboard.

This injected context should become either:

- case memory
- an explicit pending action
- a one-off operator instruction

It must not be faked as if it came from client email history.

### Manual Override

The photographer must have a physical mute button for sensitive conversations.

Thread-level automation control should be explicit and deterministic via `threads.automation_mode`:

- `auto`
- `draft_only`
- `human_only`

This is not a soft prompt hint.

It is a runtime control surface that must be honored by:

- orchestrators
- verifier checks
- outbound execution
- proactive automation touching that thread

### Decision Justification

The system should not rely on hidden chain-of-thought.

Instead, before risky actions such as escalation, approval-first requests, sensitive drafting, or execution, the orchestrator should produce a short structured decision justification.

This justification exists so the verifier, audit trail, and later learning loop can inspect why the action was proposed.

Minimum shape:

- `why_blocked` or `why_allowed`
- `missing_capability_or_fact`
- `risk_class`
- `evidence_refs`
- `recommended_next_step`

Example:

- `why_blocked`: the client asked for visual feedback on a Canva link
- `missing_capability_or_fact`: no verified visual review is available
- `risk_class`: creative_feedback
- `evidence_refs`: current message, attachment metadata, relevant playbook rule
- `recommended_next_step`: escalate to photographer with a short question

## 9. Memory Model

The target memory stack has five layers.

### Tier 0: Safety Constitution

Global, non-photographer-specific rules.

Examples:

- never leak tenant data
- never invent facts
- never create reusable policy from one ambiguous incident
- never execute forbidden actions

### Tier 1: Photographer Playbook

The reusable operating rules for one photographer.

Examples:

- "discounts always require approval"
- "Ana may schedule calls on her own"
- "never send RAW files unless explicitly approved"
- "always keep the planner CC'd on logistics"
- "artistic critique should be escalated"

This layer is the main expression of photographer wishes.

### Tier 2: Case Memory

Wedding-specific or relationship-specific durable memory.

Examples:

- Dana is also a referral partner
- Anne Mann handles timelines
- this wedding allows a special edit price
- this planner waived commission on this case only
- this couple is in a sensitive personal situation

This memory should not automatically become a photographer-wide rule.

### Tier 3: Session State

Short-horizon memory:

- latest messages
- thread summary
- unresolved follow-ups
- current draft state

### Tier 4: Ephemeral Scratchpad

Per-run working state.

Examples:

- candidate matches
- tool outputs
- proposed actions
- unresolved contradictions

This layer should not be persisted as durable truth unless explicitly promoted.

### Retrieval Contract

The memory architecture is not complete if the runtime only loads headers.

The decision context builder should use a two-step retrieval pattern:

1. load light context first:
   - thread summary
   - recent messages
   - memory headers
   - candidate playbook and knowledge hits
2. then promote only the relevant records into full decision context:
   - selected durable memories
   - selected global knowledge
   - selected documents or attachments when needed

This is important for both quality and cost control.

The runtime should not leave the deeper layers empty by default if they are part of the context contract.

In practical terms:

- `memoryHeaders` are for scan and ranking
- `selectedMemories` are the full durable records actually used in reasoning
- `globalKnowledge` is the curated tenant-wide guidance actually used in reasoning

If the system cannot find enough relevant memory or knowledge, that absence should be explicit and may itself trigger clarification or escalation.

Highly sensitive personal data must not be part of normal model-readable knowledge retrieval.

Examples:

- passport numbers
- dates of birth
- government identifiers

Sensitive personal data should flow through restricted document access with explicit approval rules, not through general `knowledge_base` retrieval.

### Memory Distribution By Agent Role

Not every agent should receive the same memory payload.

That would increase cost, blur responsibilities, and create more hallucination risk.

The target distribution should look like this:

- Main orchestrator:
  - full decision context
  - selected memories
  - relevant playbook rules
  - relevant global knowledge
  - audience state
  - open escalation state
- Verifier:
  - the proposed action
  - structured decision justification
  - relevant permissions and playbook rules
  - evidence references
  - audience and pause state
- Operator escalation agent:
  - the blocked action
  - structured decision justification
  - the minimum case context needed to ask the photographer well
- Writer or persona agent:
  - approved factual output only
  - light personalization context
  - narrow tone and continuity memory
- Archivist or learning path:
  - the resolved decision
  - whether it is reusable or one-off
  - links to memory, playbook, or escalation records

The writer must not receive unrestricted operational memory by default.

The orchestrator and verifier should carry the heavy context burden.

## 10. Onboarding

Onboarding exists so Ana does not ping the photographer for obvious things.

The onboarding flow should seed both:

- the initial business profile
- the initial playbook

Minimum onboarding categories:

- studio identity
- manager and photographer display names
- timezone and currency
- operator WhatsApp number
- service types and service availability
- geographic scope and travel policy
- booking scope and client types
- deliverable types and language support
- team structure and lead acceptance rules
- approval philosophy
- scheduling authority
- money and discount authority
- invoice and payment handling rules
- planner and agency rules
- publication and RAW-file rules
- revision and artistic feedback rules
- escalation preferences

The output of onboarding is not just JSON settings.

It should populate:

- `photographers.settings`
- business-profile storage
- `playbook_rules`
- selected `knowledge_base` entries if needed

The onboarding UI may also keep a versioned **editable briefing snapshot** inside
`photographers.settings` so the photographer can return later from Settings and edit the same
briefing flow.

That snapshot is **editor state / audit source only**.

Runtime must **not** read the editable snapshot as the source of truth for:

- service scope
- approval rules
- action permissions
- escalation policy

Those must still come from the canonical split layers:

- `photographers.settings` for identity + metadata
- `studio_business_profiles` for studio scope
- `playbook_rules` for reusable behavior policy
- optional `knowledge_base` for reusable standard knowledge

In simple terms:

- business profile = what the studio is and offers
- playbook = how Ana behaves
- memories = one-off case truth

## 11. Escalation Model

Escalation is not a failure path. It is a normal capability.

Ana should escalate when:

- policy is missing
- two policies conflict
- the audience is risky
- the request is unusual
- there is insufficient evidence
- the action falls under `ask_first` or `forbidden`

### Escalation Shape

Every escalation should be short and structured:

- what was asked
- what Ana wants to do
- why she is blocked
- the structured decision justification for the block
- the recommended answer if one is reasonable
- whether the result should be one-off or reusable

Example pattern:

- Request
- Proposed action
- Block reason
- Decision justification
- Recommendation
- "One-time decision or new studio rule?"

Every escalation should also clearly imply:

- what Ana was allowed to do up to the block
- what exact approval or instruction is needed next
- whether the answer is expected to become:
  - reusable studio policy
  - case-specific memory
  - a restricted document or asset action

### Escalation Delivery Policy

Not every escalation should buzz the photographer instantly.

The operator lane should support escalation triage and batching.

Urgent escalations should push immediately.

Examples:

- PR dispute
- banking exception
- sensitive data send
- same-day timeline blocker

Non-urgent escalations should be batchable into a digest or held in the dashboard queue.

Examples:

- visual review on album spreads
- low-risk wording preference questions
- non-urgent publication clarification

This keeps Ana helpful without turning WhatsApp into notification spam.

## 12. Learning Model

The system should learn, but not too eagerly.

### What May Become Reusable Playbook

Reusable rules may be created from:

- onboarding
- explicit photographer WhatsApp instructions
- deliberate promotion of a resolved escalation
- repeated, highly consistent approval behavior that the photographer confirms

Reusable playbook means tenant-global or channel-wide policy only.

Do not store wedding-specific, person-specific, or thread-specific exceptions in `playbook_rules`.

### How Approved Answers Must Be Remembered

After the photographer answers, the system should store the result in exactly one primary place:

- reusable studio-wide or channel-wide answer -> `playbook_rules`
- case-specific approved exception -> `memories`
- sensitive file or compliance asset decision -> `documents` plus audit link if needed
- still blocked or pending clarification -> keep the record open in `escalation_requests`

Do not leave an important approved answer living only inside raw message text.

Do not duplicate the same decision across many storage layers unless one record is only an audit link back to the source.

### What Stays Case-Specific

One-off decisions should remain local to the wedding or thread if they are:

- client-specific exceptions
- event-specific exceptions
- emotionally sensitive one-offs
- partner-specific exceptions
- rare commercial concessions

This is critical. The system must not turn every exception into a global rule.

### Visual Review Required

Some requests are operationally clear but visually unverifiable by a text-first AI.

Examples:

- album spread swaps
- Canva or Frame.io review requests
- dress or shoe checks
- marked-up exclusions in a gallery
- "can you fix this face / color / crop"

These should resolve to a first-class blocked state such as `visual_review_required`.

In that state, Ana may:

- acknowledge receipt
- store the asset and notes
- ask a clarifying question if safe
- escalate to the photographer

Ana must not make the final visual judgment herself.

## 13. Proactive Automation and Pauses

The system is both reactive and proactive.

Reactive:

- inbound messages
- photographer commands
- approvals

Proactive:

- payment reminders
- questionnaire follow-ups
- timeline nudges
- post-wedding workflows

However, proactive automation must always respect pauses.

Minimum pause model:

- `compassion_pause`
- `strategic_pause`
- `agency_cc_lock`

Rule:

- after every `step.sleep()` or `step.sleepUntil()`, re-query the wedding and abort if paused
- the model must not invent arbitrary long-lived timers from freeform text
- follow-up promises should resolve into either:
  - a known milestone update
  - an explicit `tasks` row with a due date

For important outbound asks, the preferred pattern is an explicit `awaiting_reply` task rather than an invented timer.

This should be used only for approved action classes and must be deduped.

It must not close just because any inbound reply arrived.

If the reply is a true answer, the task may resolve.

If the reply is a deferral such as "let me check and get back to you", the orchestrator should keep the task open and move the due date forward according to policy.

Strategic pause is not only for emotional sensitivity.

It may also be used for:

- stalled negotiation requiring the photographer's strategy
- deliberate sales positioning
- planner or agency disputes
- PR or publication conflicts

## 14. Current-to-Target Mapping

### Current State

- hardcoded specialist routing
- thin memory loading
- hybrid WhatsApp behavior
- settings JSON without clear operator/playbook contract
- no first-class audience graph
- no first-class escalation table

### Target State

- non-linear action proposals
- policy-driven permissions
- richer decision context
- operator-only WhatsApp
- explicit audience and participant model
- explicit escalation and learning records
- clear split between global or channel-wide playbook rules and case-specific memory

### Migration Principle

Use a strangler pattern.

Do not delete the current pipeline until the replacement path is proven with:

- real wedding thread replays
- approval loop checks
- operator escalation tests
- pause guard tests
- identity and dedupe tests

## 15. Non-Negotiables

- Migrations are the source of truth for schema.
- Generated frontend types must be regenerated after schema work.
- Do not reintroduce broad hardcoded business categories where a playbook rule or action permission should exist.
- Do not silently invent photographer policy.
- Do not store one-off case exceptions in `playbook_rules`.
- Do not silently merge ambiguous entities.
- Do not let the model guess audience from unstructured message text when backend audience facts can be resolved first.
- Do not let the model auto-reply to high-risk broadcast or reply-all messages without verifier gating.
- Do not let the model invent arbitrary timers outside milestone flows and explicit tasks.
- Do not expose highly sensitive personal data through normal `knowledge_base` retrieval.
- Do not allow retries, duplicate webhooks, or double-click approvals to create duplicate outbound sends.
- Do not treat manual override flags such as `human_only` as advisory.
- Do not let the model send directly without passing through permissions and verification.
- Do not let WhatsApp drift back into a mixed client/operator lane without a separate design and consent model.
