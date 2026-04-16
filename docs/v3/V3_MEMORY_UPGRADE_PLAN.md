# V3 Memory Upgrade Plan

## Goal
Upgrade V3 from thin memory loading to a real three-layer retrieval system without weakening the safety kernel or widening the writer boundary.

This plan reflects the current architectural direction:

- keep all retrieval inside Supabase/Postgres
- use deterministic retrieval first for case memory
- use hybrid retrieval for studio-wide knowledge
- synthesize safe approved facts for the writer instead of passing raw memory through

## Memory Model To Implement

### Layer 1: Active Context
Immediate thread-turn context already assembled at runtime:

- inbound message
- recent messages
- thread summary
- authoritative CRM snapshot

This is not a retrieval problem. It is the live context assembly already happening in:

- [buildAgentContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildAgentContext.ts)
- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)

### Layer 2: Case Memory
Wedding-specific or relationship-specific durable truth:

- approved exceptions
- payer / planner / approval-contact nuance
- wedding-specific commercial exceptions
- operational facts that should persist for this case only

This layer should be retrieved with deterministic SQL first:

- strict `photographer_id`
- then `wedding_id`, `thread_id`, relevant people, scope/type, and authorized-exception markers
- header scan first
- full record hydration only for selected rows

### Layer 3: Studio Brain
Tenant-wide reusable guidance split into two practical sublayers:

- structured studio policy from `playbook_rules`
- studio-wide reusable guidance from `knowledge_base`

`playbook_rules` should stay deterministic.

`knowledge_base` is the right place for bounded semantic retrieval using Postgres/pgvector when fuzzy matching is useful.

Do not introduce a separate vector database for this architecture.

## Truth Hierarchy

When layers conflict, V3 should resolve them in this order:

1. manual overrides, pause flags, thread automation mode, and hard locks
2. backend audience / visibility facts
3. active structured policy (`playbook_rules`)
4. selected case memory
5. global studio knowledge (`knowledge_base`)
6. current evidence in the live thread
7. escalate if still unresolved

Important safety rule:

- ordinary case memory must not silently override reusable studio policy
- only case memory explicitly marked as an authorized exception may narrow a playbook rule for that case

## Retrieval Strategy

### Case Memory Retrieval
Use deterministic retrieval first.

The first slice should not depend on standalone semantic search for memories.

Expected pattern:

1. load memory headers for the tenant / wedding scope
2. rank deterministically using:
   - wedding scope
   - thread scope
   - relevant participant ids / authority roles when available
   - memory type / scope labels
   - authorized-exception flags
   - recentness as a weak signal
3. hydrate only the top relevant rows into `selectedMemories`

**Slice 1 (implemented):** `buildDecisionContext` calls `selectRelevantMemoryIdsDeterministic` when `selectedMemoryIds` is not explicitly provided: header scan includes `wedding_id`; wedding-scoped rows outrank tenant-wide (`wedding_id` null) as fallback context; at most **5** full rows per turn via `fetchSelectedMemoriesFull` (single query). Provisional substring cues for retrieval are not policy. QA/replay can still pass explicit `selectedMemoryIds`.

### Global Knowledge Retrieval
Use hybrid retrieval inside Postgres.

Expected pattern:

1. deterministic narrowing by:
   - `photographer_id`
   - topic / action family / channel when available
2. optional pgvector ranking against `knowledge_base.embedding`
3. return only the top small set of useful rows as `globalKnowledge`

Do not retrieve the entire `knowledge_base`.

Do not create a second vector system outside Postgres.

## Writer Firewall

The writer must remain blind to raw operational memory.

Raw `selectedMemories` and `globalKnowledge` are for:

- orchestrator
- verifier
- escalation / learning paths

The writer should continue receiving only:

- approved factual synthesis
- narrow personalization
- limited continuity context

If deep memory affects the reply, the orchestrator must translate that memory into safe approved facts before the writer sees it.

Example:

- raw case memory: approved one-off travel-fee waiver because of a photographer-approved exception
- writer-facing fact bundle: `travel_fee_required = false`

The writer must not see the raw internal rationale unless it is safe and intentionally surfaced.

## Recommended Execution Order

## Phase 1
Deterministic case-memory promotion into `selectedMemories`

### Objective
Stop leaving `selectedMemories` thin by default.

### Focus
- shared selector helper for case memory
- deterministic ranking using wedding/thread/role/exception cues
- hydrate only a small chosen set
- keep writer narrow

### Pass Criteria
- `buildDecisionContext` can populate useful `selectedMemories` automatically for relevant turns
- unrelated memories are not over-fetched

## Phase 2
Hybrid global-knowledge retrieval into `globalKnowledge`

### Objective
Make `globalKnowledge` real instead of structurally present but usually empty.

### Focus
- deterministic narrowing on `playbook_rules` / `knowledge_base`
- optional pgvector ranking for `knowledge_base`
- return only the top few useful rows

### Pass Criteria
- `buildDecisionContext` can populate `globalKnowledge` for relevant turns
- retrieval stays tenant-safe and bounded

## Phase 3
Retrieval traceability

### Objective
Show which case memories and knowledge rows informed a decision.

### Focus
- selected memory ids in reports / instruction history
- selected knowledge ids in reports / instruction history
- audit visibility into why context was loaded

### Pass Criteria
- draft / escalation / QA reports can show retrieval evidence

## Phase 4
Memory scoring and access feedback

### Objective
Improve ranking quality over time.

### Focus
- importance / freshness / access metadata on `memories`
- access logging
- weak ranking improvements

### Pass Criteria
- new memory rows can be ranked more intelligently
- retrieval quality can improve without changing policy truth

## Phase 5
Scheduled memory hygiene

### Objective
Add bounded background cleanup for case/session memory only.

### Focus
- duplicate detection
- stale-memory decay
- cluster/summarize similar memories
- lineage / supersession tracking

### Pass Criteria
- case memory quality improves without mutating `playbook_rules`, CRM, or writer boundaries

## Phase 6
Safety proof

### Objective
Prove the upgrade improves retrieval quality without regressing:

- tenant isolation
- playbook authority
- audience safety
- writer boundaries

## Non-Negotiables

- all retrieval must stay scoped by `photographer_id`
- prefer database-enforced tenant safety wherever possible
- do not let self-organizing memory mutate `playbook_rules`
- do not let self-organizing memory mutate authoritative CRM
- do not widen persona access to raw operational memory
- do not treat semantic similarity as permission to override structured policy

## Inputs
- [ARCHITECTURE.md](C:/Users/Despot/Desktop/wedding/docs/v3/ARCHITECTURE.md)
- [DATABASE_SCHEMA.md](C:/Users/Despot/Desktop/wedding/docs/v3/DATABASE_SCHEMA.md)
- [STIXDB_MEMORY_HYGIENE_ADOPTION_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/STIXDB_MEMORY_HYGIENE_ADOPTION_PLAN.md)
