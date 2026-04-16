# V3 Production Readiness Vibecoder Master Prompt

Use this prompt when you want one AI coding pass to execute the production-readiness cleanup **sequentially**, one slice at a time, with verification and refinement between slices.

This prompt is for this repository only.

---

## Master Prompt

You are implementing the Atelier OS production-readiness cleanup in this repository.

Your job is to execute the work **slice by slice**, in order, using the repository’s latest architecture and schema documentation as the source of truth.

You must **not** hallucinate schema, runtime behavior, or old V3 assumptions.

## Canonical Documents

Read these first and treat them as authoritative:

1. `docs/v3/ARCHITECTURE.md`
2. `docs/v3/DATABASE_SCHEMA.md`
3. `docs/v3/V3_PRODUCTION_READINESS_ATTACK_PLAN.md`
4. `docs/v3/V3_PRODUCTION_READINESS_SLICE1_STOP_THE_BLEEDING.md`
5. `docs/v3/V3_PRODUCTION_READINESS_SLICE2_DATABASE_MELTDOWN.md`
6. `docs/v3/V3_PRODUCTION_READINESS_SLICE3_BROWSER_CRASH.md`

If older docs conflict with those files, ignore the older docs.

Schema truth order:

1. `supabase/migrations/*`
2. `docs/v3/DATABASE_SCHEMA.md`
3. generated TypeScript database types

## Prime Directive

Do **not** try to fix the whole app in one giant pass.

You must execute the work **in order**, one slice at a time:

1. Slice 1: Stop The Bleeding
2. Slice 2: Database Meltdown
3. Slice 3: Browser Crash

For each slice, you must:

1. read the slice doc
2. inspect the exact target files named in that slice
3. implement only that slice
4. verify the slice against its acceptance criteria
5. refine any issues you discover
6. only then continue to the next slice

Do not start Slice 2 until Slice 1 is stable.

Do not start Slice 3 until Slice 2 is stable.

## Mandatory Implementation Rules

### 1. No Giant Blob Rewrites

Do not make giant 500 to 1000 line edits to a single function unless it is absolutely unavoidable.

If a target file is large, fragile, or already overloaded:

- extract helpers
- introduce small focused modules
- keep entrypoints readable
- use compatibility seams

If a slice is too large or too risky to complete safely in one pass, **sub-slice it yourself** before coding.

When you sub-slice:

- keep the parent slice goal intact
- finish the sub-slices in sequence
- verify each sub-slice before moving on

### 2. Stay Grounded In The Repo

All implementation decisions must be based on:

- current code
- current migrations
- `docs/v3/ARCHITECTURE.md`
- `docs/v3/DATABASE_SCHEMA.md`
- the production-readiness slice docs

Do not invent tables, fields, or runtime contracts that are not supported by those sources.

### 3. Preserve Behavior Unless The Slice Requires Change

Do not redesign the product.

Do not introduce opportunistic broad rewrites.

Do not change public interfaces unless necessary for the slice, and if you must, keep the change narrow and compatible.

### 4. Additive Change Bias

Prefer:

- additive migrations
- focused helper extraction
- compatibility wrappers
- narrow call-site changes

Avoid:

- renaming core tables
- dropping current compatibility surfaces
- rewriting the entire frontend data layer in one shot

### 5. RLS / Environment Rule

Keep RLS enabled for real environments as described in the slice docs.

Do not spend time rotating local-only test `.env` secrets in this run unless a slice explicitly requires a tiny cleanup.

## Required Working Method

Follow this exact workflow.

### Phase 0: Read And Plan

Before editing:

1. read the canonical docs
2. inspect the target files for Slice 1
3. produce a short implementation plan for Slice 1 only
4. identify whether Slice 1 itself needs to be broken into smaller sub-slices

Then implement Slice 1.

### Phase 1: Execute Slice 1

Use `docs/v3/V3_PRODUCTION_READINESS_SLICE1_STOP_THE_BLEEDING.md`.

Your target is:

- `knowledge_base` RLS hardening
- overlapping LLM-call reduction
- model-call observability

At the end of Slice 1:

1. verify against the slice acceptance criteria
2. fix any issue you discover
3. write a concise “Slice 1 complete” summary listing:
   - files changed
   - migrations added
   - helpers added
   - behavior changed
   - verification performed

Only continue if Slice 1 is stable.

### Phase 2: Execute Slice 2

Use `docs/v3/V3_PRODUCTION_READINESS_SLICE2_DATABASE_MELTDOWN.md`.

Your target is:

- real pgvector retrieval
- ANN and support indexes
- composite indexes for proven hot query paths

At the start of Slice 2:

1. confirm Slice 1 is complete and stable
2. inspect the exact retrieval and migration files named in the doc
3. sub-slice if needed

At the end of Slice 2:

1. verify against the slice acceptance criteria
2. fix any issue you discover
3. write a concise “Slice 2 complete” summary listing:
   - files changed
   - migrations added
   - RPC/helper changes
   - indexes added
   - query-plan verification performed

Only continue if Slice 2 is stable.

### Phase 3: Execute Slice 3

Use `docs/v3/V3_PRODUCTION_READINESS_SLICE3_BROWSER_CRASH.md`.

Your target is:

- scoped invalidation instead of global refetch storm
- polling cleanup
- Gmail HTML lazy-loading
- pagination / rendering safety

At the start of Slice 3:

1. confirm Slices 1 and 2 are complete and stable
2. inspect the exact frontend files named in the doc
3. sub-slice if needed

At the end of Slice 3:

1. verify against the slice acceptance criteria
2. fix any issue you discover
3. write a concise “Slice 3 complete” summary listing:
   - files changed
   - hook/helper changes
   - invalidation changes
   - polling changes
   - pagination/lazy-load changes
   - verification performed

## Verification Standard

For every slice:

1. use the slice’s own acceptance criteria as the minimum bar
2. check whether your implementation introduced regressions
3. if verification exposes a flaw, fix it before continuing
4. if a slice cannot be safely completed, stop and explain the blocker clearly

Do not mark a slice complete just because code compiles.

You must verify the actual intended architectural outcome as best as the repository and tools allow.

## Output Format During Execution

As you work, keep your internal structure organized around:

- current slice
- current sub-slice if any
- what changed
- what was verified
- what was refined

## Final Output Requirements

When all slices are complete, produce one review-ready final report with these sections:

### 1. Completed Work

List each slice and whether it was completed fully or partially.

If you introduced sub-slices, show them under the relevant slice.

### 2. Files Changed

List all files changed, grouped by:

- migrations
- edge functions / backend
- frontend
- docs

### 3. Architectural Outcomes

Summarize the actual outcomes, for example:

- `knowledge_base` RLS state
- LLM-call duplication reductions
- vector retrieval status
- indexes added
- refetch-storm reduction
- polling reduction
- lazy-loading and pagination status

### 4. Verification Performed

State what you verified for each slice and what remains unverified.

### 5. Remaining Risks Or Follow-Ups

List any residual issues, tradeoffs, or deliberately deferred items.

## Additional Guidance

If a slice is starting to sprawl, stop and split it.

If a file is becoming harder to reason about, extract helpers.

If a change would require a sweeping redesign to do “perfectly,” do the smallest correct version that satisfies the slice acceptance criteria without destabilizing the app.

The desired end state is not “maximum code churn.”

The desired end state is:

- production-readier architecture
- lower cost risk
- safer tenant behavior
- smaller, reviewable diffs
- clean sequential execution

---

## Suggested Invocation Note

If you want, prepend this one-liner before the master prompt when handing it to an agent:

“Execute this production-readiness plan sequentially. If any slice is too large, split it into smaller sub-slices, complete and verify each one before moving on, and finish with a review-ready report of all changes.”
