# Implementation Handover — Memories, Ana, and Thread-Analysis Work (v3, ground-truth verified)

**Date:** 2026-04-22
**For:** The implementation agent picking up this work chain.
**Status:** Every statement in §3–§5 below is verified against the live code at commit `7fea3b9` (the current HEAD on this worktree). No code has been changed in this session. Your job is to draft slice plans from this document and execute them only after the operator confirms.

---

## 0. Corrections against the earlier verdict document (critical — read first)

The earlier verdict document `MEMORIES_SYSTEM_VERDICT_AND_THREAD_ANALYSIS_CONTEXT.md` (2026-04-22) described the system as if it was in an older state. **Multiple pieces of work it proposed have already been shipped in prior commits** (`1384f27 feat(prod-readiness): slice 1-3 application changes`, `58a9de5 feat: offer builder Supabase persistence and Ana studio profile grounding v1`, and `7fea3b9 feat(operator-ana): streaming composer, context tools, insert actions, carry-forward`). The operator did not personally execute those commits during this planning session — they were merged from prior work.

**What is ALREADY LIVE (do not re-propose these):**

1. `memories.scope` enum (`project | person | studio`), `memories.person_id`, `memories.archived_at`, CHECK constraint enforcing mutual exclusion, and scope-specific partial indexes. (Migrations `20260522120000_memories_production_scope_slice1.sql` + `20260523120000_memories_scope_slice3_check.sql`.)
2. `fetchMemoryHeaders` already filters `archived_at IS NULL` and respects the three-scope model with `replyModeMemoriesOrFilter`.
3. The ranker in `selectRelevantMemoriesForDecisionContext.ts` already handles the three scopes with `MAX_STUDIO_MEMORIES_IN_REPLY = 3` sub-cap.
4. The Ana widget's memory-note proposal already sends `scope`, `weddingId`, and `personId` end-to-end. The `insert-operator-assistant-memory` edge function already validates the tenant and scope shape before inserting.
5. **Ana triage v1 is live**, with six domains (not four as I originally proposed): `project_crm | inbox_threads | inquiry_counts | operator_queue | studio_analysis | unclear`. See `src/lib/operatorAnaTriage.ts`, called from `buildAssistantContext.ts:273`, rendered by the formatter at `formatAssistantContextForOperatorLlm.ts:651`, referenced in the system prompt.
6. **Studio business profile grounding is live.** `AssistantContext.studioProfile` exists. `fetchAssistantStudioBusinessProfile` pulls from `studio_business_profiles` + `photographers.settings` identity fields. The formatter renders a Studio Profile block. The system prompt explains "capability boundary, not authority."
7. **Title/body honesty fix is live.** System prompt has an explicit paragraph: "A thread title is never a substitute for body text when excerpts are absent." The thread-activity block in the formatter has an "Envelope only" inline reminder.
8. **Thread-lookup stop-word fix is partially shipped.** `TOPIC_STOP` in `src/lib/operatorAssistantThreadMessageLookupIntent.ts` already contains `regarding`, `received`, `somebody`, `someone`, `maybe`, `today`, `yesterday`, `quick`, `question`, plus `anybody`, `anyone`, `everyone`, `perhaps`, and more. **Missing: `tomorrow`, `inquiry`, `inquiries`.**
9. `compassion_pause` and `strategic_pause` boolean columns already exist on the `weddings` table. The propagation logic (gating automations) may still be incomplete; verify per automation surface.
10. Offer builder is server-persisted in `studio_offer_builder_projects` (`puck_data JSONB`). Ana's context includes a bounded offer-builder read. localStorage is no longer the single source.

**What is NOT yet shipped (the real remaining work):**

1. `memories.supersedes_memory_id` (self-FK) + `memories.last_accessed_at` — no migration adds these.
2. Magic-string ranker cues (`PROVISIONAL_STRONG_SUBSTRINGS = ['authorized_exception', 'v3_verify_case_note']` + `\bexception\b`) **still present** in `selectRelevantMemoriesForDecisionContext.ts`. Need removal.
3. Exclusion of superseded memories from ranking (needs column first).
4. `last_accessed_at` touch on top-5 hydration (needs column first).
5. Write-site convention: memory summaries must encode decision/outcome. Not structurally enforced today.
6. Stop-word additions: `tomorrow`, `inquiry`, `inquiries`.
7. Strong-clause tightening in `fetchAssistantThreadMessageLookup.ts:226–238`. Current code has `topicHits >= 1 && signals.recency != null && recencyOk`. The diagnosis in the thread analysis recommended `topicHits >= 2`. Still `>= 1`.
8. All six Phase 2 adjacent systems from the thread analysis (verbal capture, audience tier, inquiry dedup, life-event pause propagation logic, billing separation columns, contract amendment table) — green-field.

---

## 1. Reading order

1. **This document** — for accurate current state + remaining work.
2. `docs/v3/REAL_THREADS_ANALYSIS_AND_PROPOSALS.md` — the 20 patterns from 8 real projects; the six adjacent-system roadmap.
3. `docs/v3/MEMORIES_SYSTEM_VERDICT_AND_THREAD_ANALYSIS_CONTEXT.md` — historical context for memory decisions, **noting the §0 corrections above**.

Older docs are historical thinking; they are superseded by this handover on any point of disagreement.

---

## 2. Product frame

Photographer + videographer operator CRM. Multi-tenant. `project_type ∈ {wedding, commercial, video, other}`. Strict RLS by `photographer_id` on every table. Two AI paths:

- **Client-facing reply pipeline** (persona writer, Claude-based, strict firewall).
- **Operator-facing assistant "Ana"** (gpt-4.1-mini, tool loop, propose-confirm writes only).

Every feature must respect `project_type` and avoid wedding-only vocabulary. Generalise to commercial / editorial / portrait / video work.

---

## 3. Actual current state of the memory subsystem (verified 2026-04-22)

### 3.1 `memories` table — exact live shape

From `src/types/database.types.ts` lines 1199–1271 (generated from the live schema):

| Column | Type | Null? | Notes |
|---|---|---|---|
| `id` | uuid | not null | PK, default `gen_random_uuid()` |
| `photographer_id` | uuid | not null | CASCADE on delete from photographers |
| `wedding_id` | uuid | null | SET NULL on delete from weddings. Required when `scope='project'`, must be NULL otherwise |
| `person_id` | uuid | null | **CASCADE** on delete from people (note: not SET NULL). Required when `scope='person'`, must be NULL otherwise |
| `scope` | `memory_scope` enum | not null | `'project' \| 'person' \| 'studio'` |
| `archived_at` | timestamptz | null | Soft-archive. `NULL = active`. `fetchMemoryHeaders` filters `IS NULL`. |
| `type` | text | not null | Informally one of `escalation_case_decision`, plus Ana-proposed values. Not enum-constrained. |
| `title` | text | not null | Clipped ≤120 chars at write |
| `summary` | text | not null | Clipped ≤400 chars at write |
| `full_content` | text | not null | Clipped ≤8000 chars at write |
| `source_escalation_id` | uuid | null | SET NULL on delete from escalation_requests |
| `learning_loop_artifact_key` | text | null | Idempotency key per artifact |

**CHECK constraint `memories_scope_shape_check`:**

```sql
CHECK (
  (scope = 'project' AND wedding_id IS NOT NULL AND person_id IS NULL)
  OR (scope = 'person'  AND person_id IS NOT NULL AND wedding_id IS NULL)
  OR (scope = 'studio'  AND wedding_id IS NULL AND person_id IS NULL)
)
```

**Three mutually-exclusive scopes. No intersectional (wedding+person) combination is permitted.** If the operator decides to allow the intersectional case, the CHECK must be relaxed in a separate migration (see §4.7 of the older verdict doc for the reasoning; current recommendation is **preserve three scopes**).

**Indexes live:**
- `idx_memories_photographer_id`
- `idx_memories_wedding_id`
- `idx_memories_project` on (photographer_id, wedding_id) WHERE scope='project'
- `idx_memories_person` on (photographer_id, person_id) WHERE scope='person'
- `idx_memories_studio` on (photographer_id) WHERE scope='studio'
- Partial unique on (photographer_id, source_escalation_id, learning_loop_artifact_key) WHERE both non-null

**RLS:** `photographer_id = (SELECT auth.uid())` on both USING and WITH CHECK.

**Columns NOT present (to be added in the remaining Phase 1 slice):**
- `supersedes_memory_id uuid NULL REFERENCES memories(id) ON DELETE SET NULL`
- `last_accessed_at timestamptz NULL`

### 3.2 Memory write paths — live

**Two RPCs:**

1. `public.complete_escalation_resolution_memory(p_photographer_id, p_wedding_id, p_escalation_id, p_title, p_summary, p_full_content, p_learning_outcome) RETURNS uuid` — writes single `escalation_case_decision` memory. Scope auto-derived (`project` if `p_wedding_id NOT NULL`, else `studio`). Idempotent via prefix-search in `full_content`. SECURITY DEFINER, granted to `service_role`.

2. `public.complete_learning_loop_operator_resolution(p_photographer_id, p_escalation_id, p_wedding_id, p_thread_id, p_learning_outcome, p_artifacts jsonb) RETURNS jsonb` — multi-artifact RPC accepting an array of `{kind: 'memory' | 'authorized_case_exception' | 'playbook_rule_candidate', ...}`. The memory artifact currently accepts `weddingId`, `memoryType`, `title`, `summary`, `fullContent`, `learningLoopArtifactKey`. **It hard-codes `person_id = NULL`** — i.e. this RPC does not create person-scoped memories today.

**One edge function:**

`supabase/functions/insert-operator-assistant-memory/index.ts` — backs the Ana widget's memory-note confirmation chip. Accepts `memoryScope`, `title`, `summary`, `fullContent`, `weddingId`, `personId`. Validates per-scope shape. Checks tenant ownership of the wedding or person before inserting. Sets `scope` explicitly.

**What does not write memories:** inbound triage, persona writer, onboarding, background jobs.

### 3.3 Memory read path — live

1. `fetchMemoryHeaders(supabase, photographerId, weddingId, { replyModeParticipantPersonIds })` in `supabase/functions/_shared/memory/fetchMemoryHeaders.ts`:
   - Query selects `id, wedding_id, scope, person_id, type, title, summary`.
   - `.is("archived_at", null)` — **archived rows are correctly filtered.**
   - PostgREST `.or(...)` builds the reply-mode filter: project rows matching the wedding, all studio rows, person rows for participant IDs only. Without wedding + without participants, falls back to "all project + all studio, exclude person."

2. `selectRelevantMemoryIdsDeterministic(input)` in `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts`:
   - Three-tier sort: `scopePrimaryRank`, `provisionalTextCueRank`, `keywordOverlapScore`.
   - `scopePrimaryRank`: 2 for in-scope project or for in-thread person; 1 for studio fallback with wedding in scope; 0 otherwise.
   - **`provisionalTextCueRank` still uses the magic strings** — this is what Phase 1 needs to remove.
   - Cap `MAX_SELECTED_MEMORIES = 5`; sub-cap `MAX_STUDIO_MEMORIES_IN_REPLY = 3` when wedding in scope.
   - Does **not** exclude superseded rows today (column doesn't exist).
   - Does **not** touch `last_accessed_at` (column doesn't exist).

3. `fetchSelectedMemoriesFull` — selects `id, type, title, summary, full_content` for the selected IDs, filtered by `photographer_id`. Preserves caller order.

### 3.4 Persona writer firewall — live constants

From `supabase/functions/_shared/persona/personaAgent.ts`:

- `PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4` — max memory headers passed to the writer.
- `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200` — per-header summary truncation.
- Writers receive headers only. Full `full_content` never reaches client-facing writers.

**Do not raise these constants or bypass this firewall.** See §7 red lines.

### 3.5 Adjacent stores (grounding hierarchy — these stay separate)

| Store | Purpose | Merged into policy? |
|---|---|---|
| `playbook_rules` | Studio-wide authority policy | Yes, via `deriveEffectivePlaybook` |
| `authorized_case_exceptions` | Scoped policy overrides (wedding / thread) | Yes, via `deriveEffectivePlaybook` |
| `playbook_rule_candidates` | Staged reusable patterns awaiting human promotion | No (inert until promoted) |
| `knowledge_base` | Studio-wide semantic knowledge (pgvector 1536-dim) | No (advisory) |
| `memories` | Case-specific episodic facts (this subsystem) | No (advisory) |
| `thread_summaries` | Rolling session state per thread | No (ephemeral) |
| `weddings.story_notes` | Operator-authored project narrative | No (human edit only) |

Do not collapse any of these into each other.

---

## 4. Phase 1 remaining work — narrow, concrete, and well-scoped

### 4.1 New migration: `supersedes_memory_id` + `last_accessed_at`

**Naming:** `supabase/migrations/YYYYMMDDhhmmss_memories_supersession_and_access.sql`.

**Proposed DDL (draft — operator must confirm):**

```sql
-- Phase 1 completion: memory supersession + last-accessed tracking.
-- Mirrors the `playbook_rule_candidates.superseded_by_id` pattern (20260421120000).
-- Additive only; existing rows unaffected; rollback is a column drop + index drop.

ALTER TABLE public.memories
  ADD COLUMN supersedes_memory_id UUID NULL REFERENCES public.memories(id) ON DELETE SET NULL,
  ADD COLUMN last_accessed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.memories.supersedes_memory_id IS
  'When set, this row supersedes the referenced older memory. Older row is filtered from ranking.';

COMMENT ON COLUMN public.memories.last_accessed_at IS
  'Touched when this memory reaches top-5 hydration. Foundation for future decay/hygiene; not a freshness gate today.';

-- Finds the set of IDs that have been superseded (for exclusion during ranking).
CREATE INDEX idx_memories_superseded_source
  ON public.memories (supersedes_memory_id)
  WHERE supersedes_memory_id IS NOT NULL;
```

**RLS:** unchanged — existing tenant policy covers the new columns.

**Rollback (comment in migration):**
```sql
-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_memories_superseded_source;
-- ALTER TABLE public.memories DROP COLUMN IF EXISTS last_accessed_at;
-- ALTER TABLE public.memories DROP COLUMN IF EXISTS supersedes_memory_id;
```

### 4.2 Ranker cleanup in `selectRelevantMemoriesForDecisionContext.ts`

**Changes:**

1. **Remove `PROVISIONAL_STRONG_SUBSTRINGS` constant and `provisionalTextCueRank` function.** Remove the call site. Update the sort to two tiers: `(scopePrimary, keywordScore, id)`.

2. **Exclude superseded memories.** Extend `MemoryHeader` in `fetchMemoryHeaders.ts` to include `supersedes_memory_id: string | null`. In the ranker, compute the set of IDs that appear as `supersedes_memory_id` on any header in the input set, and filter them out before ranking. Pure logic, unit-testable.

3. **`fetchMemoryHeaders` query must include the new column.** Change the select to `"id, wedding_id, scope, person_id, type, title, summary, supersedes_memory_id"` and surface it in the returned shape.

4. **Touch `last_accessed_at` after hydration.** After `fetchSelectedMemoriesFull` returns, fire-and-forget an `UPDATE memories SET last_accessed_at = now() WHERE id = ANY(ids) AND photographer_id = ...`. Do not block context assembly on the update. Add a small helper `touchMemoryLastAccessed(supabase, photographerId, ids)` next to `fetchSelectedMemoriesFull`.

5. **Note on `archived_at`:** already filtered in `fetchMemoryHeaders`. No change needed there; verify the test for it exists.

### 4.3 Stop-word fix completion

**File:** `src/lib/operatorAssistantThreadMessageLookupIntent.ts`, the `TOPIC_STOP` set.

**Already present (from a prior commit):** `regarding received somebody someone anybody anyone everyone maybe perhaps today yesterday week recently quick question questions career student project projects thing things stuff idea ideas` (and many more).

**Still missing:** `tomorrow`, `inquiry`, `inquiries`.

**Also tighten** the `strong` clause in `fetchAssistantThreadMessageLookup.ts` (around lines 226–238). Current live code:

```ts
const recencyTopicStrong =
  topicHits >= 1 &&
  signals.recency != null &&
  recencyOk &&
  (!openInboxLookup || score >= 12);
```

The thread analysis recommends `topicHits >= 2` here. Operator-confirm which; recommendation is the tighter form because the looser form is what produced the skincare-vs-student-project miss that motivated the stop-word list in the first place.

### 4.4 Write-site convention enforcement

Memory summaries should encode the **decision/outcome**, not just the topic. This is the fix for the writer-starvation concern without lifting the persona firewall.

**Enforcement points:**

1. `complete_escalation_resolution_memory` RPC: operator confirms whether to accept a new optional `p_decision TEXT` parameter that the RPC composes into summary with a deterministic prefix. Backward-compatible: if omitted, summary flows through as today. Log a warning when missing.

2. `insert-operator-assistant-memory` edge function: same change. Ana's memory-note proposal must include a decision/outcome field.

3. Ana system prompt update: when Ana proposes `memory_note`, she must include the decision. Validate in the JSON parser.

4. **Do not** enforce a natural-language CHECK constraint on summary text in SQL — brittle.

### 4.5 Types to update

- `MemoryHeader` in `fetchMemoryHeaders.ts` — add `supersedes_memory_id: string | null`.
- `src/types/database.types.ts` — regenerate after the migration lands.
- Tests/fixtures that construct `MemoryHeader` — add the new field.

### 4.6 Tests required

In `selectRelevantMemoriesForDecisionContext.test.ts`:

- Superseded chain: `memA` ← `memB.supersedes_memory_id = memA`. Ranking returns only `memB`.
- Deep chain: A ← B ← C. Only C appears.
- Broken chain: if the referenced ancestor is deleted, ON DELETE SET NULL clears the pointer, reverts to tip.
- Removal of magic-string boost: a memory whose title contains `"authorized_exception"` does not outrank a more-matching memory on substring alone.

In the `fetchMemoryHeaders.test.ts` (if exists, else add):

- `archived_at IS NOT NULL` rows are excluded.
- New `supersedes_memory_id` field surfaces correctly.

### 4.7 Feature flags and rollout

Phase 1 remaining work is additive and low-risk. **No feature flag needed for the migration.** If you want belt-and-braces, wrap the "exclude superseded" filter in an env-gated flag (e.g. `MEMORY_SUPERSEDE_FILTER_ENABLED = "true"`) for 48h after deploy.

### 4.8 Observability

Extend the existing memory-retrieval telemetry JSON line (or add one if not present) to include:

```json
{
  "type": "memory_retrieval",
  "photographer_id": "...",
  "wedding_id": "...",
  "headersScanned": N,
  "archivedFiltered": N,
  "supersededFiltered": N,
  "selectedIds": [...],
  "studioPickedCount": N,
  "maxScopePrimaryRank": 2
}
```

---

## 5. Phase 0 remaining items (narrow)

### 5.1 Thread-lookup fix completion

Already described in §4.3. Three stop-words + one clause tightening + tests. ~10 LOC + ~25 LOC tests. **Ship alone.**

### 5.2 (All other Phase 0 items from earlier handover are DONE)

- Title/body honesty: **done**
- Ana triage v1 (6 domains, not 4): **done**
- Studio business profile read-only grounding: **done**

**Do not re-propose these. They are live.**

---

## 6. Phase 2 adjacent systems — concrete architecture maps

From `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md` §6. Ranked by leverage. Plan each as its own slice; do not batch.

### 6.1 Verbal / offline capture workflow (highest-leverage Phase 2)

**Problem:** 6 of 8 real projects lost context to WhatsApp / phone / in-person / Zoom decisions that never reached email. No current write path for "I just agreed to X offline — remember this."

**Green-field.** No existing `verbal_capture*`, `offline_capture*`, `manual_capture*`, or `operator_note*` tables.

**Proposed new table (draft DDL — operator must confirm):**

```sql
CREATE TABLE public.verbal_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID NULL REFERENCES public.weddings(id) ON DELETE SET NULL,
  person_id UUID NULL REFERENCES public.people(id) ON DELETE SET NULL,
  thread_id UUID NULL REFERENCES public.threads(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('phone', 'whatsapp', 'instagram_dm', 'in_person', 'zoom', 'other')),
  operator_text TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  classified_as TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classified_as IN ('unclassified', 'memory', 'task', 'rule_candidate', 'amendment', 'dismissed')),
  promoted_memory_id UUID NULL REFERENCES public.memories(id) ON DELETE SET NULL,
  promoted_task_id UUID NULL REFERENCES public.tasks(id) ON DELETE SET NULL,
  promoted_candidate_id UUID NULL REFERENCES public.playbook_rule_candidates(id) ON DELETE SET NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'confirmed', 'dismissed')),
  operator_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_verbal_captures_photographer_review
  ON public.verbal_captures (photographer_id, review_status);
CREATE INDEX idx_verbal_captures_wedding
  ON public.verbal_captures (photographer_id, wedding_id);
CREATE INDEX idx_verbal_captures_person
  ON public.verbal_captures (photographer_id, person_id);
CREATE INDEX idx_verbal_captures_recent
  ON public.verbal_captures (photographer_id, captured_at DESC);

-- RLS
ALTER TABLE public.verbal_captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verbal_captures_tenant_isolation" ON public.verbal_captures
  FOR ALL
  USING (photographer_id = (SELECT auth.uid()))
  WITH CHECK (photographer_id = (SELECT auth.uid()));
```

**RPC for promotion (mirrors `complete_learning_loop_operator_resolution` pattern):**

```
public.promote_verbal_capture(
  p_photographer_id UUID,
  p_capture_id UUID,
  p_target TEXT,        -- 'memory' | 'task' | 'rule_candidate' | 'amendment' | 'dismissed'
  p_payload JSONB        -- target-specific
) RETURNS JSONB
```

Atomic multi-table write. Idempotency via `(capture_id, target)` — second call returns existing result.

**Integration with memory (when `p_target = 'memory'`):**

1. Adds `memories.source_verbal_capture_id UUID NULL REFERENCES verbal_captures(id) ON DELETE SET NULL` column in the same migration.
2. Inserts into memories with scope derived from capture: `person` if `person_id` present and no `wedding_id`, `project` if `wedding_id` present, `studio` otherwise.
3. Updates `verbal_captures.promoted_memory_id` and `review_status = 'confirmed'`.

**Ana integration:**

- New proposedAction kind `"verbal_capture"` in the operator-widget LLM schema. Fields: `{ channel, operatorText, weddingId?, personId?, threadId? }`.
- New confirmation chip in `SupportAssistantWidget.tsx` — calls new edge function `insert-operator-verbal-capture`.
- After capture, Ana proposes classification via a follow-up chip ("This sounds like a memory about [person] — save to memory?").

**Dependencies:** requires Phase 1 `supersedes_memory_id` (a verbal capture may supersede a prior memory).

**Slice size estimate:** migration ~120 LOC, RPC ~200 LOC, types + edge function + Ana widget chip + tests ≈ 600–800 LOC total. Largest Phase 2 slice.

### 6.2 Thread participant + audience / visibility model

**Problem:** Planner-tier threads hold facts that must not leak to couple-tier replies. Today's schema has only `visibility_role` text on `thread_participants` (no role enum, no audience tier on threads).

**Green-field** for enum/tier. Existing columns verified:
- `thread_participants`: `is_cc`, `is_recipient`, `is_sender`, `visibility_role` (string)
- `threads`: no `audience_tier` column

**Proposed changes:**

```sql
ALTER TABLE public.thread_participants
  ADD COLUMN role TEXT NOT NULL DEFAULT 'other'
    CHECK (role IN ('couple', 'planner', 'venue', 'vendor', 'family', 'assistant', 'operator_internal', 'other'));

ALTER TABLE public.threads
  ADD COLUMN audience_tier TEXT NOT NULL DEFAULT 'client_facing'
    CHECK (audience_tier IN ('client_facing', 'planner_tier', 'operator_internal'));

CREATE INDEX idx_thread_participants_role
  ON public.thread_participants (photographer_id, role);
```

**Integration with memory:** add optional `memories.audience_source_tier TEXT NULL` column (same CHECK values). When a verbal capture or escalation is written from a specific thread, its audience tier is copied. Ranking then prefers memories whose audience tier is equal or looser than the current reply tier. Persona writer's continuity-header input filters to audience tier that's visible to the current recipient.

**Slice size estimate:** migration ~40 LOC, ranker extension ~40 LOC, persona-writer gate ~30 LOC, operator tools to set tier ~50 LOC, tests. Medium slice.

### 6.3 Inquiry dedup / entity resolution on intake

**Problem:** J&A and P&R projects had same-wedding double-quotes because planner and couple inquired through different entry points. No current dedup.

**Green-field.** No `inquiry_dedup*`, `entity_match*`, `dedup*` tables exist.

**Proposed new table:**

```sql
CREATE TABLE public.inquiry_dedup_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  new_inquiry_source TEXT NOT NULL,    -- 'email_thread' | 'web_form' | 'manual'
  new_inquiry_ref UUID NOT NULL,       -- thread_id or form submission id
  existing_wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  match_score REAL NOT NULL CHECK (match_score >= 0 AND match_score <= 1),
  match_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'linked', 'kept_separate', 'dismissed')),
  linked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Matching algorithm** (deterministic, runs on new inquiry intake):
- Fuzzy client-name match against recent `weddings.couple_names` + `people.display_name` (similarity threshold).
- Event-date proximity (±7 days against `weddings.wedding_date`).
- Venue substring match against `weddings.location`.
- Planner email-domain match (derived from `threads.participants`).
- Score → if above threshold, create a row and surface in operator review queue.

**No direct memory integration** — runs before memories come into play.

**Slice size:** matching ~200 LOC, migration ~40 LOC, review UI ~150 LOC, tests. Medium-large.

### 6.4 Life-event pause propagation

**Status:** the columns already exist. `weddings.compassion_pause` and `weddings.strategic_pause` are live booleans. **The propagation / gate-all-automations logic may be incomplete.**

**Verification task (before writing any code):** grep every automation surface for a check against these columns. Specifically:
- Every edge function that sends an automated reply or drip.
- Every Inngest function that processes threads.
- The orchestrator `maybeRewriteOrchestratorDraftWithPersona`.
- Any scheduled jobs.

If any of these do not gate on `compassion_pause = false AND strategic_pause = false`, they leak through the pause. List the gaps, propose a slice that adds the gate consistently.

**Enhancements (if needed):**

```sql
ALTER TABLE public.weddings
  ADD COLUMN compassion_pause_until TIMESTAMPTZ NULL,
  ADD COLUMN compassion_reason TEXT NULL;

COMMENT ON COLUMN public.weddings.compassion_pause_until IS
  'If set, compassion_pause is logically true until this time, then auto-clears.';
```

The existing boolean becomes a compatibility alias; the time-bounded version is the operationally useful one.

**Memory integration:** memory retrieval surfaces an active pause at `scope_primary_rank = 3` (higher than any other rank, making it always appear first in selected memories) so Ana sees it every turn.

**Slice size:** small — audit pass + a handful of gate checks + optional column extension + tests. Small.

### 6.5 Billing separation workflow

**Status:** `wedding_people` already has `is_billing_contact`, `is_payer`, `is_approval_contact`, `must_be_kept_in_loop` boolean flags. **Billing entity/address/currency columns do NOT exist** on `wedding_people`.

**Proposed new columns on `wedding_people`:**

```sql
ALTER TABLE public.wedding_people
  ADD COLUMN billing_entity_name TEXT NULL,
  ADD COLUMN billing_address JSONB NULL,      -- structured address
  ADD COLUMN billing_currency TEXT NULL       -- ISO 4217, e.g. 'EUR', 'GBP', 'USD', 'RSD'
    CHECK (billing_currency IS NULL OR char_length(billing_currency) = 3);
```

**Workflow:** at contract-accept time (or on first invoice), Ana proposes a billing capture chip. The chip sets `is_billing_contact = true` + the three new columns for the specified person. Subsequent invoice generation reads from `wedding_people` joined to `people`.

**Memory integration:** a billing-routing change (e.g. "Serbia bank blocked; use UK account") is written as a **person-scoped memory** (now possible — Phase 1 made `scope='person'` reachable from Ana's memory-note chip). `supersedes_memory_id` handles later routing changes.

**Slice size:** ~30 LOC migration + workflow wiring + Ana chip extensions + tests. Small-medium.

### 6.6 Contract amendment / scope-change data model

**Problem:** Soft commitments ("up to 2h brunch") never become binding amendments. Upsells accepted verbally or in email chat without addendum. P11, P19 from thread analysis.

**Green-field.** No `amendment*`, `scope_change*`, or `addendum*` tables exist.

**Proposed new table:**

```sql
CREATE TABLE public.project_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL
    CHECK (change_type IN ('pricing', 'scope_add', 'scope_remove', 'timeline_change', 'team_change', 'payment_schedule_change', 'deliverable_change', 'other')),
  old_value JSONB NULL,
  new_value JSONB NOT NULL,
  rationale TEXT NULL,
  source_kind TEXT NOT NULL
    CHECK (source_kind IN ('email', 'verbal_capture', 'manual')),
  source_email_message_id UUID NULL REFERENCES public.messages(id) ON DELETE SET NULL,
  source_verbal_capture_id UUID NULL REFERENCES public.verbal_captures(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'operator_confirmed', 'client_confirmed', 'superseded', 'withdrawn')),
  effective_from TIMESTAMPTZ NULL,
  effective_until TIMESTAMPTZ NULL,
  superseded_by_id UUID NULL REFERENCES public.project_amendments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_amendments_wedding
  ON public.project_amendments (photographer_id, wedding_id);
CREATE INDEX idx_project_amendments_active
  ON public.project_amendments (photographer_id, wedding_id, status, effective_from DESC)
  WHERE status IN ('operator_confirmed', 'client_confirmed');
```

**Integration with memory:** an amendment is not a memory — it's binding. A memory may reference an amendment in its `full_content` for context; do not duplicate amendment content into memory summaries.

**Integration with invoicing:** future invoice logic joins `project_amendments` where `status IN ('operator_confirmed', 'client_confirmed')` and `effective_from <= now() AND (effective_until IS NULL OR effective_until > now())`.

**Dependencies:** `verbal_captures` (§6.1) should exist before this slice, since many amendments originate from verbal captures.

**Slice size:** migration ~100 LOC + RPC + Ana propose-confirm integration + tests. Medium-large.

---

## 7. Architectural red lines (enterprise contract)

Non-negotiable. Each with a concrete code-level implication.

1. **Tenant isolation.** Every new table has `photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE`. Every new query explicitly filters by it. Every new RLS policy is `USING (photographer_id = (SELECT auth.uid())) WITH CHECK (photographer_id = (SELECT auth.uid()))`. Verify by RLS test (insert as tenant A, select as tenant B, expect empty).

2. **Client-facing firewall stays.** `personaAgent.ts` constants `PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4` and `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200` are unchanged. Writers never receive `full_content`. No new field on memories is passed through to the writer without explicit architectural review.

3. **Authority vs advisory.** `playbook_rules` + `authorized_case_exceptions` flow into effective policy via `deriveEffectivePlaybook`. `memories` do not. Memory-to-policy promotion flows through `playbook_rule_candidates` → explicit human promotion to `playbook_rules`.

4. **Propose-confirm for risky state.** Rules, case exceptions, policy changes, amendments, financial-field edits, memory-note creations flow through proposedActions + confirmation chip. Direct writes allowed only for safe, reversible operations (task create/complete, calendar create/edit with chip).

5. **Store separation.** Keep `memories`, `knowledge_base`, `playbook_rules`, `authorized_case_exceptions`, `thread_summaries`, `weddings.story_notes` distinct. Clarify convention, not schema.

6. **Idempotency.** Every write RPC that accepts client-supplied data is idempotent. Use the existing pattern from `complete_escalation_resolution_memory`: SELECT-before-INSERT, unique partial index where applicable, return existing row on replay.

7. **The existing idempotency index on memories stays.** Partial unique on `(photographer_id, source_escalation_id, learning_loop_artifact_key) WHERE both non-null`. Do not remove.

8. **PII never in memory content.** Passport numbers, national IDs, DOB+full-name combos, credit cards are flagged on ingestion and redirected to a sensitive-document store (future slice). Do not store them as memory `full_content`.

9. **No wedding-only design.** `project_type` abstraction on every schema and UI. Generic labels in operator-facing vocabulary (`planner` → `coordinator` where generic, `couple` → `primary_client` where generic).

10. **Single agent per turn.** No multi-agent orchestration for Ana. Specialist modes may use different models / prompts / tools, but not sub-agents fanning out.

11. **Deterministic first.** No LLM classifier on Ana's fast path. Any future classifier is gated on telemetry showing deterministic routing misses, runs only on `unclear` triage, with ≤600 ms timeout and fallback.

12. **Audit everything.** Every state-changing RPC logs a JSON line with `photographer_id`, operation type, affected IDs, outcome, and a fingerprint for correlation.

---

## 8. Non-functional requirements (enterprise grade)

### 8.1 Migration naming and ordering

- Format `YYYYMMDDhhmmss_<slug>.sql`. Lexicographic timestamp matches apply order.
- Additive changes always preferred. New columns nullable with sensible defaults. New tables empty.
- Destructive ops (DROP COLUMN, DROP CONSTRAINT) require explicit operator sign-off with migration rationale comment.
- Every migration has a `-- ROLLBACK:` commented block at the top.

### 8.2 RLS verification checklist (per new table)

- [ ] `photographer_id` column exists and is `NOT NULL`.
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
- [ ] `CREATE POLICY ... FOR ALL USING (photographer_id = (SELECT auth.uid())) WITH CHECK (...)` present.
- [ ] Test: insert as tenant A, select as tenant B → empty.
- [ ] Test: insert as tenant A referencing tenant B's row → fail.
- [ ] RPC that reads/writes table is either `SECURITY DEFINER` with explicit tenant checks, or `SECURITY INVOKER`. Documented which.

### 8.3 Idempotency verification checklist (per new write RPC)

- [ ] Deterministic idempotency key derived from input.
- [ ] Partial unique index OR SELECT-before-INSERT pattern.
- [ ] Test: call RPC twice with same input; expect identical result, one row in target.
- [ ] Repeated calls return the existing resource without raising.

### 8.4 Telemetry (structured JSON)

Every RPC and every context builder emits one JSON line per invocation:

```json
{
  "type": "<operation_name>",
  "photographer_id": "...",
  "fingerprint": "<short-hash-of-inputs>",
  "outcome": "ok" | "already_completed" | "error",
  "error_detail": "..."
}
```

Follow the `queryTextFingerprint` helper in `buildAssistantContext.ts` for fingerprints. Don't emit PII.

### 8.5 Error taxonomy

| Code | When | HTTP | Retry? |
|---|---|---|---|
| `tenant_mismatch` | Input refers to a resource not owned by caller tenant | 403 | No |
| `validation_error` | Input shape wrong | 400 | No |
| `not_found` | Referenced resource absent | 404 | No |
| `idempotent_replay` | Recognised retry; return existing resource | 200 | — |
| `concurrent_update` | Row changed mid-write | 409 | Yes |
| `internal_error` | Catch-all | 500 | Maybe |

Use consistently across edge functions and RPCs.

### 8.6 Rollback posture

- Phase 1 remaining work is **trivially reversible** (nullable columns, additive behaviour, tests pass without them).
- Phase 2 items are reversible but may strand data (verbal captures, amendments) if withdrawn. Include explicit rollback plan in each slice plan.

---

## 9. Per-slice workflow

For every slice:

1. **Re-verify the current state by reading the actual code.** Do not trust this handover over reality if they diverge — flag the drift to the operator.
2. **Draft a slice plan** as `docs/v3/SLICE_<PHASE>_<NAME>_PLAN.md` using the template in §10.
3. **Present to the operator.** Wait for confirmation.
4. **Execute** exactly the approved scope.
5. **Run the verification checklist** (§11).
6. **Write a post-ship summary** mapping the slice to patterns from `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md`.
7. **Do not open new work without operator confirmation.**

---

## 10. Slice plan template

Every slice plan follows this skeleton:

```markdown
# Slice Plan — <name>

## 1. Problem statement (grounded in real evidence — cite threads or code)

## 2. Scope
### In scope
### Out of scope (explicit)

## 3. Pattern mapping
Which patterns from REAL_THREADS_ANALYSIS_AND_PROPOSALS.md this closes (fully / partially / not).

## 4. File-by-file change surface
| File | Change | Est. LOC |

## 5. Schema changes (if any)
- Migration filename.
- Full DDL including CHECK constraints, indexes, RLS.
- ROLLBACK block as a comment.

## 6. Write path contract (if any)
- RPC signature.
- Idempotency key.
- Error codes emitted.
- Transaction boundary.

## 7. Read path integration (if any)
- Which context builders extend (`buildAssistantContext`, `buildDecisionContext`, persona writer).
- Which TS types change.
- Telemetry fields added.

## 8. Test strategy
- Unit tests (list).
- Integration tests (list).
- Golden tests (list).
- Manual verification steps.

## 9. Acceptance criteria (observable, not just code metrics)

## 10. Red-line compliance
Explicitly answer each:
- Tenant isolation: verified by which test?
- Firewall intact: yes / explain change.
- Propose-confirm honored: yes / explain.
- Store separation: yes / explain.
- Project-type generalisation: yes / explain.

## 11. Risks and unknowns

## 12. Rollback plan

## 13. Estimated effort (LOC breakdown)
```

---

## 11. Per-slice verification checklist (before calling a slice done)

- [ ] All new tables have RLS enabled + tenant policy + RLS test.
- [ ] All new columns on existing tables preserve RLS (no accidental opening).
- [ ] All new RPCs documented as `SECURITY DEFINER` (with tenant checks) or `SECURITY INVOKER`.
- [ ] All new write RPCs are idempotent and test-verified.
- [ ] All new write paths emit structured JSON telemetry.
- [ ] All new schema changes are additive (or destructive with operator sign-off + rollback).
- [ ] All new UI surfaces respect `project_type` abstraction; no wedding-only wording.
- [ ] Persona-writer firewall intact (constants unchanged, no new paths to `full_content`).
- [ ] No new code reads across tenants.
- [ ] No new memory-write path bypasses tenant check.
- [ ] No new code merges memory content into effective playbook.
- [ ] Unit + integration + golden tests cover happy path + ≥2 failure paths per new capability.
- [ ] Migration has `-- ROLLBACK:` comment block.
- [ ] One-line summary written mapping slice to `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md` patterns.

---

## 12. Explicit do-nots

- **Do not** re-propose Ana triage v1, title/body honesty fix, or studio profile grounding — they are live.
- **Do not** extend the `memories.type` text field with ad-hoc values without constraining it.
- **Do not** relax `memories_scope_shape_check` without explicit operator decision (§4.7 of older verdict doc).
- **Do not** add `embedding` column to `memories` in Phase 1 or 2. Vector search on memories is Phase 3+ gated on measured retrieval misses.
- **Do not** lift the persona-writer firewall; fix writer starvation via summary convention.
- **Do not** add an LLM triage classifier in current roadmap.
- **Do not** add fetch-gating to Ana triage (still hint-only).
- **Do not** treat this handover as sufficient to begin code changes; every slice needs a plan drafted and operator-approved first.
- **Do not** collapse grounding stores into each other.
- **Do not** auto-extract facts from inbound messages into `memories` in Phase 2. All memory writes still go through explicit operator action (escalation resolution, memory-note chip, verbal-capture promotion).
- **Do not** write PII into memory `full_content`. Redirect to sensitive-document store.
- **Do not** write memories from the persona writer.
- **Do not** allow a memory to merge into effective policy. Ever.

---

## 13. Communication pattern with the operator

- **Evidence first, proposal second.** Quote file paths and line numbers, cite thread IDs from the real-thread analysis.
- **Small slices** preferred (≤500 LOC of meaningful change per slice).
- **Explicit "not now" distinctions.** Respect "do not implement yet."
- **Skeptical external LLM critique.** When another agent's critique arrives, verify each claim against real code. Example in this conversation: the external reviewer claimed memory magic strings create a "policy backdoor." Real code review showed they do not (policy flows via `authorized_case_exceptions` merge, not memories). Accept valid points, reject unsupported ones with reasoning.
- **End-of-slice summary** after each slice lands: what changed, which patterns closed, follow-ups surfaced.
- **Push back on over-engineering.** If a design drifts toward multi-agent orchestration, event sourcing, premature optimisation, or speculation — call it out.

---

## 14. Quick-reference appendix

### 14.1 Key files (verified 2026-04-22)

**Memory subsystem — migrations (in apply order):**
- `supabase/migrations/20260403120000_phase1_step1a_v2_memories_threads_tasks.sql` — original `memories` table.
- `supabase/migrations/20260423120000_memories_learning_loop_provenance.sql` — `source_escalation_id`, `learning_loop_artifact_key`, idempotency index.
- `supabase/migrations/20260419120000_complete_escalation_resolution_atomic.sql` — RPC for single-memory escalation resolution.
- `supabase/migrations/20260522120000_memories_production_scope_slice1.sql` — `scope`, `person_id`, `archived_at`, partial indexes.
- `supabase/migrations/20260523120000_memories_scope_slice3_check.sql` — CHECK constraint, updated RPCs, multi-artifact `complete_learning_loop_operator_resolution`.

**Memory subsystem — TS:**
- `supabase/functions/_shared/memory/fetchMemoryHeaders.ts` — header scan with `archived_at IS NULL` filter and three-scope `or()` filter.
- `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts` — ranker (magic strings still present, to remove).
- `supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts` — top-5 hydration.

**Memory write paths:**
- RPC `public.complete_escalation_resolution_memory(...)` — single-memory escalation resolution.
- RPC `public.complete_learning_loop_operator_resolution(...)` — multi-artifact resolution.
- Edge function `supabase/functions/insert-operator-assistant-memory/index.ts` — Ana memory-note chip backend. Accepts and validates `scope`, `weddingId`, `personId`.

**Ana:**
- `src/components/SupportAssistantWidget.tsx` — widget. `confirmMemoryNoteProposal` sends scope + weddingId + personId.
- `src/lib/operatorAnaTriage.ts` — **live** 6-domain triage. Do not re-propose.
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — system prompt. References studio profile, triage, title/body honesty.
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — formatter. Renders Triage + Studio Profile + Thread activity (with "Envelope only" note) blocks.
- `supabase/functions/_shared/context/buildAssistantContext.ts` — Ana context builder. Calls `classifyOperatorAnaTriage`, `fetchAssistantStudioBusinessProfile`, `fetchMemoryHeaders`.
- `supabase/functions/_shared/context/buildDecisionContext.ts` — client-reply context builder.
- `supabase/functions/_shared/context/fetchAssistantStudioBusinessProfile.ts` — studio profile fetcher.
- `supabase/functions/_shared/context/fetchAssistantThreadMessageLookup.ts` — thread retrieval; `strong` clause still loose at `topicHits >= 1`.

**Intent predicates (already consolidated by Ana triage):**
- `src/lib/operatorAssistantThreadMessageLookupIntent.ts` — 11/13 requested stop-words live; missing `tomorrow`, `inquiry`, `inquiries`.
- `src/lib/operatorAssistantInquiryCountIntent.ts`
- `src/lib/operatorAssistantAppHelpIntent.ts`
- `src/lib/operatorAssistantStudioAnalysisIntent.ts`
- `src/lib/operatorAssistantCalendarScheduleIntent.ts`

**Persona writer (firewall):**
- `supabase/functions/_shared/persona/personaAgent.ts` — constants `PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4`, `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200`. Do not change.

**Adjacent tables (enterprise patterns to mirror for Phase 2):**
- `playbook_rule_candidates` (migration `20260421120000_playbook_rule_candidates_learning_loop.sql`) — canonical template for supersession + promotion.
- `authorized_case_exceptions` (migration `20260416120000_authorized_case_exceptions.sql`) — canonical template for status enum + effective-window columns.

### 14.2 Key types

- `MemoryHeader`, `MemoryScope` — `supabase/functions/_shared/memory/fetchMemoryHeaders.ts`
- `AssistantContext`, `AssistantStudioProfile`, `OperatorAnaTriage` — `src/types/assistantContext.types.ts`
- `OperatorAnaCarryForwardForLlm` — `src/types/operatorAnaCarryForward.types.ts`
- `Database` (generated) — `src/types/database.types.ts` — contains the authoritative shape of every table after applied migrations.

### 14.3 Key constants

- `MAX_SELECTED_MEMORIES = 5` (total memory cap per turn)
- `MAX_STUDIO_MEMORIES_IN_REPLY = 3` (studio sub-cap when wedding in scope)
- `PERSONA_LIMITED_CONTINUITY_HEADER_MAX = 4` (writer firewall)
- `PERSONA_MEMORY_SUMMARY_MAX_FOR_PROMPT = 200` (writer firewall)
- Memory field clips: title ≤120, summary ≤400, full_content ≤8000
- `memory_scope` enum: three values, mutually exclusive

### 14.4 Starting point — concrete first move

1. **Read this document end-to-end.**
2. **Spot-check** the current state by opening:
   - `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts` — confirm `PROVISIONAL_STRONG_SUBSTRINGS` still there.
   - `src/types/database.types.ts`, `memories.Row` — confirm no `supersedes_memory_id` or `last_accessed_at`.
   - `src/lib/operatorAssistantThreadMessageLookupIntent.ts` — confirm `TOPIC_STOP` missing `tomorrow`, `inquiry`, `inquiries`.
   - `supabase/functions/_shared/context/fetchAssistantThreadMessageLookup.ts` lines ~220–240 — confirm `topicHits >= 1` still in strong clause.
3. **Read `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md`** for patterns to address.
4. **Choose the smallest remaining slice.** Recommended: the **Phase 0 completion** (three stop-words + strong-clause tightening in `fetchAssistantThreadMessageLookup.ts`). Smallest, safest, addresses a real observed miss, independent of everything else.
5. **Draft a slice plan** as `docs/v3/SLICE_PHASE0_THREAD_LOOKUP_COMPLETION_PLAN.md` using §10's template.
6. **Present to the operator.** Wait for approval.
7. **Execute.** Run the §11 checklist. Report.

Second move (after #1 ships): **Phase 1 memory completion** — one migration (`supersedes_memory_id` + `last_accessed_at`) + ranker cleanup (remove magic strings, exclude superseded, touch `last_accessed_at` on hydration) + write-convention. Medium slice; plan it carefully.

Third move (after #2): pick the **highest-leverage Phase 2 system** — `verbal_captures` (§6.1). Draft a thorough slice plan first; it's the largest Phase 2 item.

---

## 15. Document maintenance

- Last verified against code: **2026-04-22** at commit `7fea3b9`.
- If any file path, column, enum, or constant named above has drifted, update this document in the same commit as the slice plan that discovered the drift.
- Migrations applied after 2026-04-22 supersede this document's "current state" on those specific points. This document is a snapshot, never the source of truth on schema.

---

## 16. What this handover preserves from prior work

**From the external LLM critique (after verification):**
- `supersedes_memory_id` + `last_accessed_at` pattern — **accepted, scheduled for Phase 1 completion** (§4.1).
- Person-scoped memories — **partially accepted and already shipped** as three-scope mutually-exclusive; intersectional case rejected by CHECK constraint for good reason (see §4.7 of older verdict doc).
- Remove magic-string ranker cues — **accepted, scheduled for Phase 1 completion** (§4.2).
- Enrich memory summaries with decision/outcome — **accepted, scheduled as write-convention in §4.4**.
- Event-sourcing with `story_notes` as projection — **rejected**, overkill and misreads the data model.
- Lift persona firewall — **rejected**, structural firewall stays; fix is summary convention.
- Add embeddings to memories — **deferred**, not Phase 1 or Phase 2.
- Staging table for memories — **rejected**, operator-triggered already; no autonomous writes.

**From the 8-project thread analysis:**
- 20 recurring patterns identified, 116 raw issues. 4 fully covered by current Phase 1 plan (banking fragility, life-event pause, supersession, offline capture groundwork), 9 partially covered (memory + adjacent system), 7 not covered (entity collision, PII, visual, timeline, email alias, form completion, parsing artifacts).
- Six adjacent systems needed beside memory — ranked by leverage in §6 and `REAL_THREADS_ANALYSIS_AND_PROPOSALS.md` §7.
- Every pattern generalises beyond weddings to commercial / editorial / portrait / video work.

**Operator-confirmed principles** preserved as §7 red lines, with concrete code-level implications.

Every major architectural decision in this document traces to either (a) verified live code, (b) the thread-analysis document, or (c) the vetted external-LLM critique. Speculative additions were explicitly removed.
