# V3 Production Memory Scope Plan

> **Status:** Active. Supersedes `V3_MEMORY_UPGRADE_PLAN.md`, `case_memory_promotion_slice_plan.md`, and `STIXDB_MEMORY_HYGIENE_ADOPTION_PLAN.md` for near-term memory work.
> **Scope:** The memory model that takes V3 from "designed" to production-ready for both reply-time drafting and photographer-facing assistant queries.
> **Non-goals:** Scoring, hygiene workers, clustering, LLM consolidation, TTL automation, supersession/lineage, and memory embeddings on the `memories` table. Those are explicitly deferred (§7).

---

## 1. Problem statement

The current `memories` schema uses `wedding_id` as its only scope signal. That was sufficient for V3 Phase 1: a single deterministic retrieval path into `buildDecisionContext` for wedding-linked threads. It is no longer sufficient for the product the studio actually operates.

Three concrete gaps make the one-column model inadequate:

1. **No durable person/contact memory.** A memory about a repeat client, a planner, or a venue manager can currently only attach to one wedding. When that wedding archives, the memory effectively dies. The next project for the same person starts cold. For studios whose business is built on long-term relationships, this is a real continuity loss.
2. **"Studio-wide" and "orphan" collapse into the same signal.** `wedding_id IS NULL` is used for both intentional tenant-wide notes ("we don't shoot speedlights") and orphans (a memory whose wedding got deleted). The retrieval ranker treats the whole set as "fallback," which quietly deprioritizes real studio truth.
3. **Latent cross-project leak.** `selectRelevantMemoryIdsDeterministic` ranks in-wedding = 2, null = 1, cross-wedding = 0. Cross-wedding is down-weighted but not excluded. If keyword overlap is strong and no better candidate exists, a memory from wedding B can be selected for a reply on wedding A. This is a latent leak, not a bug today, but it is the exact failure mode a production memory system must make unrepresentable.

A fourth issue is not a gap in the schema but in the retrieval surface: there is no code path today for a photographer asking Ana a direct question ("remind me what Marco's scouting requirement is"). Every memory-consuming path assumes a thread and a wedding. The assistant-query use case has no builder.

Why this matters for production: reply-time leakage is a trust-destroying failure mode. Assistant-query absence is a capability gap. Both need to be closed before the memory system can be called production-ready.

---

## 2. Production memory scopes

Five scopes. Each has a distinct lifetime, owner, and retrieval rule. Policy and CRM are listed because the distinction between them and memory must stay crisp; they are not columns on `memories`.

| # | Scope | Owner | Lifetime | Storage today | Example |
|---|---|---|---|---|---|
| 1 | **Session / thread state** | The thread | Minutes-hours | `thread_summaries` + recent messages | "Client asked a clarifying question 20 minutes ago" |
| 2 | **Project / case memory** | `weddings.id` | Life of the project | `memories` (`wedding_id = project`) | "Couple prefers morning calls; dislikes flash" |
| 3 | **Person / contact memory** | `people.id` | Life of the relationship | **Not yet a first-class scope** | "Marco at Villa Astor needs 4-hour scout" |
| 4 | **Studio-wide reusable memory** | `photographer_id` | Life of the studio | `memories` (`wedding_id IS NULL`) + `knowledge_base` | "Our default turnaround is 4 weeks" |
| 5 | **Policy / playbook** | `photographer_id` | Until revoked | `playbook_rules` + `authorized_case_exceptions` | "Commercial inquiries: draft_only" |

**CRM truth** (`weddings`, `clients`, `people`, `thread_participants`, `wedding_people`, `contact_points`) is structured, not narrative, and is not memory. Retrieval composes both: CRM as structured facts, memory as unstructured supporting notes. They never share a table or a write path.

The rule the rest of this doc depends on: **memory is supporting, policy is authoritative, CRM is structured truth.** Memory can inform a reply; only policy can govern it.

---

## 3. Retrieval contract

Two modes. One hard invariant. One writer firewall that stays closed.

### Mode A - `reply_in_thread`

Used by `buildDecisionContext` today. Produces the context for Ana drafting or reasoning about a live thread.

**Retrieval composition**

| Layer | What is retrieved | Source | Bound |
|---|---|---|---|
| Authoritative | `playbook_rules` merged with active `authorized_case_exceptions` | existing | all active |
| Authoritative | CRM snapshot (thread, wedding, participants) | existing | full for this thread |
| Primary supporting | `scope='project'` memories for the current `wedding_id` only | `memories` | cap <= 5 total across supporting |
| Primary supporting | `scope='person'` memories for `thread_participants.person_id` | `memories` | included in the 5 cap |
| Fallback supporting | `scope='studio'` memories, keyword-ranked | `memories` | cap <= 3 studio rows within the 5 cap |
| Fallback supporting | `knowledge_base` via existing gate | existing | cap <= 3 |

**Hard invariant**

> A memory with `scope='project'` whose `wedding_id` is not the current wedding must never be returned by the reply-time selector. This is a hard filter at the SQL/query-builder layer, not a soft ranker penalty.

### Mode B - `assistant_query`

New mode. Used by a new `buildAssistantContext` builder (§5). Produces the context for the photographer asking Ana a direct studio-level question.

**Retrieval composition**

| Layer | What is retrieved | Source | Bound |
|---|---|---|---|
| Authoritative | `playbook_rules` | existing | all active |
| Authoritative | CRM digest (recent weddings, recent people) | CRM | bounded digest, not full dumps |
| Primary supporting | `scope='studio'` memories | `memories` | cap <= 10 |
| Primary supporting | `knowledge_base` via existing embedding path | existing | cap <= 5 |
| Conditional supporting | `scope='project'` or `scope='person'` memories only when the operator query explicitly names the project or person, or when the UI passes `focusedWeddingId` / `focusedPersonId` | `memories` | cap <= 5 for each named entity |

**Hard invariants for assistant mode**

1. A free-form query that does not name a specific project or person must not pull project/person memory. Default scope is studio + CRM digest + policy only.
2. The output of `buildAssistantContext` is operator-facing only. It must not be consumed by any path that produces client-facing prose. A structural flag (`clientFacingForbidden: true`) on the assistant context type enforces this.
3. Auto-expansion of scope when a query names a wedding or person is logged per call for observability.

### Writer firewall

The persona writer continues to receive only synthesized bounded facts: digest lines, thread summary, last 3 messages. Raw `selectedMemories.full_content` does not cross into persona prompts.

`buildAssistantContext` does not feed the persona writer at all. If any future feature routes assistant output through a client-facing writer, the structural flag in Mode B blocks it by type.

---

## 4. Proposed schema evolution

Additive only. No rewrite. No rename.

**New columns on `memories`**

- `scope` - ENUM `('project' | 'person' | 'studio')`, NOT NULL. Canonical scope signal.
- `person_id` - UUID, nullable, FK to `people(id)` ON DELETE CASCADE. Populated only when `scope='person'`.
- `archived_at` - `TIMESTAMPTZ NULL` for soft archive.

**New CHECK constraint**

```sql
(scope='project' AND wedding_id IS NOT NULL  AND person_id IS NULL)
OR (scope='person' AND person_id IS NOT NULL AND wedding_id IS NULL)
OR (scope='studio' AND wedding_id IS NULL    AND person_id IS NULL)
```

**New partial indexes**

- `idx_memories_project ON memories(photographer_id, wedding_id) WHERE scope='project'`
- `idx_memories_person ON memories(photographer_id, person_id) WHERE scope='person'`
- `idx_memories_studio ON memories(photographer_id) WHERE scope='studio'`

**Backfill rules**

- `UPDATE memories SET scope = CASE WHEN wedding_id IS NOT NULL THEN 'project' ELSE 'studio' END`
- No row sets `scope='person'` in backfill. Person-scope is post-go-live data only.
- Pre-backfill audit: count and sample `wedding_id IS NULL` rows to surface obvious orphans misbacked as `studio`.

**Deployment shape**

Stage in two deploys to avoid blocking legacy writers:

1. Deploy 1: add columns with default `scope='studio'` and backfill, but no CHECK yet.
2. Deploy 2: update writers to set `scope` explicitly. Then add the CHECK constraint.

**`memory_type`**

Deferred. Keep the existing free-text `type` as-is until a reader actually needs a typed enum.

**RLS**

No change. `photographer_id = auth.uid()` remains the only RLS guard. Scope invariants live in application SQL/query builders, not RLS.

---

## 5. Backend integration strategy

Additive, in five independently mergeable slices.

### Affected readers

- `supabase/functions/_shared/memory/fetchMemoryHeaders.ts`
  - today uses `.or('wedding_id.eq.<w>,wedding_id.is.null')`
  - becomes scope-aware: accepts `{ weddingId?, personIds? }` and builds a three-scope filter
- `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts`
  - enforces the reply-mode hard invariant
  - excludes cross-wedding `scope='project'` rows before ranking
  - applies the studio-row cap within the overall cap
- `supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts`
  - unchanged; continues to trust its caller
- `supabase/functions/_shared/memory/buildAgentContext.ts`
  - signature grows an optional `personIds` input and threads it to the header fetch
- `supabase/functions/_shared/context/buildDecisionContext.ts`
  - passes `thread_participants.person_id` values through to `buildAgentContext`
  - remains `reply_in_thread`-only
- `supabase/functions/_shared/context/fetchRelevantGlobalKnowledgeForDecisionContext.ts`
  - unchanged; `knowledge_base` stays tenant-wide

### Affected writers

- `supabase/functions/_shared/captureDraftLearningInput.ts`
  - sets `scope` explicitly on every insert
  - optionally populates `person_id` when deterministically derivable
- learning-loop RPC `complete_learning_loop_operator_resolution`
  - adds `p_scope` and `p_person_id` parameters with defaults

### Why `buildAssistantContext` is separate

`buildDecisionContext` is deeply thread/wedding-centric. For assistant queries there is no thread and often no wedding. Adding a mode flag would fork nearly every step into branches and bloat the function.

A separate `buildAssistantContext({ supabase, photographerId, queryText, focusedWeddingId?, focusedPersonId? })` is smaller, clearer, and can reuse the real primitives:

- `selectRelevantMemoryIdsDeterministic`
- `fetchSelectedMemoriesFull`
- `fetchActivePlaybookRulesForDecisionContext`
- `fetchRelevantGlobalKnowledgeForDecisionContext`
- `deriveEffectivePlaybook`

### Safest integration path

1. Ship the schema, no logic change.
2. Harden the selector against cross-project leak using the new `scope` column.
3. Teach writers to set `scope` explicitly; add the CHECK constraint after writer migration.
4. Wire person-scope retrieval into `buildDecisionContext`.
5. Add `buildAssistantContext` as a new surface.

---

## 6. Implementation sequence

### Slice 1 - Schema additive migration

- add `scope` (ENUM, default `'studio'`), `person_id` (nullable FK), `archived_at` (nullable)
- backfill `scope` from `wedding_id`
- add partial indexes
- regenerate `src/types/database.types.ts`
- no code changes

Rollback: drop columns.

### Slice 2 - Selector hardening (cross-project invariant)

- update `fetchMemoryHeaders` to accept `{ weddingId?, personIds? }` and build the three-scope filter using `scope`
- update `selectRelevantMemoryIdsDeterministic` to exclude `scope='project' AND wedding_id != current`
- add the studio-row cap within the overall cap
- add regression tests locking in the invariant

Rollback: revert selector.

### Slice 3 - Writer updates + CHECK constraint

- update `captureDraftLearningInput.ts` to set `scope` on every insert
- update the learning-loop RPC to accept `p_scope` + `p_person_id`
- after writer migration, add the CHECK constraint in a follow-up migration

Rollback: revert writers and drop CHECK.

### Slice 4 - Person-scope retrieval in `reply_in_thread`

- `buildDecisionContext` forwards `thread_participants.person_id` values into the selector
- selector includes `scope='person'` memories whose `person_id` matches a participant
- add tests proving selection only happens for participating people

Rollback: ignore `personIds` in the selector.

### Slice 5 - `buildAssistantContext`

- new file: `supabase/functions/_shared/context/buildAssistantContext.ts`
- new `AssistantContext` type carries `clientFacingForbidden: true`
- mandatory structured log per call:
  - `queryText`
  - `scopesQueried`
  - `autoExpansions`
  - `memoryIdsReturned`
- no UI caller required in this slice

Rollback: delete the file.

---

## 7. Explicitly deferred

These are not part of this plan.

| Deferred item | Why deferred | Unblock signal |
|---|---|---|
| Memory scoring fields | Ranker already works at a 5-row cap. No clear consumer yet. | A single tenant has > 200 memories on a hot wedding and operators report irrelevant memory selection. |
| Memory access logging | Write amplification on every context build. | Scoring is being introduced. |
| Scheduled hygiene worker | Solves bloat that does not exist yet. | Dedup incidents > 10/week per tenant or single-tenant memory count > 10k. |
| Clustering / consolidation / LLM summarization | Rewrites the authoritative corpus and loses provenance. | Not unblocked without an explicit product decision. |
| Memory embeddings on `memories` | Duplicates `knowledge_base`; deterministic ranker is adequate at current scale. | Per-wedding memory rows > 50 and operators report miss on keyword search. |
| TTL / auto-prune | No safe retention policy exists yet. | A written retention policy is validated by operators. |
| Supersession / lineage | Soft-delete + edit covers the real use case today. | Operators explicitly need corrected-memory audit chains. |
| Full sweeping safety-proof harness | Replaced by a narrow writer-firewall integration test. | Not reopened. |

---

## 8. Risks / migration traps

- **Cross-project leak in reply mode.** The single worst failure mode. Enforce in SQL/query builders, not only in ranking.
- **Backfill misclassification.** `wedding_id IS NULL -> scope='studio'` can sweep up orphan rows. Audit before backfill.
- **CHECK constraint blocks legacy writes.** Stage it only after writers are updated.
- **Person-scope privacy.** Person memories should surface only when that person is actually in scope for the reply path.
- **Assistant-query overreach.** Free-form operator queries must default to studio scope unless a project/person is explicitly named.
- **Studio-memory firehose.** Cap studio rows in reply mode.
- **Person FK deletion behavior.** `ON DELETE CASCADE` means the memory dies with the person. Accept this intentionally or revisit explicitly later.
- **Assistant-mode bypassing the writer firewall.** Guard with `clientFacingForbidden: true`.
- **Type churn.** `selectedMemories` row shape gains `scope` + `person_id`. Update fixtures in one coordinated pass.
- **Performance at scale.** Add a header cap (for example 200 rows) in selector-related work before any tenant grows large.
- **Doc drift.** The old plan docs are already stale and should not remain co-equal with this one.

---

## 9. Required tests

### Cross-project leak prevention

- a memory with `scope='project'` on wedding B is never returned for a thread on wedding A, even with identical keywords
- a memory with `scope='project'` on wedding A is returned for wedding A

### Person-scope retrieval

- a `scope='person'` memory on person X is selectable in any thread where X is a `thread_participant`
- it is not selectable where X is not a participant

### Writer firewall

- persona writer never receives raw `selectedMemories.full_content`
- persona writer input includes only synthesized digest lines, thread summary, last 3 messages, and approved facts
- add an integration test with a canary string in memory `full_content` and verify it never appears in persona input

### Assistant-query scope behavior

- unscoped operator query retrieves only studio memory + policy + CRM digest + `knowledge_base`
- naming a wedding or person explicitly expands scope deterministically and logs the expansion
- `focusedWeddingId` / `focusedPersonId` overrides query-text expansion
- `AssistantContext` carries `clientFacingForbidden: true`

### Schema invariants

- CHECK constraint rejects invalid combinations
- backfill leaves existing rows valid
- `archived_at IS NOT NULL` rows are not returned by selectors

### Writer path typing

- `captureDraftLearningInput.ts` and learning-loop writes always set `scope`
- idempotency still works after the write changes

---

## 10. Status / doc cleanup guidance

| Prior doc | Disposition |
|---|---|
| `docs/v3/V3_MEMORY_UPGRADE_PLAN.md` | Mark as superseded for near-term work by this plan. |
| `docs/v3/case_memory_promotion_slice_plan.md` | Mark as implemented and point to the live selector/header files. |
| `docs/v3/STIXDB_MEMORY_HYGIENE_ADOPTION_PLAN.md` | Move to research/deferred status; it is not near-term work. |
| `docs/v3/V3_CAPABILITIES_STATUS.md` | Update the memory section to reflect this plan's slices and the deferred list. |
| `docs/v3/ARCHITECTURE.md` | Keep authoritative; add a small subsection pointing to this plan. |
| `docs/v3/DATABASE_SCHEMA.md` | Update after Slice 1 ships. |

Going forward: one active memory plan doc at a time.

---

## Appendix - One-line summary

**Add `scope` and `person_id` to `memories`, make cross-project leakage unrepresentable in reply mode, build a separate `buildAssistantContext` for photographer-facing queries, and defer everything else until a real product signal requires it.**
