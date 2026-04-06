# StixDB-Inspired Memory Hygiene Adoption Plan

## Purpose
This document explains:

1. how V3 memory currently operates in this repo,
2. why it is intentionally constrained for safety,
3. which StixDB ideas are worth stealing,
4. exactly where those ideas should land in this codebase,
5. and which visible positions in the StixDB repo are the relevant starting points.

## Short Verdict
- **Our V3 is safer today** because policy, audience, CRM, escalation, and writer boundaries are explicit.
- **StixDB has the stronger memory engine** because it treats retrieval quality, dedupe, decay, and consolidation as first-class infrastructure.
- The correct synthesis is:
  - keep **Tier 0 / Tier 1 / authoritative CRM** deterministic and operator-controlled,
  - add **StixDB-style hygiene** only to **case/session memory**, never to playbook or canonical CRM truth.

---

## 1. How Our Memory Layers Operate Today

## 1.1 Current Memory Contract
The intended V3 memory stack is defined in:

- [ARCHITECTURE.md](C:/Users/Despot/Desktop/wedding/docs/v3/ARCHITECTURE.md)

Key design:
- `Tier 0`: safety constitution
- `Tier 1`: photographer playbook
- `Tier 2`: case memory
- `Tier 3`: session state
- `Tier 4`: ephemeral scratchpad

The most important safety rule in the architecture:
- the Writer must not receive unrestricted operational memory
- the Orchestrator and Verifier carry the heavy context burden

## 1.2 What `buildAgentContext` Actually Loads
Current base context is assembled in:

- [buildAgentContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildAgentContext.ts)

It currently loads:
- `crmSnapshot`
- `recentMessages`
- `threadSummary`
- `memoryHeaders`

But it initializes:
- `selectedMemories: []`
- `globalKnowledge: []`

Implication:
- the architecture supports deep memory promotion,
- but operationally the deeper layers are often thin unless a caller explicitly promotes them.

## 1.3 What `buildDecisionContext` Adds
Decision-time context is assembled in:

- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)

It adds:
- `audience`
- `candidateWeddingIds`
- `playbookRules`
- optional promoted `selectedMemories`
- `threadDraftsSummary`

This is where V3 becomes policy-aware and audience-aware.

## 1.4 How Memory Is Kept Safe Before Reaching The Orchestrator
System-prompt-safe memory shaping happens in:

- [sanitizeAgentContextForOrchestratorPrompt.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/sanitizeAgentContextForOrchestratorPrompt.ts)

Important safety behaviors:
- raw recent message bodies are omitted from the normal orchestrator system preamble
- `full_content` is omitted from `selectedMemories`
- only an allowlisted subset of CRM fields are embedded
- thread summary and memory summaries are truncated

This is good and should stay.

## 1.5 How Memory Reaches The Writer
Writer boundary is defined in:

- [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts)
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)

The writer currently receives:
- authoritative CRM block
- compact continuity
- client inbound
- playbook excerpts
- limited case memory headers
- business identity

The writer explicitly does **not** receive:
- unrestricted `selectedMemories`
- unrestricted `globalKnowledge`
- raw app-side memory dumps

This boundary is correct and should remain.

## 1.6 Current Weaknesses
Current weak spots visible in code:

1. **Header-heavy retrieval**
- [fetchMemoryHeaders.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/fetchMemoryHeaders.ts)
- loads raw headers only, without scoring, freshness, or confidence.

2. **Promotion is optional and sparse**
- [fetchSelectedMemoriesFull.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts)
- only loads full memory when IDs are already chosen.

3. **`globalKnowledge` is structurally present but often empty**
- see [agent.types.ts](C:/Users/Despot/Desktop/wedding/src/types/agent.types.ts)

4. **Reasoning notices missing deep memory but does not solve it**
- [proposeClientOrchestratorCandidateActions.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/proposeClientOrchestratorCandidateActions.ts)
- currently emits `no_hydrated_memories_or_global_knowledge_rows_in_context`

5. **Learning writes go into `memories`, but memory quality is not maintained**
- [captureDraftLearningInput.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/captureDraftLearningInput.ts)

---

## 2. Why Our Current Design Is Safe

These safety properties should be preserved:

1. **Policy is not memory**
- playbook rules are separate from case memories

2. **Case exceptions do not silently become global rules**
- learning flows write to `memories`, not directly to playbook

3. **Audience is resolved outside the writer**
- audience facts are injected deterministically in decision context

4. **CRM stays authoritative**
- wedding date, location, package_name, contract value stay in deterministic records

5. **Writer remains narrow**
- memory can support drafting,
- but the writer must not become an unrestricted reasoning brain

This means any StixDB-inspired upgrade must operate only on:
- `memories`
- `thread_summaries`
- maybe future `globalKnowledge`

It must **not** autonomously rewrite:
- `playbook_rules`
- authoritative wedding CRM
- audience visibility facts
- escalation permissions

---

## 3. What To Steal From StixDB

## 3.1 What StixDB Is Doing Well
Visible public reference:

- [StixDB README](https://github.com/Pr0fe5s0r/StixDB)

Relevant public sections:
- “How the Three Modes Work”
- “The Background Agent — What It Actually Does”
- “Scale Expectations”

From the public README, StixDB clearly provides:
- background consolidation
- duplicate removal
- stale-memory decay
- pruning of cold nodes
- ranking by semantic similarity + importance
- reasoning traces and cited retrieval

That is the right model to borrow for memory hygiene.

## 3.2 What We Should Not Steal Blindly
We should **not** copy:
- autonomous mutation of business policy
- autonomous mutation of canonical CRM truth
- unrestricted self-organizing memory in the writer path

In our system:
- **playbook rules are the vault**
- **CRM is the vault**
- **case/session memory is the brain**

---

## 4. StixDB Target Repo Positions To Use As Reference

Because the comparison was done from the public GitHub repo page and README, these are the visible starting positions in the target repo:

### Public reference positions
- [StixDB repo root](https://github.com/Pr0fe5s0r/StixDB)
- [README section: “What is StixDB?”](https://github.com/Pr0fe5s0r/StixDB#what-is-stixdb)
- [README section: “How the Three Modes Work”](https://github.com/Pr0fe5s0r/StixDB#how-the-three-modes-work)
- [README section: “The Background Agent — What It Actually Does”](https://github.com/Pr0fe5s0r/StixDB#the-background-agent--what-it-actually-does)
- [README section: “Scale Expectations”](https://github.com/Pr0fe5s0r/StixDB#scale-expectations-honest-numbers)

### Visible top-level target repo positions
- `stixdb/`
- `sdk/`
- `doc/`
- `cookbooks/`
- `README.md`
- `QUICKSTART.md`
- `PRODUCTION.md`

### Practical interpretation
The safest visible targets to inspect or mirror first are:
- `README.md` for the conceptual lifecycle
- `stixdb/` for engine, config, background cycle, and retrieval implementation
- `sdk/` for query/retrieval-facing API shape
- `cookbooks/` for memory usage patterns

If we want file-by-file imitation deeper than this, the next step should be cloning or fully indexing that repo locally. For now, this plan uses only what is publicly visible and attributable.

---

## 5. Implementation Plan: What To Steal And Where It Lands Here

## Phase A: Add Explicit Memory Scoring To `memories`
### Goal
Make case memory rankable by more than naive header text.

### What To Add
Add score-related fields to `memories`, such as:
- `importance_score`
- `freshness_score`
- `access_count`
- `source_confidence`
- `last_accessed_at`
- `superseded_by_memory_id` or equivalent lineage link
- `is_pinned`

### Where In Our Repo
1. migration layer
- new Supabase migration for `memories`

2. type layer
- [database.types.ts](C:/Users/Despot/Desktop/wedding/src/types/database.types.ts)
- [agent.types.ts](C:/Users/Despot/Desktop/wedding/src/types/agent.types.ts)

3. fetch layer
- [fetchMemoryHeaders.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/fetchMemoryHeaders.ts)
- expand header fetch to include score metadata for ranking

### What We’re Stealing From StixDB
- importance-aware ranking
- freshness/decay-aware retrieval

### Safety Rule
This scoring applies only to `memories`, not `playbook_rules` or wedding CRM rows.

## Phase B: Add A Scheduled Memory Hygiene Worker
### Goal
Introduce safe, auditable cleanup of case/session memory.

### Worker Responsibilities
- detect near-duplicate case memories
- mark/summarize merge candidates
- decay transient memory relevance over time
- prune only low-value, unpinned, stale memory
- preserve lineage

### Where In Our Repo
Create:
- `supabase/functions/inngest/functions/memoryHygieneWorker.ts`

Likely supporting helpers:
- `supabase/functions/_shared/memory/scoreMemory.ts`
- `supabase/functions/_shared/memory/findMemoryMergeCandidates.ts`
- `supabase/functions/_shared/memory/applyMemoryDecay.ts`
- `supabase/functions/_shared/memory/createMemorySummaryCluster.ts`

### What We’re Stealing From StixDB
- background maintenance loop
- near-duplicate merge pass
- decay/prune pass
- bounded batch processing

### Safety Rule
- do not delete source rows immediately
- archive/supersede with lineage
- never touch `playbook_rules`
- never rewrite `weddings`

## Phase C: Upgrade Retrieval From Header Scan To Ranked Promotion
### Goal
Stop leaving `selectedMemories` thin by default.

### Current Problem
- [buildAgentContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildAgentContext.ts) loads headers
- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts) only promotes full memory if IDs are already supplied

### What To Add
Implement a ranking step that:
1. scores candidate memory headers against the current message + CRM + thread summary
2. selects the top relevant durable records
3. hydrates those into `selectedMemories`

### Where In Our Repo
Add helper:
- `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts`

Modify:
- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)
- [fetchSelectedMemoriesFull.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts)

### What We’re Stealing From StixDB
- explicit retrieval pipeline
- ranked relevance selection
- promotion of “good” memory instead of static empty deep layers

### Safety Rule
Only the orchestrator/verifier get hydrated memory by default.
The writer continues to receive a bounded subset.

## Phase D: Add Retrieval Traceability And Citations
### Goal
Make operator trust and auditability much better.

### What To Add
For each draft/escalation/auditor run, record:
- which CRM fields were used
- which playbook rules were used
- which memory IDs were used
- confidence/score snapshot for those memory rows

### Where In Our Repo
1. draft path
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)

2. auditor path
- [auditDraftCommercialTerms.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/auditDraftCommercialTerms.ts)

3. escalation path
- [recordV3OutputAuditorEscalation.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/recordV3OutputAuditorEscalation.ts)

4. result contracts
- [decisionContext.types.ts](C:/Users/Despot/Desktop/wedding/src/types/decisionContext.types.ts)

### What We’re Stealing From StixDB
- retrieval trace
- evidence-backed synthesis

### Safety Rule
Citations improve transparency only. They do not grant the writer more authority.

## Phase E: Add Memory Access Feedback Loop
### Goal
Improve ranking over time without letting the model rewrite policy.

### What To Add
Whenever a memory is promoted into a real decision path:
- increment `access_count`
- update `last_accessed_at`
- optionally log whether it contributed to:
  - accepted draft
  - escalation
  - rejected draft

### Where In Our Repo
Add helper:
- `supabase/functions/_shared/memory/recordMemoryAccess.ts`

Call from:
- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)
- or immediately after promotion in the new selection helper

### What We’re Stealing From StixDB
- usage-aware memory maintenance

### Safety Rule
Access frequency is a weak ranking signal, never a replacement for policy, source confidence, or audience safety.

---

## 6. Things We Should Explicitly Not Change

Do **not** apply self-organizing logic to:
- [fetchActivePlaybookRulesForDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/fetchActivePlaybookRulesForDecisionContext.ts)
- `playbook_rules`
- authoritative wedding CRM loaded in [buildAgentContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildAgentContext.ts)
- audience state loaded in [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)
- writer boundary in [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts)

Those are the fortress walls.

---

## 7. Recommended Execution Order

1. **Schema + score fields on `memories`**
2. **ranked memory selection + promotion**
3. **memory access logging**
4. **hygiene worker**
5. **retrieval trace / evidence citations**

This order matters because:
- better retrieval gives value immediately,
- hygiene worker is safer once scores and lineage exist,
- citations become more useful once retrieval is actually intelligent.

---

## 8. Proof Plan

## Prove Retrieval Improved
- same thread, same wedding, compare:
  - before ranking
  - after ranking
- check whether `selectedMemoriesCount` and usefulness improve

## Prove Safety Was Preserved
- ensure writer still receives bounded facts only
- ensure no audience leak occurs from newly promoted memory
- ensure playbook and CRM remain unchanged by hygiene worker

## Prove Hygiene Helps
- seed duplicate case memory
- run hygiene worker
- verify:
  - duplicate/similar memories are clustered or superseded
  - pinned memories are preserved
  - stale transient memories decay

## Prove Traceability
- inspect draft instruction history / escalation artifacts
- verify cited memory IDs are present and accurate

---

## 9. Final Recommendation

We should not copy StixDB wholesale.

We should copy these ideas:
- memory scoring
- ranked promotion
- duplicate consolidation
- stale-memory decay
- retrieval traceability

We should keep these V3 rules untouched:
- playbook is deterministic
- CRM is deterministic
- audience is deterministic
- writer stays narrow
- verifier and auditor remain hard gates

That is the correct hybrid:
- **StixDB-style memory hygiene**
- inside a **V3 safety kernel**

## Sources
- [ATELIER OS V3.1 Architecture](C:/Users/Despot/Desktop/wedding/docs/v3/ARCHITECTURE.md)
- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)
- [buildAgentContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildAgentContext.ts)
- [fetchMemoryHeaders.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/fetchMemoryHeaders.ts)
- [fetchSelectedMemoriesFull.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts)
- [sanitizeAgentContextForOrchestratorPrompt.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/sanitizeAgentContextForOrchestratorPrompt.ts)
- [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts)
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)
- [StixDB GitHub repo](https://github.com/Pr0fe5s0r/StixDB)
