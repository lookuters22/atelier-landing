# V3 Operator Ana — Domain-First Retrieval Architecture (Plan)

> **Status:** Active. Architecture plan. Not a single slice — guides several slice docs below it.
> **Goal:** Move the Ana operator widget from a **push-context** model (load everything, hope the LLM picks the right block) to a **thin-shared-context + domain-first retrieval** model, without turning Ana into an autonomous agent.
> **Scope:** The operator widget only. The persona writer for client-facing prose is out of scope for this plan and keeps its own architecture.
> **Companion docs:**
> - `V3_OPERATOR_ANA_PROJECT_TYPE_SEMANTICS_SLICE.md` — multi-project-type correctness (wedding / commercial / video / other)
> - `V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md` — follow-up referent handling
> - `V3_OPERATOR_ANA_PROJECTS_DOMAIN_FIRST_EXECUTION_SLICE.md` — first execution slice (Projects / CRM)
> **Do not supersede:** The paired infrastructure slices (`V3_OPERATOR_ANA_PROMPT_CACHING_SLICE.md`, `V3_OPERATOR_ANA_STRICT_STRUCTURED_OUTPUTS_SLICE.md`) ship independently. This plan builds on top of them.

---

## 1. Problem statement

The current widget architecture is **push-context-heavy**: `buildAssistantContext` fetches up to ~20 blocks of CRM, memory, playbook, Today state, studio analysis, app help, weather, focused project facts, inquiry counts, thread activity, calendar, global knowledge, and retrieval debug, and the formatter packs them all into one user message. The LLM then reads the whole dossier and decides which block to cite.

This works for simple single-domain questions. It fails for the operator questions that matter most:

- **Wrong source selection.** The LLM sees a playbook block *and* a focused-project block *and* a CRM digest — then answers a "what's going on with the inquiry in Como?" question from memory digest fragments instead of the project record.
- **Wedding bleed into non-wedding work.** A commercial-project question gets answered with wedding-flavored language because the push-context is wedding-coded (digest columns, focused-project fields, memory samples).
- **Stale or uncomputed information.** Pre-loading inquiry counts or calendar snapshots forces us either to always fetch them (expensive) or to miss them when needed.
- **Diminishing returns on more retrieval.** Each added block slightly dilutes every other block because the LLM has more to weigh.
- **Follow-ups lose referents.** The session-history layer helps, but there is no structured carry-forward of *which domain* or *which project* the prior turn was about.

The correct direction is **domain-first pull** — not a generic agent loop, just a disciplined shift where:

- Shared context stays thin and tenant-stable.
- Each major operator domain has its own deterministic retrieval handler.
- The LLM plans a single targeted retrieval call per turn (or uses the existing bounded two-pass tool loop) instead of sifting through a pre-loaded dossier.
- Semantic retrieval stays limited to the one domain where it genuinely helps (global studio knowledge).

This plan defines that architecture and the boundaries around it.

---

## 2. Current repo behavior (baseline — do not change without a slice)

Key files:

- `supabase/functions/_shared/context/buildAssistantContext.ts` — assembles the big `AssistantContext` object.
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — renders blocks into the user message.
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — the LLM call + two-pass tool loop.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.ts` — three read-only lookup tools today (`operator_lookup_projects`, `operator_lookup_threads`, `operator_lookup_inquiry_counts`).

Current per-request shape (after the planned caching slice lands):

- `system` prompt + unconditional session addendum.
- `STABLE_USER_BAND` — app catalog, playbook rules, playbook coverage summary, durable memory, global knowledge, CRM digest.
- Bounded conversation history (3 turn pairs).
- `PER_QUERY_USER_BAND` — weather, effective scope, matched entities, studio analysis, operator state, recent thread activity, inquiry counts, calendar, focused project facts, retrieval debug, operator question (last).

Tool loop: first pass with tools enabled (`tool_choice: "auto"`), up to 3 tool calls, second pass with `tool_choice: "none"` under strict JSON schema.

Most of this stays. The plan below thins the STABLE + PER_QUERY bands and promotes more domains from *pre-loaded* to *pulled via handler*.

---

## 3. Proposed architecture

Three architectural layers, each with a tight contract.

### Layer A — Thin shared context (always present, small, tenant-stable)

The shared context narrows to what the LLM must see every call to stay oriented, regardless of the question:

- **Photographer identity** — `photographerId` (already present).
- **Session pointer** — `sessionId` (effectively the widget session; already conceptually present via conversation history).
- **Focused entity hints** — `focusedWeddingId`, `focusedPersonId` when the widget passes them. IDs only, not their full facts.
- **Current focused project summary** — when `focusedWeddingId` is set: one-line projection of `{ projectId, project_type, stage, display_title }`. NOT the full project facts block. The handler fetches details when needed.
- **App help catalog** — repo-stable, small enough to keep always.
- **Playbook coverage summary** — small aggregate: total active rule count, distinct `topic` values, distinct `action_key` values. Not the full rule list. The handler fetches specific rules on demand.
- **Operator state summary (counts only)** — no samples. Counts for pending drafts, open tasks, open escalations, inbox buckets. Samples and detail come from handlers.
- **Carry-forward pointer** — structured referent from the prior turn (see follow-up slice doc).
- **Conversation history** — bounded 3 turn pairs, unchanged.

Removed from shared context (moved to handlers):

- Full CRM digest (12 recent weddings + 15 people) → `operator_lookup_projects`, `operator_lookup_people`.
- Focused project facts block → `operator_lookup_project_details(projectId)`.
- Recent thread/message activity → `operator_lookup_threads`.
- Inquiry counts snapshot → `operator_lookup_inquiry_counts` (already a handler).
- Calendar lookup → `operator_lookup_calendar`.
- Studio analysis snapshot → `operator_lookup_studio_analysis`.
- Durable memory samples → `operator_lookup_memories(scope?, term?)`.
- Global knowledge excerpts → `operator_lookup_knowledge(query)` — the one semantic handler.

### Layer B — Domain-first retrieval handlers

A small set of deterministic handlers, each scoped to one operator domain. Each is a **pure read** against tenant-scoped tables, returns a typed JSON shape, costs bounded time, and can be called by the LLM via the existing tool-loop pattern.

| Handler | Retrieval style | Primary source |
|---|---|---|
| `operator_lookup_projects` | Deterministic (name, location, `project_type`, stage) | `weddings`, `people`, `wedding_people` |
| `operator_lookup_project_details` | Deterministic (by `projectId`) | `weddings`, joins |
| `operator_lookup_people` | Deterministic (name, role) | `people`, `wedding_people`, `contact_points` |
| `operator_lookup_threads` | Deterministic (participant, text, recency) | `threads`, `messages` |
| `operator_lookup_inquiry_counts` | Deterministic (time windows) | `weddings` + `ai_routing_metadata` (existing) |
| `operator_lookup_calendar` | Deterministic (date range, type filter) | `calendar_events` |
| `operator_lookup_studio_analysis` | Deterministic (aggregations) | `weddings` (existing snapshot) |
| `operator_lookup_playbook_rules` | Deterministic (by topic or action_key) | `playbook_rules` |
| `operator_lookup_memories` | Deterministic (by `scope`, `wedding_id`/`person_id`, optional keyword) | `memories` per scope plan |
| `operator_lookup_knowledge` | **Semantic** (pgvector `match_knowledge`) | `knowledge_base` |
| `operator_lookup_app_workflow` | Deterministic (by workflow `id`) | Repo-static app catalog |

All handlers share the same contract shape: `{ tool, input, result, didRun, note? }` — matching the existing read-only-lookup-tools pattern.

### Handler boundary discipline (strict, mutually exclusive responsibilities)

The biggest failure mode of a multi-handler system on a small model like `gpt-4.1-mini` is **tool-selection confusion**: the LLM picks the wrong tool, hallucinates parameters to fit, or burns the 3-call budget on overlapping tools that each return a partial answer. This is mitigated only by making every handler's responsibility crisp and non-overlapping. The rules below are enforced at plan-review time and in each slice.

1. **One tool per recognizable question shape.** Every handler is named for a recognizable operator intent — *resolve a project by name*, *fetch a project's facts by id*, *count inquiries by time window*. If two handlers can plausibly answer the same question, one of them is wrong.
2. **Input signatures are mutually exclusive.** A handler that accepts a natural-language string (e.g. `operator_lookup_projects(query)`) is the **resolver**. A handler that accepts a UUID (e.g. `operator_lookup_project_details(projectId)`) is the **deep-detail fetcher**. These are paired, not overlapping. Never combine them into one handler that accepts either. Never accept UUIDs on the resolver or free-text on the detail fetcher.
3. **No general-purpose overlap.** Do not create a handler like `operator_lookup_anything(query)` or `operator_search(term)` that covers multiple domains. Each handler is scoped to one domain, period.
4. **Handler descriptions drive LLM selection.** The tool's `description` field in the JSON schema is the single most important field for selection quality on a small model. Write it like a recipe: *"Use this when the operator names a project by a partial name, venue, or location. Do not use for questions about calendar events or threads."* Include the anti-patterns as well as the patterns.
5. **Rich output to reduce chaining.** Handler outputs should be rich enough that a typical operator question is answered by **one** handler call. If most call sites of a handler are followed by a call to a second handler for the same entity, merge those concerns into the first handler's output. See §3.5 on latency.
6. **Closed handler set per release.** The set of handlers listed in §3 is the full set. Adding a twelfth handler requires a plan amendment with a written justification, not a slice drift.

Example pairing (canonical form other domains should mirror):

| Handler | Input | Role | Does NOT do |
|---|---|---|---|
| `operator_lookup_projects` | `query: string` | Resolve candidate projects by natural language (name, partial, location, type) | Return deep facts; accept UUIDs |
| `operator_lookup_project_details` | `projectId: UUID` | Return full facts for one known project | Accept names; search |

If a future domain has a different shape (e.g. calendar, where range queries are natural), the resolver/detail split may not apply — but the mutually-exclusive-input principle still does. Document the boundary in that domain's slice doc.

### Layer C — LLM as planner + formatter (not as agent)

The LLM's job each turn:

1. Read the thin shared context and the operator's question.
2. Decide which handlers, if any, to call (bounded budget).
3. Receive handler results as tool messages.
4. Compose a final JSON answer under strict schema.

Hard constraints:

- **Max tool calls per turn:** 3 (unchanged from today's `MAX_LOOKUP_TOOL_CALLS_PER_TURN`).
- **One handler round, then commit.** No recursive planning; no multi-hop tool chains.
- **No new "planner" model.** Same `gpt-4.1-mini`, same temperature, same two-pass structure.
- **No dynamic tool synthesis.** The handler set is static per release.

This is not an agent. It is the same two-pass tool loop we already have, with more handlers and less pre-loaded context.

### Latency considerations and compound handlers

Moving from push to pull trades prompt size for tool-call round trips. That tradeoff is worth it when handlers are cheap and rarely chained, and poor when chains become routine. Three explicit rules guide this:

**Rule 1 — Prefer one-call answers.** Every handler output must be rich enough that the typical question in that domain is answered in one call. `operator_lookup_project_details` should return project facts + wedding_people + contact_points + counts in one shot — not force a cascade of three sub-handlers. If a handler's typical caller needs a second call to answer the original question, the handler's output is too thin and should be widened (within the bounded caps the slice doc defines).

**Rule 2 — Sequential chains are a latency risk, not a design goal.** Each added handler in a chain adds one LLM round-trip (~300–800 ms) plus handler-execution time. A two-chain call for a single question can easily add a full second to perceived latency. The plan allows chains (the 3-call budget permits it) but the design intent is that chains are exceptions, not the norm.

**Rule 3 — Parallelism is allowed but not required.** OpenAI tool-calling supports parallel tool calls in one round. When the LLM correctly identifies two unrelated handler calls (e.g. *"what's on my plate and did Nocera reply?"* → `operator_lookup_inquiry_counts` + `operator_lookup_threads`), parallel invocation collapses them to one round-trip instead of two. Let the model do this when it naturally does; do not engineer a "parallel tool planner." The system prompt may briefly note that when two handler calls are independent, they can be called together, and leave it at that.

### Compound deterministic handlers (allowed future pattern)

Some recurring operator questions span multiple domains in a single ask and genuinely need an aggregate. Example operator utterances:

- *"What's on my plate today and did the Nocera client reply?"*
- *"What's urgent and do we have anything on the calendar for them?"*
- *"Give me the morning briefing."*

Asking the LLM to plan 2–3 sequential tool calls for these compounds the latency trap and spends the 3-call budget on overlapping reads. The allowed pattern — **but only when a question shape repeats enough to justify it** — is a **compound deterministic handler** that returns a bounded aggregate in one call.

Candidate examples (not built yet; mentioned so future slices know the category is legal):

- `operator_lookup_daily_briefing` — aggregate of operator-state counts + recent escalation highlights + the three most urgent threads by activity. Single deterministic SQL round-trip.
- `operator_lookup_project_overview` — project facts + recent thread activity for that project + upcoming calendar events for that project. Single deterministic round-trip keyed on `projectId`.

**Constraints on compound handlers (non-negotiable):**

1. **Deterministic and bounded.** No LLM inside the handler. No unbounded joins. Every output field is caps-enforced (row counts, character lengths).
2. **Scoped to a proven recurring operator question.** Do not create compound handlers speculatively. A compound handler needs telemetry showing the underlying handler-chain is frequent, or a written operator-journey justification in the slice doc.
3. **Narrow, specific names.** `operator_lookup_daily_briefing` is narrow. `operator_lookup_everything` is not — reject such handlers at review.
4. **No agent creep.** A compound handler returns data. It does **not** execute multi-step plans, call other handlers internally, or use heuristics to choose what to include — the shape is fixed at the code level.
5. **Additive, not replacement.** Compound handlers live alongside the narrow handlers; they do not replace them. The underlying narrow handlers must still exist for cases where only part of the aggregate is needed.

Compound handlers are a pressure-release valve for cross-domain questions within the 3-call budget. They are not a license to widen handler scope generally.

---

## 4. What stays vs what changes

### Stays (non-negotiable)

- `clientFacingForbidden: true` flag — the operator widget never produces client-facing prose.
- Propose → confirm for every mutation (`playbook_rule_candidate`, `task`, `memory_note`, `authorized_case_exception`).
- Tenant isolation via `photographer_id` filter inside every handler.
- Strict JSON schema response (from the structured-outputs slice).
- Prompt caching prefix stability (from the caching slice).
- Session history (bounded 3 turn pairs).
- The persona writer's separate voice architecture for client-facing prose (`persona.ts`, Claude tool loop). Out of scope here.
- The existing three tools (`operator_lookup_projects`, `operator_lookup_threads`, `operator_lookup_inquiry_counts`). They stay; new ones join them.

### Changes (in sequenced slices)

- `buildAssistantContext.ts` — stops assembling the full dossier; assembles only the thin shared context. Gradual per-domain reduction.
- `formatAssistantContextForOperatorLlm.ts` — the STABLE and PER_QUERY bands shrink as handlers cover each domain.
- `completeOperatorStudioAssistantLlm.ts` — same call site, but with a larger handler registry and an updated system prompt about which handler to reach for.
- System prompt — one paragraph that names the handler set and instructs *"use the handler that matches the question domain, then answer."* Handler-domain mapping in plain English.

### Sequencing (high level — details in slice docs)

1. **Projects / CRM** domain first (execution slice below). Replace the CRM digest + focused project facts with `operator_lookup_projects` + `operator_lookup_project_details`.
2. **Threads / recent communication** next (`operator_lookup_threads` already exists; move pre-loaded thread activity out of shared context).
3. **Calendar / schedule** (`operator_lookup_calendar` — may require a new handler).
4. **Memory** (per-scope lookups) and **playbook** (rule-by-topic/action) next.
5. **Studio analysis** last, because it's already intent-gated.

Each slice is independently mergeable and feature-flagged.

---

## 5. Likely files/modules involved

Across the whole plan (each slice touches only a subset):

### New

- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantProjectDetailsTool.ts` — new handler for deep project lookup.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantPeopleTool.ts`.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantCalendarTool.ts`.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantStudioAnalysisTool.ts`.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantPlaybookRulesTool.ts`.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantMemoriesTool.ts`.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantKnowledgeTool.ts` (wraps `match_knowledge`).
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantAppWorkflowTool.ts`.

### Modified

- `buildAssistantContext.ts` — progressively thins.
- `formatAssistantContextForOperatorLlm.ts` — progressively drops block emitters per slice.
- `completeOperatorStudioAssistantLlm.ts` — handler registry grows; system prompt updated per slice.
- `src/types/assistantContext.types.ts` — the `AssistantContext` type becomes thinner and more explicit about what is present vs lazy.

### Not touched

- Persona writer files.
- Memory scope schema (`scope`, `person_id`, `archived_at` all already planned).
- Playbook / authorized-case-exception tables.
- Any tenant isolation or RLS policy.
- `match_knowledge` RPC — used as-is behind the new knowledge handler.

---

## 6. Acceptance criteria (plan-level; slice docs have their own)

1. **Thin shared context:** after all slices land, the shared context contains only the items listed in §3 Layer A. Any push-domain data must come from a handler call.
2. **Handler set complete:** every major operator domain has a corresponding handler; the LLM has no reason to guess from a pre-loaded block.
3. **No agent drift:** the system remains a bounded two-pass tool loop with a hard 3-call budget. No feature flag or slice introduces recursive planning.
4. **Domain correctness:** operator questions that name a project by `project_type` (commercial, video, other) do not produce wedding-flavored answers. This is directly tested in the project-type semantics slice.
5. **Follow-ups work:** the carry-forward pointer resolves pronouns for the common follow-up patterns; explicit topic change clears it.
6. **Cost & latency neutral or better:** after the architecture settles, per-call average input-token count is ≤ today's, measured by the caching-slice telemetry. Latency is within ±10% for cold calls; better for warm-cache calls because the shared context is smaller.
7. **No regression on the existing write paths:** propose → confirm flow for rules/tasks/memories/exceptions continues unchanged.

---

## 7. Tests required at the plan level

Beyond the per-slice tests:

- **End-to-end "wrong-source" regression fixtures.** For each major failure mode we've seen (wedding bleed on commercial question, named-entity miss, cross-domain answer), ship a mocked-LLM integration test that asserts: the correct handler was called AND no pre-loaded block was cited in the reply.
- **Thin-context fingerprint test.** After each slice, assert that the shared-context user band's total character size is within a declared budget. Regression lock: budget only decreases or stays flat across slices.
- **Tool-call budget test.** Every slice's integration test asserts ≤ 3 tool calls per turn.

---

## 8. Risks / tradeoffs

- **Sequential chains add latency.** Each extra handler call in a chain adds ~300–800 ms. A two-chain answer can easily add a full second of perceived latency. Mitigations: rich handler outputs (one-call answers for typical questions), allow parallel tool calls when the LLM naturally groups them, and keep the 3-call budget as a hard ceiling — **do not raise it**. If a class of question routinely needs a chain, that is a signal the underlying handlers are too narrow or a compound handler is warranted (see §3).
- **Tool-selection confusion on a smaller model.** `gpt-4.1-mini` can pick the wrong tool, hallucinate parameters, or burn the budget on overlapping handlers. Mitigations: strict boundary discipline in §3 (mutually exclusive input signatures, no general-purpose overlap, anti-patterns in tool descriptions); integration-test fixtures that assert the expected handler path per canonical operator question. If selection quality is measurably bad in telemetry, the first response is to tighten tool descriptions and shrink the handler set — **not** to upgrade the model.
- **Cross-domain budget pressure.** Compound questions ("what's on my plate *and* did Nocera reply?") span two domains in one ask. The 3-call budget technically allows this, but when the pattern is frequent enough that operators feel it, answer with a compound deterministic handler (§3). Do not raise the budget.
- **Domain-first thinking requires new discipline in reviews.** Every new feature request will tempt engineers to add a block to the pre-loaded context. The plan forbids this; new features go through handlers unless they are genuinely tenant-stable shared context.
- **Handlers proliferating.** Cap the handler count at the eleven listed in §3 plus any compound handlers justified under the §3 rules. Adding a twelfth narrow handler or a new compound handler requires a plan amendment with a written justification.
- **Semantic retrieval scope.** Only `operator_lookup_knowledge` uses vector search. All other handlers stay deterministic. Do not add semantic retrieval for projects, threads, or memories without a product signal that deterministic search has measurably failed.
- **Project-type bleed remains.** The project-type semantics slice is the defense; this plan enforces the rule but the slice makes it measurable.

---

## 9. Rollout order (per-slice — see individual slice docs)

1. **Slice 0 (already drafted):** `V3_OPERATOR_ANA_PROMPT_CACHING_SLICE.md` + `V3_OPERATOR_ANA_STRICT_STRUCTURED_OUTPUTS_SLICE.md`. These land first. They are compatible with the domain-first plan and reduce the cost/latency overhead of the later slices.
2. **Slice 1 — Projects / CRM domain-first.** See `V3_OPERATOR_ANA_PROJECTS_DOMAIN_FIRST_EXECUTION_SLICE.md`. Single biggest visible improvement. Covers multi-project-type correctness directly.
3. **Slice 2 — Project-type semantics.** See `V3_OPERATOR_ANA_PROJECT_TYPE_SEMANTICS_SLICE.md`. Language and prompt discipline across domains. Lands alongside Slice 1 or immediately after.
4. **Slice 3 — Follow-up carry-forward.** See `V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md`. Independent of Slices 1–2 except it references the `focusedProjectId` pointer.
5. **Slice 4 — Threads / recent-communication domain.** Move thread activity out of shared context into the existing `operator_lookup_threads` handler path; drop the block from the formatter.
6. **Slice 5 — Calendar domain.** New handler; drop the calendar block from shared context.
7. **Slice 6 — Memory / playbook / studio analysis domains.** Trail slices; each drops a shared-context block in favor of a handler call.
8. **Slice 7 — Knowledge domain.** Already semantic; keep `match_knowledge`; wrap it in a tool-style handler so the LLM invokes it when it actually needs it rather than always seeing excerpts.

Each slice is individually mergeable with its own feature flag. The architecture reaches steady state after Slice 7.

---

## 10. What we explicitly do NOT do

- **No autonomous agent.** No recursive planning, no self-invoked multi-hop tool chains, no long-horizon goal pursuit.
- **No removal of shared context entirely.** Identity, focus pointers, app catalog, playbook coverage summary, operator-state counts, carry-forward, and session history stay.
- **No new LLM model just for planning.** Same model, same temperature.
- **No memory hygiene / scoring / clustering.** Those are deferred per the memory scope plan and stay deferred.
- **No web search, no OpenAI file search, no code interpreter, no voice/TTS.** Rejected in the prior OpenAI-capabilities analysis.
- **No speculative cross-tenant features.** Tenant isolation stays inviolable at every handler.
- **No wedding-specific defaults in any handler.** Every handler treats `project_type` as a first-class field (see project-type slice).

---

## Appendix — One-line summary

**Thin the shared context to identity + focus + tiny summaries. Give each operator domain a deterministic handler with strict, mutually exclusive input signatures and rich outputs so most questions resolve in one call. Use the LLM as a disciplined planner that calls at most three handlers per turn and commits to a strict-schema answer. Add compound deterministic handlers only when a cross-domain question shape recurs. Roll it out one domain at a time.**
