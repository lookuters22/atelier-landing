# ATELIER OS DATABASE SCHEMA

## 1. Purpose

This file is the database contract for AI coding in this repository.

Use it to:

- understand what is already implemented
- understand what the next schema should look like
- avoid creating duplicate rows for the same real-world entity
- avoid inventing tables or fields that fight the architecture

This document intentionally separates:

- **Current repo truth**: what exists in migrations today
- **Target V3.1 contract**: what should be added next

Do not treat older docs as authoritative if they disagree with this file.

Source of truth order:

1. `supabase/migrations/*`
2. this document
3. generated TypeScript database types

If generated types disagree with migrations, the types are stale and must be regenerated.

## 2. Current Repo Truth (Implemented Today)

Tables present in the checked-in migrations:

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
- `authorized_case_exceptions` (V3 case-scoped approved policy overrides; see §5.17.1)

Important truth:

- **Slice 2 (production readiness)** added composite btree indexes matching proven app reads: `weddings (photographer_id, wedding_date desc)`, `threads (photographer_id, last_activity_at desc)`, `drafts (photographer_id, status, created_at desc)`, `tasks (photographer_id, status, due_date)`, `import_candidates (photographer_id, connected_account_id, created_at desc)` — see migration `20260430152000_slice2_pgvector_ann_and_hot_indexes.sql`.
- `vendors` and `deliverables` do not exist in the current migration chain.
- `drafts.created_at` exists in migrations, but the generated frontend database types are behind.
- The current frontend settings page uses `photographers.settings.whatsapp_number`.
- The older V3 docs used `admin_mobile_number`. The target model in this document keeps both during migration, but the long-term operator field should be `admin_mobile_number`.

## 3. Universal Rules

### Multi-Tenant Rule

Every tenant-owned row belongs to one `photographer_id`.

If a table stores `photographer_id` directly, every server-side service-role query must include:

```ts
.eq('photographer_id', tenantId)
```

If a table does not store `photographer_id` directly, ownership must be proven through a parent chain.

### New AI-Facing Tables Rule

If a new table will be queried directly by orchestrators, tools, or background jobs, give it a direct `photographer_id` column even if ownership could be derived indirectly.

Reason:

- it reduces service-role mistakes
- it makes policy retrieval simpler
- it makes audit queries safer

### Additive Migration Rule

Do not rename or delete current core tables during the first pass of V3.1.

Keep existing compatibility surfaces in place:

- `clients`
- `threads.wedding_id`
- current approval tables

Add new canonical tables alongside them, then migrate gradually.

### No Duplicate Entity Rule

Never create a new row for a person, contact point, wedding, thread, or attachment if a deterministic key already matches.

Use normalization and unique constraints wherever possible.

### No Silent Policy Rule

Do not store photographer preferences as scattered one-off booleans across unrelated tables.

Reusable photographer wishes belong in `playbook_rules`.

`playbook_rules` is only for tenant-global or channel-wide policy.

Case-specific exceptions belong in wedding-scoped memory or escalation records.

### WhatsApp Rule

In the target model, WhatsApp is the operator lane between the photographer and Ana.

It is not a general client communication channel.

## 4. Canonical Enums

### Implemented Today

`project_stage`

- `inquiry`
- `consultation`
- `proposal_sent`
- `contract_out`
- `booked`
- `prep`
- `final_balance`
- `delivered`
- `archived`

`message_direction`

- `in`
- `out`
- `internal`

`memory_scope` (production memory; `public.memories.scope`)

- `project`
- `person`
- `studio`

`thread_kind`

- `group`
- `planner_only`
- `other`

`draft_status`

- `pending_approval`
- `approved`
- `rejected`

`task_status`

- `open`
- `completed`

`event_type`

- `about_call`
- `timeline_call`
- `gallery_reveal`
- `other`

### New Target Enums

These are infrastructure enums, not business-role enums.

Avoid over-enumerating human relationship roles such as bride, planner, father, payer, assistant, or partner. Those should stay as text fields because they vary and will evolve.

`thread_channel`

- `email`
- `web`
- `whatsapp_operator`
- `manual`
- `system`

`person_kind`

- `individual`
- `organization`

`contact_point_kind`

- `email`
- `phone`
- `whatsapp`
- `instagram`
- `other`

`decision_mode`

- `auto`
- `draft_only`
- `ask_first`
- `forbidden`

`automation_mode`

- `auto`
- `draft_only`
- `human_only`

`rule_scope`

- `global`
- `channel`

`escalation_status`

- `open`
- `answered`
- `dismissed`
- `promoted`

`thread_wedding_relation`

- `primary`
- `mentioned`
- `candidate`

`document_kind`

- `invoice`
- `contract`
- `questionnaire`
- `timeline`
- `insurance`
- `price_guide`
- `gallery_export`
- `attachment`
- `other`

## 5. Current And Target Table Contract

## 5.1 photographers

### Status

Implemented today.

### Current columns

- `id` UUID PK
- `email` TEXT UNIQUE NOT NULL
- `settings` JSONB

### Required settings contract

Current keys already referenced in the repo:

- `studio_name`
- `manager_name`
- `photographer_names`
- `whatsapp_number` (legacy current UI key)

Target keys to add and standardize:

- `admin_mobile_number`
- `timezone`
- `currency`
- `onboarding_completed_at`
- `playbook_version`
- `business_profile_version`

Optional editor-only settings keys allowed in `settings` JSONB:

- `onboarding_briefing_v1`
- `onboarding_briefing_updated_at`

### Rules

- Keep `whatsapp_number` during migration so the current UI does not break.
- Add `admin_mobile_number` as the canonical operator phone identity key.
- Use `settings` for studio identity and onboarding metadata, not as a dumping ground for service scope or runtime policy.
- Do not scatter onboarding state into multiple unrelated tables if it can live here, in business-profile storage, or in `playbook_rules`.
- It is acceptable to store a versioned **editable onboarding snapshot** in `settings` for the UI, as long as runtime policy and studio-scope reads continue to come from canonical storage.
- Runtime must not query `settings.onboarding_briefing_v1` to decide service scope, approval authority, or reusable policy.

## 5.1A studio_business_profiles

### Status

New target table.

### Purpose

Stores the structured business-scope layer that onboarding must capture before runtime policy even matters.

This table answers:

- what the studio offers
- where the studio operates
- what the studio does not offer
- which leads are in or out of scope

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL UNIQUE
- `service_types` JSONB NOT NULL DEFAULT '[]'::jsonb
- `service_availability` JSONB NOT NULL DEFAULT '{}'::jsonb
- `geographic_scope` JSONB NOT NULL DEFAULT '{}'::jsonb
- `travel_policy` JSONB NOT NULL DEFAULT '{}'::jsonb
- `booking_scope` JSONB NOT NULL DEFAULT '{}'::jsonb
- `client_types` JSONB NOT NULL DEFAULT '[]'::jsonb
- `deliverable_types` JSONB NOT NULL DEFAULT '[]'::jsonb
- `lead_acceptance_rules` JSONB NOT NULL DEFAULT '{}'::jsonb
- `language_support` JSONB NOT NULL DEFAULT '[]'::jsonb
- `team_structure` JSONB NOT NULL DEFAULT '{}'::jsonb
- `extensions` JSONB NOT NULL DEFAULT '{}'::jsonb
- `source_type` TEXT NOT NULL DEFAULT 'onboarding'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Rules

- One row per photographer.
- This table is for reusable studio scope, not wedding-specific exceptions.
- Do not store runtime approval rules here. Those belong in `playbook_rules`.
- Do not store one-off case exceptions here. Those belong in `memories` or `escalation_requests`.
- The values should be structured and canonical enough for deterministic lead filtering and context building.
- Example meanings:
  - `service_types`: weddings, family, maternity, brand, video
  - `geographic_scope`: local only, domestic, Europe, worldwide, blocked regions
  - `travel_policy`: travels freely, selective travel, no travel, destination minimums
  - `lead_acceptance_rules`: what Ana may politely decline without escalation

### extensions (JSONB)

Additive contract **`BusinessScopeExtensionsV1`** (`schema_version: 1`), stored in `extensions`. Used for **custom labels and notes** beyond the fixed enum columns — for UI, review, retrieval, and hydration — **not** for deterministic allow/deny branching (that remains on `service_types`, `geographic_scope`, `travel_policy`, `deliverable_types`, `lead_acceptance_rules`, and playbook `decision_mode` / `action_key` only).

Shape (see `src/lib/onboardingBusinessScopeExtensions.ts`):

- `custom_services[]`: `{ label, behaves_like_service_type? }` — optional `behaves_like_*` references an existing offered service enum value as a hint; if absent or null, runtime must not guess scope.
- `custom_geography_labels[]`: `{ label, kind: "included" | "excluded" }`
- `travel_constraints[]`: free-text strings (normalized/deduped in code)
- `custom_deliverables[]`: `{ label, behaves_like_deliverable? }` — same “hint” pattern as services

Do not introduce per-user action keys or new canonical enum values through this column.

## 5.2 weddings

### Status

Implemented today. Target columns still missing.

### Current columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id`
- `project_type` `wedding_project_type` NOT NULL DEFAULT `wedding` — per-row project classification (not studio capability authority; see `studio_business_profiles`)
- `couple_names` TEXT
- `wedding_date` TIMESTAMPTZ
- `location` TEXT
- `stage` `project_stage`
- `package_name` TEXT NULL
- `contract_value` NUMERIC NULL
- `balance_due` NUMERIC NULL
- `story_notes` TEXT NULL

### Target additive columns

- `timeline_call_date` TIMESTAMPTZ NULL
- `gallery_delivery_date` TIMESTAMPTZ NULL
- `compassion_pause` BOOLEAN NOT NULL DEFAULT false
- `strategic_pause` BOOLEAN NOT NULL DEFAULT false
- `agency_cc_lock` BOOLEAN NOT NULL DEFAULT false

### Rules

- `weddings` remains the primary CRM record.
- `project_type` classifies the row (wedding vs portrait, commercial, etc.); business-scope truth remains `studio_business_profiles` and playbook rules.
- Do not create duplicate wedding rows for the same case if the only difference is thread/channel context.
- If a thread may refer to multiple weddings, use `thread_weddings`; do not duplicate the wedding row.

## 5.3 people

### Status

New target table.

### Purpose

Canonical tenant-wide people and organizations.

This is the main fix for cross-thread and cross-wedding identity drift.

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `kind` `person_kind` NOT NULL
- `display_name` TEXT NOT NULL
- `canonical_name` TEXT NOT NULL
- `notes` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Rules

- One real-world human or organization should map to one `people` row per tenant.
- Use `contact_points` for deterministic matching.
- Do not rely on `display_name` alone for dedupe.

## 5.4 contact_points

### Status

New target table.

### Purpose

Normalized contact identity for email, phone, WhatsApp, Instagram, and similar handles.

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `person_id` UUID FK -> `people.id` NOT NULL
- `kind` `contact_point_kind` NOT NULL
- `value_raw` TEXT NOT NULL
- `value_normalized` TEXT NOT NULL
- `is_primary` BOOLEAN NOT NULL DEFAULT false
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Constraints

Recommended unique constraint:

- UNIQUE (`photographer_id`, `kind`, `value_normalized`)

### Rules

- Every inbound identity check should look here first.
- Never create a second contact point with the same normalized value for the same tenant.
- Normalize emails to lowercase trimmed form.
- Normalize phone and WhatsApp numbers to E.164-like canonical form.

## 5.5 wedding_people

### Status

New target table.

### Purpose

Links people to weddings and stores their role in that specific case.

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `wedding_id` UUID FK -> `weddings.id` NOT NULL
- `person_id` UUID FK -> `people.id` NOT NULL
- `role_label` TEXT NOT NULL
- `relationship_modes` JSONB NULL
- `is_primary_contact` BOOLEAN NOT NULL DEFAULT false
- `is_billing_contact` BOOLEAN NOT NULL DEFAULT false
- `is_timeline_contact` BOOLEAN NOT NULL DEFAULT false
- `is_approval_contact` BOOLEAN NOT NULL DEFAULT false
- `is_payer` BOOLEAN NOT NULL DEFAULT false
- `must_be_kept_in_loop` BOOLEAN NOT NULL DEFAULT false
- `notes` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Constraints

Recommended unique constraint:

- UNIQUE (`wedding_id`, `person_id`)

### Rules

- Keep the role as text, not enum.
- This table is where planner, payer, assistant, parent, or partner context should live for a specific wedding.
- One person may hold multiple relationship modes at the same time.
- Distinguish billing authority, logistics authority, audience visibility, and approval authority instead of assuming they are the same.

## 5.6 clients

### Status

Implemented today. Legacy compatibility table.

### Current columns

- `id` UUID PK
- `wedding_id` UUID FK -> `weddings.id`
- `name` TEXT
- `role` TEXT NULL
- `email` TEXT NULL

### Rules

- Do not treat `clients` as the long-term canonical identity model.
- During migration, keep it for current UI and worker compatibility.
- New identity features should be built on `people`, `contact_points`, and `wedding_people`.

## 5.7 threads

### Status

Implemented today. Needs additive columns.

### Current columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id`
- `wedding_id` UUID NULL FK -> `weddings.id`
- `title` TEXT
- `kind` `thread_kind`
- `last_activity_at` TIMESTAMPTZ
- `ai_routing_metadata` JSONB NULL

### Target additive columns

- `channel` `thread_channel` NOT NULL DEFAULT 'email'
- `external_thread_key` TEXT NULL
- `status` TEXT NOT NULL DEFAULT 'open'
- `automation_mode` `automation_mode` NOT NULL DEFAULT 'auto'
- `last_inbound_at` TIMESTAMPTZ NULL
- `last_outbound_at` TIMESTAMPTZ NULL
- `needs_human` BOOLEAN NOT NULL DEFAULT false

### Constraints

Recommended partial unique constraint:

- UNIQUE (`photographer_id`, `channel`, `external_thread_key`) WHERE `external_thread_key IS NOT NULL`

### Rules

- Keep `threads.wedding_id` as the compatibility pointer for existing code.
- **`wedding_id` NULL** means “unfiled” in the UI (`useUnfiledInbox`); causes include intake-before-bootstrap and other flows — see `docs/v3/UNFILED_UNRESOLVED_MATCHING_SLICE.md`.
- The long-term truth for multi-wedding conversations belongs in `thread_weddings`.
- `automation_mode` is the thread-level manual override surface:
  - `auto`: normal automation rules apply
  - `draft_only`: Ana may prepare drafts but not send or execute
  - `human_only`: automation should not act on this thread except for audit-safe internal bookkeeping
- `needs_human` and `automation_mode = 'human_only'` should be treated as hard stop signals by orchestrators and outbound paths.

## 5.8 thread_weddings

### Status

New target table.

### Purpose

Allows one thread to point to multiple weddings without duplicating thread rows.

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `thread_id` UUID FK -> `threads.id` NOT NULL
- `wedding_id` UUID FK -> `weddings.id` NOT NULL
- `relation` `thread_wedding_relation` NOT NULL
- `confidence_score` NUMERIC NULL
- `reasoning` TEXT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Constraints

Recommended unique constraint:

- UNIQUE (`thread_id`, `wedding_id`)

### Rules

- `primary` should mirror the meaning of the legacy `threads.wedding_id`.
- `mentioned` and `candidate` allow ambiguous or dual-event threads without forcing a bad merge.

## 5.9 thread_participants

### Status

New target table.

### Purpose

Stores the audience graph for a thread.

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `thread_id` UUID FK -> `threads.id` NOT NULL
- `person_id` UUID FK -> `people.id` NOT NULL
- `visibility_role` TEXT NOT NULL
- `is_sender` BOOLEAN NOT NULL DEFAULT false
- `is_recipient` BOOLEAN NOT NULL DEFAULT true
- `is_cc` BOOLEAN NOT NULL DEFAULT false
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Constraints

Recommended unique constraint:

- UNIQUE (`thread_id`, `person_id`)

### Rules

- Use this for audience safety before sending commission, billing, or planner-sensitive content.
- Do not infer audience only from thread title or message body.

## 5.10 messages

### Status

Implemented today. Needs additive columns.

### Current columns

- `id` UUID PK
- `thread_id` UUID FK -> `threads.id`
- `direction` `message_direction`
- `sender` TEXT
- `body` TEXT
- `sent_at` TIMESTAMPTZ

### Target additive columns

- `photographer_id` UUID NULL during backfill, then NOT NULL
- `provider_message_id` TEXT NULL
- `idempotency_key` TEXT NULL
- `channel` `thread_channel` NULL during migration, then NOT NULL
- `raw_payload` JSONB NULL
- `metadata` JSONB NULL

### Constraints

Recommended partial unique constraint:

- UNIQUE (`thread_id`, `provider_message_id`) WHERE `provider_message_id IS NOT NULL`
- UNIQUE (`idempotency_key`) WHERE `idempotency_key IS NOT NULL`

### Rules

- Store provider ids to avoid duplicate message inserts.
- Store raw provider payload when useful for audit and reprocessing.
- `idempotency_key` is the send-once guard for outbound actions and retry-prone provider callbacks.
- Duplicate webhooks, retries, or approval races must be absorbed by idempotent writes instead of creating duplicate outbound messages.

## 5.11 message_attachments

### Status

New target table.

### Purpose

Tracks message media and document attachments.

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `message_id` UUID FK -> `messages.id` NOT NULL
- `kind` TEXT NOT NULL
- `source_url` TEXT NOT NULL
- `storage_path` TEXT NULL
- `mime_type` TEXT NULL
- `metadata` JSONB NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Constraints

Recommended unique constraint:

- UNIQUE (`message_id`, `source_url`)

### Rules

- Do not silently ignore inbound media.
- If the model cannot safely interpret the attachment, store it anyway and escalate or route to human review.
- If a message references marked-up images, design links, album spreads, screenshots, or visual correction requests, treat that as a likely `visual_review_required` case.

## 5.12 drafts

### Status

Implemented today. Needs minor additive fields.

### Current columns

- `id` UUID PK
- `thread_id` UUID FK -> `threads.id`
- `status` `draft_status`
- `body` TEXT
- `instruction_history` JSONB DEFAULT `[]`
- `created_at` TIMESTAMPTZ

### Target additive columns

- `photographer_id` UUID NULL during migration, then NOT NULL
- `decision_mode` `decision_mode` NULL
- `source_action_key` TEXT NULL
- `locked_for_sending_at` TIMESTAMPTZ NULL
- `invalidated_at` TIMESTAMPTZ NULL

### Rules

- `drafts` are approval artifacts, not long-term policy storage.
- Approval edits can be inputs into learning, but the durable rule should end up in `playbook_rules` or case memory, not only in `instruction_history`.
- `locked_for_sending_at` is the atomic handoff field for approval-to-send transitions.
- Approve-and-send flows must lock a draft exactly once before creating an outbound message.
- Double-click approval and worker retries must not create duplicate sends.
- Approve-and-send must also reject stale drafts before locking.
- If `threads.last_inbound_at > drafts.created_at`, the system should invalidate the draft and force re-evaluation instead of sending old context.

## 5.13 tasks

### Status

Implemented today.

### Current columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id`
- `wedding_id` UUID NULL FK -> `weddings.id`
- `title` TEXT
- `due_date` TIMESTAMPTZ
- `status` `task_status`

### Recommended additive columns

- `thread_id` UUID NULL FK -> `threads.id`
- `task_type` TEXT NULL
- `metadata` JSONB NULL

### Rules

- Use `tasks` for operational follow-up, not for reusable playbook rules.
- If Ana promises to check later, create an explicit `tasks` row with a due date or update a known milestone.
- Do not let the model invent arbitrary timer records outside the approved milestone and task system.
- Support a constrained `awaiting_reply` task pattern for important outbound asks.
- `awaiting_reply` tasks should be deduped by open state and action context rather than created repeatedly on every send.
- Use task metadata to tie waiting states to the triggering action, recipient class, or missing deliverable.

## 5.14 knowledge_base

### Status

Implemented today. **RLS** is enabled with tenant isolation on `photographer_id` (`auth.uid()` = studio row); edge workers using the service role bypass RLS for ingestion and `match_knowledge` RPC callers.

**Slice 2 (indexes):** partial **HNSW** index on `embedding` (`vector_cosine_ops`, `WHERE embedding IS NOT NULL`); btree `idx_knowledge_base_photographer_type_created` on `(photographer_id, document_type, created_at DESC)` for tenant-scoped list/recency paths.

### Current columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id`
- `document_type` TEXT
- `content` TEXT
- `embedding` VECTOR(1536) NULL
- `metadata` JSONB DEFAULT `{}`
- `created_at` TIMESTAMPTZ DEFAULT now()

### `match_knowledge` RPC

- **Args:** `query_embedding`, `match_threshold`, `match_count`, `p_photographer_id`, optional `p_document_type`.
- **Returns:** `id`, `content`, `metadata`, `similarity` (cosine-based), `document_type`, `created_at`.
- Rows with `embedding IS NULL` are excluded.

### Rules

- Tenant-wide durable knowledge only.
- Good for brand voice, standard policies, contract boilerplate, standard answers, and approved operating guidance.
- Do not overload this table with every case-specific exception.
- In the target runtime, `knowledge_base` is the main source for `globalKnowledge` in decision context.
- Do not retrieve the entire table into prompts. Select only the relevant records for the current action.
- Do not store highly sensitive personal data here.
- Passport numbers, dates of birth, government identifiers, and similar PII must not live in general AI-readable knowledge retrieval.
- Use this table for reusable guidance such as vendor-credit templates, publication requirements, approved delay language, and standard planning etiquette only if they are truly reusable.

## 5.15 memories

### Status

Implemented today.

### Current columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id`
- `wedding_id` UUID NULL FK -> `weddings.id`
- `scope` `memory_scope` NOT NULL — `project` \| `person` \| `studio` (Slice 1 schema; Slice 2 reply-mode fetch/selection is scope-aware)
- `person_id` UUID NULL FK -> `people.id` ON DELETE CASCADE (person-scoped rows; writers unset until later slices)
- `archived_at` TIMESTAMPTZ NULL — soft archive
- `type` TEXT
- `title` TEXT
- `summary` TEXT
- `full_content` TEXT
- `source_escalation_id` UUID NULL FK -> `escalation_requests.id` (learning loop)
- `learning_loop_artifact_key` TEXT NULL

**Constraint `memories_scope_shape_check` (Slice 3):**

```sql
(scope = 'project' AND wedding_id IS NOT NULL AND person_id IS NULL)
OR (scope = 'person' AND person_id IS NOT NULL AND wedding_id IS NULL)
OR (scope = 'studio' AND wedding_id IS NULL AND person_id IS NULL)
```

### Recommended additive columns

- `scope_label` TEXT NULL
- `source_type` TEXT NULL
- `source_ref` TEXT NULL
- `is_promoted_from_escalation` BOOLEAN NOT NULL DEFAULT false
- `is_authorized_exception` BOOLEAN NOT NULL DEFAULT false

### Rules

- Use `memories` for durable case memory and narrative context.
- Reply-mode header scan (`fetchMemoryHeaders`): non-archived only; with a wedding id — `scope='project'` for that `wedding_id`, all `scope='studio'`, and `scope='person'` rows whose `person_id` is in the current thread’s `thread_participants` set; without a wedding id but with participants — `person` rows for those ids plus all `project` and `studio`. Deterministic promotion caps studio picks in known-wedding reply mode, blocks cross-project `project` memory, and only promotes `person` memory when `person_id` is in that participant set (Slice 4).
- Assistant-mode header scan (`fetchAssistantMemoryHeaders` via `buildAssistantContext`): operator-only; non-archived; default OR filter is `scope='studio'` only. Optional explicit `focusedWeddingId` / `focusedPersonId` (tenant-validated) adds `scope='project'` for that wedding and/or `scope='person'` for that person. Does not use reply-mode filters or thread participants; context type is `AssistantContext` with `clientFacingForbidden: true` (Slice 5).
- Keep the header-scan pattern: load summaries first, full content second.
- Do not turn all memories into global rules.
- In the target runtime, `memories` should map to two stages:
  - header scan for ranking
  - full-record retrieval for `selectedMemories`
- `selectedMemories` should only contain the small set of full records needed for the current decision.
- Ordinary factual memory must not override reusable playbook policy.
- Only memory explicitly marked `is_authorized_exception = true` may narrow a playbook rule for that case.
- This is the correct home for:
  - role shifts such as bride -> partner or father -> payer
  - one-off banking routes
  - visual restrictions
  - publication restrictions for a specific wedding
  - offline context injections

## 5.16 thread_summaries

### Status

Implemented today.

### Current columns

- `thread_id` UUID PK FK -> `threads.id`
- `photographer_id` UUID FK -> `photographers.id`
- `summary` TEXT
- `last_message_id` UUID NULL FK -> `messages.id`

### Rules

- This is session memory, not policy memory.
- Recompute incrementally; do not stuff the full thread into every prompt.

## 5.17 playbook_rules

### Status

New target table.

### Purpose

Stores reusable photographer operating rules.

This is the most important new table for the desired system.

It should be read together with `studio_business_profiles`:

- `studio_business_profiles` = what the studio offers
- `playbook_rules` = how Ana behaves

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `scope` `rule_scope` NOT NULL
- `channel` `thread_channel` NULL
- `action_key` TEXT NOT NULL
- `topic` TEXT NOT NULL
- `decision_mode` `decision_mode` NOT NULL
- `instruction` TEXT NOT NULL
- `source_type` TEXT NOT NULL
- `confidence_label` TEXT NOT NULL DEFAULT 'explicit'
- `is_active` BOOLEAN NOT NULL DEFAULT true
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Rules

- This table holds reusable policy, not one-off case exceptions.
- Store only tenant-global or channel-wide rules here.
- Do not store wedding-specific, person-specific, or thread-specific exceptions here.
- Do not store core service scope here if it belongs in `studio_business_profiles`.
- Examples of `action_key`: `schedule_call`, `discount_quote`, `release_raw_files`, `send_invoice`, `respond_to_art_feedback`, `publication_permission`.
- If the photographer says an action always requires approval, store `decision_mode = 'ask_first'`.
- Do not create a new boolean column for each new photographer preference if it belongs here.
- For every important `action_key`, the active rule set should let the runtime resolve whether Ana may:
  - do it alone
  - draft only
  - ask first
  - never do it
- Do not leave critical action families without a resolvable `decision_mode`.

### Suggested Action Families

Use a finite canonical action vocabulary and let photographer nuance live in rule instructions and metadata.

The initial action family set should cover at least:

- `send_message`
- `schedule_call`
- `move_call`
- `share_document`
- `send_invoice`
- `discount_quote`
- `banking_exception`
- `payment_reconciliation`
- `release_raw_files`
- `release_gallery_assets`
- `publication_permission`
- `vendor_credit_approval`
- `respond_to_art_feedback`
- `visual_review_required`
- `share_sensitive_data`
- `update_crm`
- `pause_automation`
- `await_client_reply`

### Suggested Topics

The initial topic map should cover at least:

- `voice`
- `scheduling`
- `pricing`
- `billing`
- `banking`
- `planner_etiquette`
- `audience_privacy`
- `files`
- `publication`
- `pr_dispute`
- `art_feedback`
- `visual_assets`
- `sensitive_data`
- `automation`
- `escalation`

## 5.17.1 authorized_case_exceptions (additive migration `20260416120000_authorized_case_exceptions.sql`)

### Status

Implemented in repo migrations.

### Purpose

Schema-backed **approved** overrides that may **narrow** normal `playbook_rules` behavior for a specific wedding (and optionally one thread). Runtime merges raw playbook + active exceptions in TypeScript (`deriveEffectivePlaybook`) before verifier/orchestrator/persona policy excerpts.

This is **not** `memories.metadata` and not ordinary case memory.

### Columns (summary)

- `id` UUID PK
- `photographer_id` UUID FK → `photographers.id` NOT NULL
- `wedding_id` UUID FK → `weddings.id` NOT NULL
- `thread_id` UUID NULL FK → `threads.id` (null = wedding-wide)
- `status` TEXT CHECK (`draft` \| `active` \| `revoked`)
- `overrides_action_key` TEXT NOT NULL (join key to `playbook_rules.action_key` when `target_playbook_rule_id` is null)
- `target_playbook_rule_id` UUID NULL FK → `playbook_rules.id`
- `override_payload` JSONB NOT NULL (structured: `decision_mode`, `instruction_override`, `instruction_append`, …)
- `approved_by` UUID NULL FK → `people.id`
- `approved_via_escalation_id` UUID NULL FK → `escalation_requests.id`
- `effective_from` / `effective_until` TIMESTAMPTZ
- `notes` TEXT
- `created_at` / `updated_at` TIMESTAMPTZ

### Rules

- Tenant isolation: always filter by `photographer_id` in service-role queries.
- Only **`active`** rows in the effective time window are loaded into `DecisionContext.authorizedCaseExceptions`.
- Persona does not receive raw exception rows; policy text uses **`effectivePlaybookRules`** after merge.

## 5.18 escalation_requests

### Status

New target table.

### Purpose

Audit trail of "Ana does not know enough, so she asked the photographer".

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `wedding_id` UUID NULL FK -> `weddings.id`
- `thread_id` UUID NULL FK -> `threads.id`
- `action_key` TEXT NOT NULL
- `reason_code` TEXT NOT NULL
- `decision_justification` JSONB NOT NULL
- `question_body` TEXT NOT NULL
- `recommended_resolution` TEXT NULL
- `status` `escalation_status` NOT NULL DEFAULT 'open'
- `resolution_text` TEXT NULL
- `resolved_decision_mode` `decision_mode` NULL
- `resolution_storage_target` TEXT NULL
- `promote_to_playbook` BOOLEAN NOT NULL DEFAULT false
- `playbook_rule_id` UUID NULL FK -> `playbook_rules.id`
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `resolved_at` TIMESTAMPTZ NULL

### Rules

- This is the central audit table for uncertainty handling.
- `decision_justification` is a compact structured audit object, not hidden chain-of-thought.
- Minimum keys for `decision_justification`:
  - `why_blocked`
  - `missing_capability_or_fact`
  - `risk_class`
  - `evidence_refs`
  - `recommended_next_step`
- `resolved_decision_mode` should capture what the photographer actually decided for the blocked action.
- `resolution_storage_target` should capture where the approved answer was stored, for example:
  - `playbook_rules`
  - `memories`
  - `documents`
  - `authorized_case_exceptions` (structured case-scoped policy override; see §5.17.1)
  - `escalation_requests_open`
- If the answer is one-off, keep it here and optionally write wedding-scoped memory.
- If the answer is reusable, create or update `playbook_rules` and link it here.

## 5.19 documents

### Status

New target table.

### Purpose

Catalogs stored business artifacts and wedding-specific documents.

This prevents the system from inventing invoices, insurance files, contracts, or guides that do not exist.

### Columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id` NOT NULL
- `wedding_id` UUID NULL FK -> `weddings.id`
- `kind` `document_kind` NOT NULL
- `title` TEXT NOT NULL
- `storage_path` TEXT NULL
- `provider_url` TEXT NULL
- `metadata` JSONB NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

### Rules

- Use this for invoices, contracts, questionnaires, timelines, price guides, insurance certificates, and similar assets.
- Do not bury file references only inside freeform memory text.
- Sensitive personal-data documents may be referenced here, but their contents must not be injected into normal model context by default.
- Sensitive document send actions should be gated by verifier checks, audience checks, and approval-first playbook rules such as `send_team_pii`.
- Use this table for compliance and restricted business assets such as:
  - insurance certificates
  - tax forms
  - standard contracts
  - restricted ID/passport packets
  - publication credit sheets

## 5.20 calendar_events

### Status

Implemented today.

### Current columns

- `id` UUID PK
- `photographer_id` UUID FK -> `photographers.id`
- `wedding_id` UUID NULL FK -> `weddings.id`
- `client_id` UUID NULL FK -> `clients.id`
- `title` TEXT
- `event_type` `event_type`
- `start_time` TIMESTAMPTZ
- `end_time` TIMESTAMPTZ
- `meeting_link` TEXT NULL

### Rules

- Keep `client_id` for current compatibility.
- New scheduling flows should be able to reference canonical `people` as the model evolves, but do not break the current schema first.

## 5.21 wedding_milestones

### Status

Implemented today.

### Current columns

- `wedding_id` UUID PK FK -> `weddings.id`
- `photographer_id` UUID FK -> `photographers.id`
- `retainer_paid` BOOLEAN DEFAULT false
- `questionnaire_sent` BOOLEAN DEFAULT false
- `questionnaire_completed` BOOLEAN DEFAULT false
- `moodboard_received` BOOLEAN DEFAULT false
- `timeline_received` BOOLEAN DEFAULT false

### Rules

- Keep milestone booleans here.
- Do not use this table as a dumping ground for all workflow state. It is for checklist-style milestone facts only.
- This is the safe trigger surface for approved milestone-driven sleepers.
- Prefer updating a known milestone here rather than inventing a new background timer shape.

## 6. Insert And Update Rules For AI Coding

### Wedding creation

Before creating a new wedding:

- check existing active weddings for the same photographer
- compare normalized couple names, wedding date, and location
- if ambiguous, create a candidate link or flag for review instead of inserting a duplicate wedding

### Person creation

Before creating a new `people` row:

- resolve contact points first
- if a contact point already exists, reuse the linked person

### Thread creation

Before creating a new thread:

- check `external_thread_key`
- if the same provider thread already exists for the photographer and channel, reuse it

### Thread-to-wedding linkage

If a thread might involve multiple weddings:

- keep `threads.wedding_id` null or set only the best known primary
- record all candidate and mentioned weddings in `thread_weddings`

### Policy storage

- reusable rules go to `playbook_rules`
- case-specific decisions go to `memories` and/or `escalation_requests`
- do not add ad hoc preference columns to `weddings` unless they are universally meaningful pause/lock fields
- do not infer audience only from message text if `thread_participants` can resolve it deterministically

### Attachments

Always persist message attachments when they exist.

Even if the model cannot safely interpret them, the system should be able to:

- acknowledge receipt
- escalate to the photographer
- revisit the artifact later

## 7. Migration Notes

- Keep `clients` and `threads.wedding_id` alive during migration.
- Add new canonical tables before rewriting old workers.
- Regenerate `src/types/database.types.ts` after every schema phase.
- Update all docs if a migration changes the contract.
- Do not assume old "updated docs" folders are correct; this file is the active contract.
