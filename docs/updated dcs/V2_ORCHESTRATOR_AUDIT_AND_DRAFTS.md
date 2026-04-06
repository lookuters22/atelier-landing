# V2 Orchestrator Audit And Drafts

This document is a review artifact only.

It does not apply any architecture, schema, or rules changes to the codebase.

Its purpose is to capture:
- the codebase audit
- the second-pass clarifications
- the refined draft text for:
  - `ARCHITECTURE.md`
  - `DATABASE_SCHEMA.md`
  - Section 4 of `.cursorrules`

## Scope Reviewed

The audit was grounded in the checked-in backend code and schema, especially:
- root `package.json`
- `supabase/functions/inngest/functions/*.ts`
- `supabase/functions/_shared/**/*.ts`
- `supabase/functions/webhook-*.ts`
- `supabase/migrations/*.sql`
- `src/types/database.types.ts`

## Step 1: Codebase Tech-Stack Audit

### 1. Real AI Stack Found In Code

There is no single framework-style AI SDK orchestrating the backend today.

The active implementation is a mix of:
- direct `fetch()` calls to OpenAI Chat Completions
- direct `fetch()` calls to OpenAI Embeddings
- direct `fetch()` calls to Anthropic Messages
- a legacy helper using `npm:@anthropic-ai/sdk`
- a helper using `npm:@google/genai`

### 1.1 What Is Not Present As The Main Runtime

The repository is not currently using any of the following as the primary AI integration layer:
- `@ai-sdk/openai`
- the official `openai` Node SDK
- LangChain
- Agno runtime code

Important clarification:
- the root `.cursorrules` and docs claim Agno
- the checked-in backend code does not actually implement Agno

### 1.2 What Is Actually Installed Versus What Is Actually Used

The root `package.json` is mostly the frontend app manifest.

It includes:
- React
- Vite
- Tailwind tooling
- Supabase JS

It does not include AI SDK packages at the root.

However, the Supabase Edge Functions are Deno-based and import npm packages inline, so the backend AI/runtime picture must be taken from the function files, not from root `package.json` alone.

### 1.3 Provider Usage By Active Backend Path

#### OpenAI

OpenAI is used directly via HTTP `fetch()` in active flows for:
- triage classification
- intake tool-calling
- logistics tool-calling
- concierge tool-calling
- internal concierge tool-calling
- embeddings for RAG

This means the dominant native tool-calling shape already in use is:
- OpenAI Chat Completions
- `tools: [...]`
- `tool_calls`

#### Anthropic

Anthropic is used in two places:
- active Persona flow via direct `fetch()` to `POST /v1/messages`
- rewrite helper via `npm:@anthropic-ai/sdk`

The active Persona flow already uses native Anthropic tools format.

#### Google Gemini

Google Gemini appears in helper modules via `npm:@google/genai`.

Most importantly:
- `runMatchmakerAgent()` is actively used by `triage.ts`
- older helper-style intake and concierge modules also use Gemini, but those helper modules are not the current main path for `inngest/functions/intake.ts` and `inngest/functions/concierge.ts`

### 2. Tool Usage Found In Workers

### 2.1 Workers Already Using Native Structured Tool-Calling

These workers already implement native structured tool-calling:

- `supabase/functions/inngest/functions/intake.ts`
  - OpenAI Chat Completions
  - tool definition for `check_calendar_availability`
  - manual loop over `tool_calls`

- `supabase/functions/inngest/functions/logistics.ts`
  - OpenAI Chat Completions
  - tool definition for `estimate_travel_costs`
  - manual loop over `tool_calls`

- `supabase/functions/inngest/functions/concierge.ts`
  - OpenAI Chat Completions
  - tool definition for `search_past_communications`
  - manual loop over `tool_calls`

- `supabase/functions/inngest/functions/internalConcierge.ts`
  - OpenAI Chat Completions
  - multiple tool definitions
  - manual loop over `tool_calls`

- `supabase/functions/inngest/functions/persona.ts`
  - Anthropic Messages
  - native Anthropic `tools`
  - loop over `tool_use` / `tool_result`

Conclusion:
- the backend is already doing native provider tool-calling
- it is not doing plain prompt-in / text-out everywhere
- but it is doing so in a hand-rolled way, function by function

### 2.2 Workers That Are Not Native Tool-Calling

These flows are still mostly deterministic TypeScript workflows:
- `commercial.ts`
- `projectManager.ts`
- `studio.ts`

These do not presently use model-native tool calling as the control surface.

### 2.3 Current Orchestration Shape

The active architecture is still V1 waterfall-like:

1. webhook emits Inngest event
2. triage resolves identity and intent
3. one specialist worker runs
4. Persona writes the draft if needed
5. approval / outbound completes the loop

So the codebase is:
- event-driven
- durable
- partially tool-calling
- but still mostly linear at the top level

## Step 1B: Second-Pass Clarifications And Drift Notes

These are important mismatches between current docs, runtime code, and schema.

### 1. Docs Claim Agno, Code Does Not

Current documentation and `.cursorrules` describe Agno agent teams.

The checked-in backend does not implement Agno runtime code.

The real orchestration stack is:
- Inngest
- Supabase Edge Functions
- direct provider API calls

### 2. `supabaseAdmin` Bypasses RLS

The shared server-side client explicitly bypasses RLS.

That means the docs should strongly state:
- every tenant-owned query must be manually scoped
- `.eq('photographer_id', tenantId)` is mandatory whenever the column exists

### 3. Tenant Scoping Is Incomplete In Current Backend Code

Many reads and writes currently scope only by:
- `id`
- `wedding_id`
- `thread_id`

This is not enough for service-role safety.

Examples include:
- wedding fetches by `id` only
- thread fetches by `wedding_id` only
- draft fetches by `id` only

This is the biggest security-relevant clarification for the docs.

### 4. `tasks` Currently Has RLS Disabled

The current SQL migration explicitly disables RLS on `tasks`.

That is not compatible with the intended multi-tenant rule.

The updated schema doc should describe the V2 target:
- `tasks` must be tenant-scoped by `photographer_id`
- RLS should be enabled for production

### 5. Draft Status Drift

Current enum in SQL and `src/types/database.types.ts` is:
- `pending_approval`
- `approved`
- `rejected`

But `api-resolve-draft/index.ts` writes:
- `processing_rewrite`

That status is not in the current enum contract.

The schema doc should call this out as implementation drift, not canon.

### 6. Event Contract Drift For `approval/draft.approved`

There is an inconsistency between callers and consumers:
- `webhook-approval` sends `{ draft_id, photographer_id }`
- `api-resolve-draft` sends only `{ draft_id }`
- the event schema in `_shared/inngest.ts` expects both `draft_id` and `photographer_id`
- the outbound worker currently only reads `draft_id`

This should be documented as drift, because it affects how strict the event contract really is.

### 7. Generated Database Types Lag Behind SQL

`src/types/database.types.ts` does not fully reflect the checked-in SQL migrations.

Notable examples:
- `knowledge_base` is present in migrations but missing from TS types
- SQL/RPC functions are present but `Functions` is still `Record<string, never>`
- future V2 tables like `memories` and `thread_summaries` do not yet exist in TS types

This matters because `.cursorrules` currently says the type file is the single source of truth.

### 8. `drafts.created_at` Is Queried But Not In Current Schema

`internalConcierge.ts` queries `drafts.created_at`.

The current checked-in schema and TS types do not define `created_at` on `drafts`.

That is another schema/runtime mismatch worth preserving in the audit.

### 9. Root `package.json` Alone Is Not Sufficient For Backend Audit

Because the backend is Supabase Edge Functions on Deno:
- inline `npm:` imports matter
- direct `fetch()` calls matter

So architecture docs must be grounded in actual worker files, not just the root manifest.

## Recommendation After Second Pass

For the V2 Orchestrator draft, the cleanest truthful position is:
- do not describe the stack as Agno
- do not describe the stack as Vercel AI SDK
- do describe the active orchestration/tool-calling substrate as native provider APIs
- standardize the new Orchestrator on the dominant existing tool-calling shape already present in code:
  - OpenAI Chat Completions for orchestration and specialist tools
  - Anthropic Messages for Persona drafting

This is the most grounded migration story based on what is actually checked in today.

## Refined Draft: `ARCHITECTURE.md`

```md
# EVENT-DRIVEN ORCHESTRATION & AI ARCHITECTURE (V2)

## 1. PHILOSOPHY: FROM WATERFALL TO ORCHESTRATOR
Atelier OS is migrating away from a fixed linear workflow such as `triage -> specialist -> persona -> outbound`.

The current codebase is already event-driven and durable through Inngest, but most client-facing AI flows still behave like a waterfall:
1. A webhook emits an Inngest event.
2. `triage.ts` classifies the message and routes it to exactly one specialist.
3. The specialist gathers facts.
4. `persona.ts` drafts the final reply.
5. The draft waits for approval before outbound delivery.

V2 replaces that fixed sequence with a central Orchestrator loop:
`Reason -> Act -> Observe -> Decide -> Persona Draft`

The frontend never talks directly to the model. Webhooks and UI actions emit events. The Orchestrator owns the decision loop, calls tools dynamically, batches independent tool calls where possible, and passes only verified facts into the Persona Agent.

## 2. THE REAL RUNTIME STACK
This document must reflect the code that is actually checked into this repository.

- **Frontend:** React, Vite, Tailwind CSS, TypeScript.
- **Backend runtime:** Supabase Edge Functions on Deno.
- **Durable execution:** Inngest via `npm:inngest@3`.
- **Database client:** `npm:@supabase/supabase-js@2` inside Edge Functions.
- **Primary AI integration currently in use:** direct provider API calls via `fetch()`.
- **OpenAI usage currently in use:**
  - `POST /v1/chat/completions`
  - `POST /v1/embeddings`
  - models currently used include `gpt-4o-mini` and `text-embedding-3-small`
- **Anthropic usage currently in use:**
  - `POST /v1/messages`
  - model currently used in the active Persona flow is `claude-sonnet-4-20250514`
- **Additional provider code currently present:**
  - `npm:@anthropic-ai/sdk` is used in the rewrite helper path
  - `npm:@google/genai` is used by the Matchmaker helper
- **Not currently used as the main runtime abstraction:** Vercel AI SDK (`@ai-sdk/openai`), the official `openai` Node SDK, LangChain, or Agno runtime code

### Standardization Rule for V2
Because the dominant active tool-calling implementation in this repo is OpenAI Chat Completions with `tools` / `tool_calls`, the V2 Orchestrator should standardize on that existing native tool-calling shape for orchestration and specialist tool execution.

Anthropic remains the Persona drafting layer unless explicitly migrated later.

## 3. THE MULTI-TENANT PRIME DIRECTIVE
Atelier OS is a multi-tenant SaaS. Cross-tenant data leakage is a P0 failure.

`supabaseAdmin` uses the service-role key and bypasses RLS. That means tenant isolation must be enforced manually in every server-side query.

### Mandatory Rule
Whenever a table has a `photographer_id` column, every server-side query must include:

```ts
.eq('photographer_id', tenantId)
```

### Parent-Chain Rule
If a table does not carry `photographer_id` directly, tenant ownership must still be proven through the parent chain before reading or mutating data.

Examples:
- `clients` must be scoped through their parent `weddings.photographer_id`
- `threads` must be scoped through their parent wedding
- `messages` must be scoped through `thread -> wedding -> photographer`
- `drafts` must be scoped through `thread -> wedding -> photographer`

No global reads. No cross-tenant matchmaker rosters. No unscoped service-role queries.

## 4. CURRENT V1 FLOW
The current production-shaped backend is:

1. A stateless webhook receives email, web, or WhatsApp input.
2. The webhook emits `comms/*` into Inngest.
3. `triage.ts` performs deterministic identity checks, stage gating, intent classification, and optional matchmaker lookup.
4. Exactly one downstream worker runs:
   - `intake`
   - `commercial`
   - `logistics`
   - `project_management`
   - `concierge`
   - `studio`
5. If facts are needed for a client reply, `persona.ts` writes the draft.
6. The draft is saved to `drafts` with `pending_approval`.
7. Approval emits `approval/draft.approved`, and the outbound worker records the send.

This V1 shape is durable, but it is still linear and single-specialist.

## 5. V2 ORCHESTRATOR LOOP
V2 introduces one central Orchestrator that decides which tools to call and in what order.

### Target Flow
1. Inngest catches the inbound webhook event.
2. Deterministic pre-processing resolves:
   - `photographerId`
   - `weddingId` if known
   - `threadId` if known
   - reply channel
   - raw inbound message
3. `buildAgentContext()` gathers the tenant-scoped operating context.
4. The Orchestrator runs a tool-calling loop using the existing native provider format already used in this repo.
5. The Orchestrator can call one tool or many tools in the same round.
6. Once the facts are stable, the Orchestrator passes a clean factual payload to the Persona Agent.
7. The Persona Agent writes the final draft in studio voice.
8. The draft is saved for human approval.
9. Approval triggers outbound delivery and logging.

### `buildAgentContext()` Responsibilities
`buildAgentContext()` is the required first step before model reasoning.

It must gather:
- tenant identity
- wedding snapshot
- CRM facts needed for routing
- the most recent raw messages
- the rolling thread summary
- memory headers from durable client memory
- relevant global knowledge hits
- channel metadata
- the raw inbound message

Suggested shape:

```ts
type AgentContext = {
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web" | "whatsapp";
  rawMessage: string;
  crmSnapshot: Record<string, unknown>;
  recentMessages: Array<Record<string, unknown>>;
  threadSummary: string | null;
  memoryHeaders: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
  }>;
  selectedMemories: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    full_content: string;
  }>;
  globalKnowledge: Array<Record<string, unknown>>;
};
```

## 6. ORCHESTRATOR TOOL-CALLING RULES
The Orchestrator is the only controller. Specialist units are tools, not top-level workflow owners.

### Rules
- Use the existing OpenAI Chat Completions `tools` / `tool_calls` format for orchestration.
- Batch independent tool calls in the same reasoning round when possible.
- Tools must return structured facts, updates, and errors.
- Tools must not write client-facing prose.
- Tool failures must return structured error state to the Orchestrator instead of hiding the problem.
- Every model round, external API call, retry boundary, and durable mutation belongs inside Inngest `step.run()`.

### Specialist Tools in V2
Former workers become callable tool modules, for example:
- `intake`
- `logistics`
- `commercial`
- `concierge`
- `project_management`
- `studio`
- memory lookup tools
- summary refresh tools
- CRM update tools

The Orchestrator chooses which of these to call based on context, not on a hardcoded one-tool waterfall.

## 7. PERSONA AGENT: FINAL DRAFT ONLY
The Persona Agent remains the final drafting layer.

Responsibilities:
- apply the photographer's voice
- use tenant-scoped RAG when needed
- turn verified facts into a final client-facing draft
- save drafts for approval

Non-responsibilities:
- routing
- deciding which operational tools to call
- inventing facts
- querying cross-tenant data

The Persona Agent should continue to use Anthropic Messages tool-calling for voice and retrieval until explicitly refactored.

## 8. THE CLAUDE CODE MEMORY PATTERN
We use a 3-tier memory system to avoid token explosion and to make context loading explainable.

### Tier 1: Global Knowledge
Tenant-wide durable knowledge lives in `knowledge_base`.

Examples:
- brand voice guidance
- contract rules
- package descriptions
- operating procedures

This layer is vector searched and must always be scoped by `photographer_id`.

### Tier 2: Durable Client Memory with Header-Scan
Client-specific durable memory lives in `memories`.

The Orchestrator must not load full memory blobs by default.

It must first perform a lightweight header scan:
- `id`
- `type`
- `title`
- `summary`

After the model or retrieval policy selects the relevant memory IDs, the system fetches `full_content` only for those rows.

This "header-scan first, heavy text second" pattern is mandatory for long-lived client histories.

### Tier 3: Session State
Short-horizon working memory comes from:
- the latest raw `messages`
- a rolling summary in `thread_summaries`

The model should usually see:
- the thread summary
- only the last few raw turns
- selected memory payloads
- top global knowledge hits

It should not receive the full thread by default.

## 9. APPROVAL LOOP
The human approval loop remains unchanged at a product level.

1. Inbound message arrives.
2. Orchestrator gathers facts.
3. Persona drafts the response.
4. Draft is written to `drafts` with `pending_approval`.
5. Photographer approves, rejects, or edits.
6. Approval emits an Inngest event.
7. Outbound delivery is executed and recorded.

## 10. STRICT PROHIBITIONS
- Do not reintroduce fixed linear workflows such as `triage -> specialist -> output`.
- Do not use unscoped `supabaseAdmin` queries.
- Do not allow specialist tools to send client-facing prose directly.
- Do not load full long-term memory before running a header scan.
- Do not let the frontend call providers directly.
```

## Refined Draft: `DATABASE_SCHEMA.md`

```md
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

Notes:
- A database trigger inserts a `photographers` row when a new Supabase Auth user is created.

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
- Any service-role query must prove that the parent wedding belongs to the tenant.

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
- Backend code must not treat unfiled or internal threads as globally visible.

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
- Tenant ownership must resolve through `messages.thread_id -> threads.wedding_id -> weddings.photographer_id`, or through the internal thread ownership model.
- All service-role reads and writes must prove tenant ownership before touching a row.

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
- Tenant ownership must resolve through `drafts.thread_id -> threads.wedding_id -> weddings.photographer_id`, or through the internal thread ownership model when applicable.
- Any service-role access must prove tenant ownership first.

Note:
- The checked-in code references `processing_rewrite`, but that value is not present in the current `draft_status` enum. The schema contract remains the enum defined above unless a migration adds a new status explicitly.

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
- V2 requires RLS on this table.
- The current migration disables RLS, which should be treated as implementation debt, not the target architecture.

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
- The `match_knowledge` RPC must only return rows for the provided tenant id.

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
- No memory row may be read across tenants.
- `summary` is the lightweight header-scan payload.
- `full_content` is loaded only after a memory has been selected.

### 10. `thread_summaries`
Rolling conversation summaries for token-efficient session memory.

Columns:
- `thread_id` (UUID, Primary Key, Foreign Key -> `threads.id`)
- `photographer_id` (UUID, Foreign Key -> `photographers.id`, NOT NULL)
- `summary` (TEXT, NOT NULL)
- `last_message_id` (UUID, Foreign Key -> `messages.id`, nullable)

Tenant / RLS rule:
- Must always be filtered by `.eq('photographer_id', tenantId)` in backend code.
- Summary refresh jobs must never cross tenant boundaries.
- This table is the canonical compact "story so far" state for a thread.

## 4. FUNCTIONS, RPCS, AND TRIGGERS

### `match_knowledge`
Semantic vector search RPC over `knowledge_base`.

Rules:
- Must accept tenant id as an explicit parameter.
- Must only search rows where `knowledge_base.photographer_id = tenantId`.

### `check_user_exists`
Helper RPC for email existence checks against `photographers`.

Rules:
- Must not expose cross-tenant data beyond the boolean existence contract.

### `handle_new_user` / `on_auth_user_created`
Auth trigger that inserts a row into `public.photographers` whenever a new user signs up.

## 5. RLS SUMMARY BY TABLE

Direct `photographer_id` filtering required:
- `weddings`
- `tasks`
- `knowledge_base`
- `memories`
- `thread_summaries`

Parent-chain tenant proof required:
- `clients`
- `threads`
- `messages`
- `drafts`

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
```

## Refined Draft: Section 4 For `.cursorrules`

```md
## 4. MULTI-AGENT ORCHESTRATION (ORCHESTRATOR PATTERN ONLY)
- **No Linear Waterfalls:** Do NOT implement fixed flows like `Triage -> Specialist -> Persona -> Output`. Triage may exist as a deterministic check or callable tool, but it must never be the top-level controller of the full workflow.
- **Single Controller:** Every inbound event (`comms/email.received`, `comms/web.received`, `comms/whatsapp.received`) must enter Inngest and then pass through one central Orchestrator loop.
- **Context First:** Before any model reasoning, call `buildAgentContext()` to assemble tenant-scoped state: identity, wedding context, recent messages, `thread_summaries`, memory headers from `memories`, relevant `knowledge_base` hits, and the raw inbound message.
- **Tenant Safety Is Mandatory:** Any backend query made with `supabaseAdmin` must prove tenant ownership. If the table has `photographer_id`, append `.eq('photographer_id', tenantId)`. If it does not, resolve ownership through the parent chain before reading or mutating data.
- **Use The Actual AI Runtime Already In This Repo:** For orchestration and specialist tool-calling, use the existing native OpenAI Chat Completions pattern with `tools` / `tool_calls`. For Persona drafting, use Anthropic Messages tool-calling only where brand-voice retrieval is needed. Do NOT introduce Agno, Vercel AI SDK, LangChain, or another orchestration framework unless explicitly approved.
- **Reason -> Act -> Observe:** The Orchestrator decides which tools to call, inspects results, and chooses the next action. When multiple tools are independent, it should batch them in the same reasoning round instead of chaining them one-by-one without need.
- **Specialists Are Tools:** `intake`, `logistics`, `commercial`, `concierge`, `project_management`, `studio`, memory lookup, and summary refresh logic must behave as callable tools that return structured facts, updates, confidence, and errors.
- **Persona Comes Last:** Only after the Orchestrator has assembled stable factual output may the Persona Agent write the customer-facing draft.
- **Durable Execution:** Every model call, external API call, retry boundary, and human approval wait must live inside Inngest `step.run()` / `step.waitForEvent()`. Never rely on in-memory orchestration or ad hoc background state.
```

## Final Summary

The cleanest truthful migration story for this repository is:
- the current backend is Inngest + Supabase Edge Functions
- the current AI layer is native provider API usage, not Agno or Vercel AI SDK
- the current flow is durable but mostly waterfall
- the V2 target should introduce:
  - `buildAgentContext()`
  - a central Orchestrator loop
  - batched tool calls
  - a 3-tier memory system with header-scan durable memory
  - strict multi-tenant query discipline

If this review artifact is approved, the next step would be to convert the three target files themselves to match the refined draft text and then plan the code migration path from V1 waterfall to V2 Orchestrator.
