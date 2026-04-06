# SUPABASE DATABASE SCHEMA (V2 DATA CONTRACT)

This document describes the V2 schema contract grounded in the current checked-in Supabase migrations.

The existing tables remain in place:
- `photographers`
- `weddings`
- `clients`
- `threads`
- `messages`
- `drafts`
- `tasks`
- `knowledge_base`

V2 adds:
- `memories`
- `thread_summaries`
- `vendors`
- `deliverables`
- `calendar_events`
- `wedding_milestones`

## 1. CORE RULES

### Multi-Tenant Rule
Every tenant-owned row must be isolated by `photographer_id`.

If a table stores `photographer_id` directly, all server-side queries must include:

```ts
.eq('photographer_id', tenantId)
```

If a table does not store `photographer_id` directly, its RLS and service-role query patterns must still prove ownership through the parent chain.

### `supabaseAdmin` Rule
`supabaseAdmin` bypasses RLS. That means backend code must manually enforce tenant filters in every query.

### Naming Rule
- TypeScript: `camelCase`
- Postgres / Supabase columns: `snake_case`

### Realtime Rule
Supabase Realtime is enabled for:
- `weddings`
- `threads`
- `messages`
- `drafts`
- `deliverables`

## 2. CANONICAL ENUMS

### `project_stage`
`inquiry` | `consultation` | `proposal_sent` | `contract_out` | `booked` | `prep` | `final_balance` | `delivered` | `archived`

### `message_direction`
`in` | `out` | `internal`

### `thread_kind`
`group` | `planner_only` | `other`

### `draft_status`
`pending_approval` | `approved` | `rejected`

### `task_status`
`open` | `completed`

### `deliverable_status`
`to_select` | `to_design` | `design_sent` | `changes_requested` | `book_redesign` | `approved` | `sent_to_print` | `delivering` | `delivered`

### `event_type`
`about_call` | `timeline_call` | `gallery_reveal` | `other`

## 3. TABLES

### 1. `photographers`
The tenant root table.

Columns:
- `id` (UUID, Primary Key, created from `auth.users.id` by trigger)
- `email` (TEXT, UNIQUE, NOT NULL)
- `settings` (JSONB)

Tenant / RLS rule:
- `photographers.id` is the tenant identifier.
- A photographer may only read and mutate their own row.

### 2. `weddings`
Primary CRM record for each wedding.

Columns:
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `couple_names` (TEXT, NOT NULL)
- `wedding_date` (TIMESTAMPTZ, NOT NULL)
- `location` (TEXT, NOT NULL)
- `stage` (`project_stage`, NOT NULL, default `inquiry`)
- `package_name` (TEXT, nullable)
- `contract_value` (NUMERIC(12,2), nullable)
- `balance_due` (NUMERIC(12,2), nullable)
- `story_notes` (TEXT, nullable)
- `timeline_call_date` (TIMESTAMPTZ, nullable)
- `gallery_delivery_date` (TIMESTAMPTZ, nullable)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

### 3. `clients`
People linked to a wedding.

Columns:
- `id` (UUID, Primary Key)
- `wedding_id` (UUID, Foreign Key -> `weddings.id`, NOT NULL)
- `name` (TEXT, NOT NULL)
- `role` (TEXT, nullable)
- `email` (TEXT, nullable)

Tenant / RLS rule:
- This table does not currently store `photographer_id` directly.
- Tenant ownership must be derived through `clients.wedding_id -> weddings.photographer_id`.

### 4. `threads`
Conversation containers for client, planner, or internal communication.

Columns:
- `id` (UUID, Primary Key)
- `wedding_id` (UUID, Foreign Key -> `weddings.id`, nullable for unfiled/internal threads)
- `title` (TEXT, NOT NULL)
- `kind` (`thread_kind`, NOT NULL, default `group`)
- `last_activity_at` (TIMESTAMPTZ, NOT NULL, default `now()`)
- `ai_routing_metadata` (JSONB, nullable)

Tenant / RLS rule:
- If `wedding_id` is present, tenant ownership must resolve through `weddings.photographer_id`.
- If `wedding_id` is null, the thread must still be associated with a tenant at the application layer before read/write access is allowed.

### 5. `messages`
Raw inbound, outbound, and internal messages.

Columns:
- `id` (UUID, Primary Key)
- `thread_id` (UUID, Foreign Key -> `threads.id`, NOT NULL)
- `direction` (`message_direction`, NOT NULL)
- `sender` (TEXT, NOT NULL)
- `body` (TEXT, NOT NULL)
- `sent_at` (TIMESTAMPTZ, NOT NULL, default `now()`)

Tenant / RLS rule:
- This table does not currently store `photographer_id` directly.
- Tenant ownership must resolve through `messages.thread_id -> threads.wedding_id -> weddings.photographer_id`.

### 6. `drafts`
AI-generated drafts awaiting human approval.

Columns:
- `id` (UUID, Primary Key)
- `thread_id` (UUID, Foreign Key -> `threads.id`, NOT NULL)
- `status` (`draft_status`, NOT NULL, default `pending_approval`)
- `body` (TEXT, NOT NULL)
- `instruction_history` (JSONB, default `[]`)

Tenant / RLS rule:
- This table does not currently store `photographer_id` directly.
- Tenant ownership must resolve through `drafts.thread_id -> threads.wedding_id -> weddings.photographer_id`.

### 7. `tasks`
Operational work items for the photographer.

Columns:
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `wedding_id` (UUID, Foreign Key -> `weddings.id`, nullable)
- `title` (TEXT, NOT NULL)
- `due_date` (TIMESTAMPTZ, NOT NULL)
- `status` (`task_status`, NOT NULL, default `open`)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

### 8. `knowledge_base`
Tenant-wide vector memory for brand voice, contracts, and reusable knowledge.

Columns:
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`)
- `document_type` (TEXT, NOT NULL)
- `content` (TEXT, NOT NULL)
- `embedding` (VECTOR(1536), nullable until embedded)
- `metadata` (JSONB, default `{}`)
- `created_at` (TIMESTAMPTZ, default `now()`)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

### 9. `memories`
Durable client memory for the Claude Code style header-scan pattern.

Columns:
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `wedding_id` (UUID, Foreign Key -> `weddings.id`, nullable)
- `type` (TEXT, NOT NULL)
- `title` (TEXT, NOT NULL)
- `summary` (TEXT, NOT NULL)
- `full_content` (TEXT, NOT NULL)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

### 10. `thread_summaries`
Rolling conversation summaries for token-efficient session memory.

Columns:
- `thread_id` (UUID, Primary Key, Foreign Key -> `threads.id`)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `summary` (TEXT, NOT NULL)
- `last_message_id` (UUID, Foreign Key -> `messages.id`, nullable)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

### 11. `vendors`
Third-party contacts associated with a photographer's operations (e.g., designers, second shooters, print labs).

Columns:
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `category` (TEXT, NOT NULL)
- `name` (TEXT, NOT NULL)
- `email` (TEXT, nullable)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

### 12. `deliverables`
Physical or digital products tied to a wedding, such as photobooks, lookbooks, or magazines.

Columns:
- `id` (UUID, Primary Key)
- `wedding_id` (UUID, Foreign Key -> `weddings.id`, NOT NULL)
- `type` (TEXT, NOT NULL)
- `status` (`deliverable_status`, NOT NULL, default `to_select`)
- `assigned_vendor_id` (UUID, Foreign Key -> `vendors.id`, nullable)
- `tracking_number` (TEXT, nullable)

Tenant / RLS rule:
- This table does not currently store `photographer_id` directly.
- Tenant ownership must be derived through `deliverables.wedding_id -> weddings.photographer_id`.

### 13. `calendar_events`
Internal calendar system replacing third-party tools like Calendly.

Columns:
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `wedding_id` (UUID, Foreign Key -> `weddings.id`, nullable)
- `client_id` (UUID, Foreign Key -> `clients.id`, nullable)
- `title` (TEXT, NOT NULL)
- `event_type` (`event_type`, NOT NULL)
- `start_time` (TIMESTAMPTZ, NOT NULL)
- `end_time` (TIMESTAMPTZ, NOT NULL)
- `meeting_link` (TEXT, nullable)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

### 14. `wedding_milestones`
Tracks the exact checklist state for proactive AI follow-ups.

Columns:
- `wedding_id` (UUID, Primary Key, Foreign Key -> `weddings.id`)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `retainer_paid` (BOOLEAN, default false)
- `questionnaire_sent` (BOOLEAN, default false)
- `questionnaire_completed` (BOOLEAN, default false)
- `moodboard_received` (BOOLEAN, default false)
- `timeline_received` (BOOLEAN, default false)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

### 4. `threads`
Conversation containers for client, planner, or internal communication.

Columns:
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `wedding_id` (UUID, Foreign Key -> `weddings.id`, nullable for unfiled/internal threads)
- `title` (TEXT, NOT NULL)
- `kind` (`thread_kind`, NOT NULL, default `group`)
- `last_activity_at` (TIMESTAMPTZ, NOT NULL, default `now()`)
- `ai_routing_metadata` (JSONB, nullable)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.

## 5. RLS SUMMARY BY TABLE

Direct `photographer_id` filtering required:
- `weddings`
- `tasks`
- `knowledge_base`
- `memories`
- `thread_summaries`
- `vendors`
- `calendar_events`
- `wedding_milestones`

Parent-chain tenant proof required:
- `clients`
- `threads`
- `messages`
- `drafts`
- `deliverables`

Tenant root:
- `photographers`

## 6. MEMORY ARCHITECTURE SUMMARY

### Global Knowledge
- table: `knowledge_base`
- scope: tenant-wide
- retrieval: vector search

### Durable Client Memory
- table: `memories`
- scope: tenant-wide or wedding-specific
- retrieval: header-scan first, full text second

### Session State
- tables: `messages` + `thread_summaries`
- scope: per thread
- retrieval: latest raw turns plus rolling summary