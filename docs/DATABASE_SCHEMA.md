# SUPABASE DATABASE SCHEMA (THE DATA CONTRACT)

## CORE RULES
1. **Multi-Tenancy:** EVERY table (except `photographers`) MUST have a `photographer_id` column to enforce Supabase Row Level Security (RLS). 
2. **Standardized Enums:** Do not use string literals for statuses. Use the canonical Enums defined below.
3. **Data Mapping:** The frontend models (e.g., `WeddingEntry`) must be mapped to these snake_case tables in the API utility layer.

## INFRASTRUCTURE
- **Supabase Realtime:** The `supabase_realtime` publication is enabled for `weddings`, `threads`, `messages`, and `drafts`. Any INSERT, UPDATE, or DELETE on these tables is pushed to connected frontend clients via WebSocket, triggering automatic UI refreshes (sidebar badges, notification bell, approval queue, timeline views).

## CANONICAL ENUMS
**`project_stage`** (Replaces the messy UI strings):
`inquiry` | `consultation` | `proposal_sent` | `contract_out` | `booked` | `prep` | `final_balance` | `delivered` | `archived`

## CORE TABLES

### 1. `photographers` (The Tenants)
- `id` (UUID, Primary Key, Foreign Key referencing `auth.users.id`)
- `email` (String)
- `settings` (JSONB)
*Note: A database trigger (`on_auth_user_created`) automatically inserts a row here when a new user signs up via Supabase Auth.*

### 2. `weddings` (Maps to frontend `WeddingEntry`)
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key)
- `project_type` (Enum `wedding_project_type`, default `wedding`) — per-project classification; see v3 `DATABASE_SCHEMA` §5.2
- `couple_names` (String) - *Maps to `couple`*
- `wedding_date` (Timestamptz) - *Maps to `when`*
- `location` (String) - *Maps to `where`*
- `stage` (Enum: `project_stage`)
- `package_name` (String) - *Maps to `package`*
- `contract_value` (Decimal) - *Maps to `value`*
- `balance_due` (Decimal) - *Maps to `balance`*
- `story_notes` (Text) - *Maps to `story`*
*Note: Supabase Realtime is enabled for this table to sync AI background tasks with the UI.*

### 3. `clients` (Maps to frontend `WeddingPersonRow`)
- `id` (UUID, Primary Key)
- `wedding_id` (UUID, Foreign Key)
- `name` (String)
- `role` (String) - *Maps to `subtitle` (e.g., Bride, Planner)*
- `email` (String)

### 4. `threads` (Maps to frontend `WeddingThread`)
- `id` (UUID, Primary Key)
- `wedding_id` (UUID, Foreign Key)
- `title` (String)
- `kind` (String: `group`, `planner_only`, `other`)
- `last_activity_at` (Timestamptz)
*Note: Supabase Realtime is enabled for this table to sync AI background tasks with the UI.*

### 5. `messages` (Maps to frontend `WeddingThreadMessage` & Internal Notes)
- `id` (UUID, Primary Key)
- `thread_id` (UUID, Foreign Key)
- `direction` (String: `in`, `out`, `internal`) - *'internal' replaces the old UI-only internalBody state*
- `sender` (String)
- `body` (Text)
- `sent_at` (Timestamptz)
*Note: Supabase Realtime is enabled for this table to sync AI background tasks with the UI.*

### 6. `drafts` (The AI Approval Queue)
- `id` (UUID, Primary Key)
- `thread_id` (UUID, Foreign Key)
- `status` (String: `pending_approval`, `approved`, `rejected`)
- `body` (Text)
- `instruction_history` (JSONB) - *For the AI refinement loop*
*Note: Supabase Realtime is enabled for this table to sync AI background tasks with the UI.*

### 7. `tasks`
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key)
- `wedding_id` (UUID, Foreign Key, Nullable)
- `title` (String)
- `due_date` (Timestamptz)
- `status` (String: `open`, `completed`)

### 8. `knowledge_base` (The RAG Memory)
- `id` (UUID, Primary Key)
- `photographer_id` (UUID, Foreign Key)
- `document_type` (String: `brand_voice`, `past_email`, `contract`)
- `content` (Text)
- `embedding` (Vector 1536)
- `metadata` (JSONB)
*Note: Includes a Postgres RPC function called `match_knowledge` for semantic vector search.*