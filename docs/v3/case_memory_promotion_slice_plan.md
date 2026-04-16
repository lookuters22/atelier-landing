# Deterministic case-memory promotion into `selectedMemories` (slice 1)

**Status:** planning / pre-implementation.  
**Scope:** case-memory promotion only — no `globalKnowledge`, no vector DB, no persona/writer broadening.

---

## Current state (repo)

- `buildAgentContext` loads `fetchMemoryHeaders` and sets `selectedMemories: []`.
- `buildDecisionContext` hydrates full rows only when `options.selectedMemoryIds` is non-empty.
- `fetchSelectedMemoriesFull` enforces tenant safety: `.eq("photographer_id")` + `.in("id", ids)` in **one** query (no per-id loops).
- **Writer firewall:** `personaAgent` uses memory **headers** only for continuity — not `selectedMemories`. Implementation must not pass raw selected memories to the writer.

---

## Schema constraint

`memories` currently has: `id`, `photographer_id`, `wedding_id`, `type`, `title`, `summary`, `full_content`. No `thread_id`, `scope_label`, or DB-backed authorized-exception flags yet.

Selection uses **existing columns + header text** only. Future schema can extend the same deterministic tiers.

---

## Refinement 1 — Exception / substring hooks (provisional only)

Optional **Tier B** bumps using substrings such as `authorized_exception`, `exception`, `v3_verify_case_note` in `type` / `title` / `summary` are allowed as a **temporary retrieval hint**.

**Implementation and code comments must state clearly:**

- These are **provisional, text-only cues** for ranking — **not** durable policy semantics.
- They are **secondary** to scope (wedding vs tenant-wide) and keyword overlap unless we explicitly keep Tier B as a weak tie-break.
- **Real** authorized-exception precedence (narrowing `playbook_rules` for a case) still requires **proper schema / product support later** — do not treat string matches as a full exception system.

---

## Refinement 2 — Tenant-wide vs wedding-scoped

When `weddingId` is set:

- Rows with `wedding_id === weddingId` are **primary** candidates for this case.
- Rows with `wedding_id === null` (tenant-wide memories) are **fallback context** — they are **not** equal peers to wedding-scoped rows. They only compete strongly **after** wedding-scoped candidates are exhausted or when no wedding-scoped headers exist.

Documentation (`V3_MEMORY_UPGRADE_PLAN` or this file) and selector comments should say this explicitly.

---

## Deterministic ranking (no scoring engine, no vector DB)

1. Deduplicate by `id`.
2. **Tier A — scope:** If `weddingId` is set: partition or sort so **wedding-scoped** headers outrank **tenant-wide** (`wedding_id === null`) as described above. If no `weddingId`, all headers compete on later tiers only.
3. **Tier B — provisional text cues:** Weak bump for exception/QA substrings (clearly labeled provisional in code — see Refinement 1).
4. **Tier C — keyword overlap:** Deterministic token overlap between `(title + summary)` and `(rawMessage + threadSummary)` after normalization.
5. **Stable tie-break:** sort by tier/score then `id` ascending; take first `MAX_SELECTED_MEMORIES` (hard cap **5**).

---

## Implementation steps

1. Extend `fetchMemoryHeaders` to select `wedding_id`; extend `AgentContext["memoryHeaders"]` shape; pass `wedding_id` through redaction/sanitize copies.
2. Add `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts` exporting `MAX_SELECTED_MEMORIES = 5` and `selectRelevantMemoryIdsDeterministic(...)`.
3. Wire `buildDecisionContext` / `buildDecisionContextQaProofPair`: if `options.selectedMemoryIds` is non-empty, use it (QA override); else use deterministic IDs, then single `fetchSelectedMemoriesFull`.
4. Comments on **truth hierarchy:** `selectedMemories` support orchestrator/verifier; they **do not** override `playbook_rules`; authorized-exception narrowing is a **future** contract (schema + explicit markers), not substring Tier B.

---

## Tests

- Wedding-scoped preferred over tenant-wide when both exist and `weddingId` matches.
- Tenant-wide behaves as fallback (documented ordering).
- Cap ≤ 5; stable ordering; cross-tenant safety remains in `fetchSelectedMemoriesFull`.
- Substring Tier B documented as provisional in test names or comments where relevant.

---

## Deliverables

| Item | Value |
|------|--------|
| Max promoted | 5 |
| Tenant-wide role | Fallback, not peer to wedding-scoped when wedding is in scope |
| Exception substrings | Provisional text cues only — not exception policy |
| Writer | Unchanged — headers-only path for persona |
