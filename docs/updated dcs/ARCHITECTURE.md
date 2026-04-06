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

## 5B. PROACTIVE SCHEDULING (THE STATE MACHINE)
The system is not just reactive to inbound messages; it proactively drives the wedding checklist.

We use Inngest's durable execution to handle time-based triggers without relying on cron-job polling:
- **`step.sleepUntil()`:** Used for exact calendar events (e.g., waking up exactly 24 hours before a `calendar_event.start_time` to send a reminder).
- **`step.sleep('3d')`:** Used for relative follow-ups (e.g., waiting 3 days after sending an agreement to check if it was signed).
- **Event Cancellation:** If a client replies or completes an action *before* a sleep timer finishes, we emit an event (e.g., `milestone.completed`) that cancels the sleeping follow-up job using Inngest's `cancelOn` feature.

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