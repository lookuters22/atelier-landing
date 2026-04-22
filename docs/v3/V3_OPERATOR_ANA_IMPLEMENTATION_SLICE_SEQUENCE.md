# V3 Operator Ana - Implementation Slice Sequence

> Status: Active execution planner.
> Purpose: This is the working slice sequence for implementing the next Ana architecture changes prompt-by-prompt in Composer.
> Audience: Humans, Claude, and Composer.
> Scope: Operator Ana only. Internal dashboard assistant only. Not the client-facing writer.

---

## 1. Why this doc exists

The architecture docs are now strong enough to guide implementation, but they are still architecture docs.
Composer needs a smaller, execution-oriented sequence so we can ship Ana in normal-sized slices without losing context, mixing responsibilities, or accidentally widening scope.

This document is the bridge between:

- the architecture docs
- Claude review / investigation
- Composer implementation prompts

This doc is intentionally practical:

- what slice comes next
- what is in scope
- what is out of scope
- what must be true before moving on

---

## 2. Source docs this sequence follows

This sequence is derived from:

- `V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md`
- `V3_OPERATOR_ANA_PROJECTS_DOMAIN_FIRST_EXECUTION_SLICE.md`
- `V3_OPERATOR_ANA_PROJECT_TYPE_SEMANTICS_SLICE.md`
- `V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md`

Important refinements already folded in:

- carry-forward pointer is always present; heuristics are advisory only
- resolver/detail handler boundaries must stay strict
- rich handler outputs are preferred to reduce chaining
- sequential multi-call latency is a risk, not a design goal
- compound handlers are allowed later only as a pressure-release valve, not as a shortcut to agent sprawl
- do not raise the 3-call tool budget

---

## 3. Overall execution rule

Implement Ana in narrow, reviewable slices.

Each Composer prompt should:

- target one slice only
- avoid opportunistic redesign
- preserve strict domain boundaries
- explicitly say what is out of scope
- finish with tests or verification for that slice only

Do not mix multiple major changes into one prompt just because they touch the same files.

---

## 4. What is already true in the repo

Before starting these slices, assume the following are already present and should be preserved unless a slice explicitly changes them:

- Ana identity / operator voice
- bounded browser-session conversation history
- app-help catalog and procedural workflows
- operator state snapshot
- weather block
- studio analysis snapshot
- deterministic entity resolution
- thread lookup
- inquiry counts snapshot
- calendar snapshot
- proposal cards and confirm flows
- bounded second-pass read-only tool loop

Important current limitation:

- the core request path is still push-context-heavy
- there is still no strict resolver/detail projects split in the tool layer
- there is still no `operator_lookup_project_details`
- focused-project facts and CRM digest still behave like major answer sources in the prompt

That is the main implementation gap this sequence addresses.

---

## 5. Slice sequence

### Slice 1 - Project details tool foundation

Goal:
Add the canonical project detail fetcher as a strict read-only tool.

Why this slice exists:
This is the foundation for the projects domain-first move. Without a UUID-only detail fetcher, Ana still has to answer project questions from preloaded prompt context.

In scope:

- add `operator_lookup_project_details`
- UUID-only input: `{ projectId: string }`
- no natural-language input
- no resolver behavior
- tenant-scoped read-only retrieval
- rich output so common project follow-ups can resolve in one call
- register the tool
- update tool descriptions and prompt language just enough to enforce:
  - `operator_lookup_projects` resolves
  - `operator_lookup_project_details` fetches details by UUID

Out of scope:

- no carry-forward
- no shared-context thinning yet
- no CRM digest removal yet
- no focused-project summary swap yet
- no new convenience handler
- no changes to thread/calendar/memory/studio-analysis flows

Exit condition:

- tool exists
- tool contract is strict
- resolver/detail split is explicit and tested

---

### Slice 2 - Focused project summary swap

Goal:
Replace full preloaded focused-project facts in shared context with a minimal focused project summary.

Why this slice exists:
The point of Slice 1 is lost if the prompt still carries the full focused-project facts block as an always-on source.

In scope:

- change focused project prompt representation to summary only
- summary should contain only:
  - projectId
  - projectType
  - stage
  - displayTitle
- label it clearly as a pointer, not a full source of truth
- keep behavior bounded and deterministic

Out of scope:

- no carry-forward
- no CRM digest removal yet
- no thread/calendar/memory changes
- no new handlers

Exit condition:

- full focused-project facts block is gone from shared context
- summary block exists instead
- deep project questions now need the detail tool

---

### Slice 3 - Project-domain routing prompt update

Goal:
Make project questions route through the resolver/detail pair instead of being answered from prompt-loaded project context.

Why this slice exists:
After Slices 1 and 2, Ana still needs explicit behavioral guidance so the model uses the correct path consistently.

In scope:

- update system prompt project-routing guidance
- clearly instruct:
  - resolve by name/location via `operator_lookup_projects`
  - fetch deep details by UUID via `operator_lookup_project_details`
- make the focused project summary explicitly non-authoritative for deep facts
- add or tighten integration tests for focused and name-based project questions

Out of scope:

- no CRM digest removal yet
- no carry-forward
- no other domain routing changes

Exit condition:

- focused project detail questions call the detail tool
- name-based project questions use resolve-then-detail when needed

---

### Slice 4 - CRM digest de-emphasis for projects

Goal:
Stop the CRM digest from acting as a primary source for project answers.

Why this slice exists:
Wrong-source answers continue as long as the digest remains a major competing source for project truth.

In scope:

- reduce or remove the default project-answer role of the CRM digest in Ana prompt formatting
- keep only what is still needed temporarily for ambient/operator overview behavior
- ensure project-specific answers route through the projects tools instead

Out of scope:

- no carry-forward
- no non-project domain changes
- no compound handlers

Exit condition:

- project answers no longer depend on recent digest presence
- out-of-digest projects still resolve correctly

---

### Slice 5 - Project-type semantics enforcement

Goal:
Make project-type-aware behavior explicit and reliable across project retrieval and answers.

Why this slice exists:
Even with correct retrieval, Ana will still bleed wedding semantics into commercial/video/other work unless project type is treated as a first-class answer constraint.

In scope:

- ensure `project_type` / `projectType` is surfaced prominently everywhere the projects path needs it
- enforce non-wedding-safe framing in prompt guidance
- ensure project lookup outputs carry project type consistently
- add anti-bleed tests for commercial/video/other fixtures

Out of scope:

- no carry-forward yet
- no playbook schema changes
- no memory-system redesign

Exit condition:

- non-wedding projects are framed correctly
- wedding-default language is no longer leaking into non-wedding answers

---

### Slice 6 - Carry-forward pointer plumbing

Goal:
Add the always-on carry-forward pointer transport and prompt rendering.

Why this slice exists:
Carry-forward becomes much more valuable after project IDs are flowing cleanly through the projects handler path.

In scope:

- add carry-forward type and transport
- include pointer in request/response path
- render pointer in shared context
- compute `advisoryHint` as advisory only
- keep pointer fields always present when prior turn resolved them
- update system prompt so the LLM treats the pointer as structured prior-turn grounding

Out of scope:

- no new retrieval handlers
- no heuristic gating that hides pointer fields
- no NL follow-up classifier

Exit condition:

- pointer is round-tripped between turns
- pointer fields are preserved regardless of cue-match or topic-shift advisory state

---

### Slice 7 - Carry-forward behavior verification

Goal:
Verify that terse follow-ups actually use the pointer and stop re-resolving unnecessarily.

Why this slice exists:
Plumbing alone is not enough; the real product value is better follow-up behavior.

In scope:

- integration fixtures for:
  - "when is it?"
  - "what was it about?"
  - "did they email too?"
  - ambiguity carry-forward
  - explicit topic change override
- telemetry fields for pointer presence vs actual pointer use

Out of scope:

- no new domains
- no extra heuristics beyond advisory hint

Exit condition:

- follow-up behavior is measurably better
- telemetry can show whether pointer usage is actually happening

---

## 6. Not in this sequence unless explicitly added later

The following are intentionally not part of the current Composer slice sequence:

- thread-domain-first conversion
- calendar-domain-first conversion
- memory-domain-first conversion
- playbook-domain-first conversion
- knowledge-domain-first conversion
- compound handlers
- Responses API migration
- model upgrade as a solution to tool confusion
- raising the 3-call budget

These can become later sequences after the projects domain-first path is stable.

---

## 7. Separate infrastructure track

Prompt caching and strict structured outputs are still important, but they should be treated as a separate infrastructure track unless a specific implementation prompt intentionally combines them.

Preferred rule:

- projects domain-first slices should focus on correctness and routing
- infra slices should focus on output reliability, caching, and cost/latency

Do not casually combine them into one Composer prompt unless the prompt is still clearly bounded.

---

## 8. Composer prompt generation rule

When generating a Composer prompt from this doc:

1. name the exact slice being implemented
2. list source docs to read first
3. list exact files to inspect first
4. define in-scope changes
5. define out-of-scope changes
6. require tests or verification for that slice
7. require a final summary of:
   - files changed
   - acceptance checks completed
   - next recommended slice

If a prompt starts to include more than one major domain move, split it.

---

## 9. Immediate next slice

The next Composer implementation prompt should target:

**Slice 1 - Project details tool foundation**

Reason:

- highest-leverage correctness improvement
- cleanest foundation for the rest of the domain-first project path
- smallest slice that materially changes architecture in the right direction
- keeps carry-forward from landing on top of unstable project grounding

---

## 10. One-line summary

Implement Ana's project-domain-first architecture in a normal-sized sequence: strict project detail tool first, then thin focused project context, then route project questions through resolver/detail handlers, then enforce project-type correctness, then add always-on carry-forward on top of clean IDs.
