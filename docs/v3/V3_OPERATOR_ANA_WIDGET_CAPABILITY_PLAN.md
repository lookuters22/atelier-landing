# V3 Operator Ana Widget — Capability Plan

> **Status:** Active. Canonical product/architecture plan for the operator-facing Ana widget.
> **Surface:** The "Ask Ana" widget in the studio operator dashboard. Operator-only, never client-facing.
> **Scope:** Defines what the widget should cover, how it should be built, and where the line sits between *studio manager*, *generic chatbot*, and *autonomous agent*.
> **Companion:** `V3_OPERATOR_ANA_WIDGET_CAPABILITY_SLICES.md` — ordered execution slices.
> **Depends on:** `V3_PRODUCTION_MEMORY_SCOPE_PLAN.md` — the memory scopes this widget reads.

---

## 1. Problem statement

### What the widget is today

The operator widget exists and is wired end-to-end:

- **Entry point:** `src/components/SupportAssistantWidget.tsx`
- **Handler:** `supabase/functions/_shared/operatorStudioAssistant/handleOperatorStudioAssistantPost.ts`
- **Retrieval:** `supabase/functions/_shared/context/buildAssistantContext.ts`
- **LLM call:** `completeOperatorStudioAssistantLlm.ts` (OpenAI `gpt-4o-mini`, plain-text completion)
- **Context formatter:** `formatAssistantContextForOperatorLlm.ts`

Context the widget receives: studio memory (via `scope='studio'`), focused project/person memory, `playbook_rules`, `authorized_case_exceptions`, `knowledge_base`, and a thin CRM digest. Output flows to an operator-only UI, **firewalled from client-facing prose** via the `clientFacingForbidden: true` flag established in the memory scope plan.

### What is still missing

Real usage surfaced six concrete gaps:

1. **Structured project truth is thin.** `fetchAssistantCrmDigest` loads only `id, couple_names, stage, wedding_date` from `weddings`. `location`, `package_name`, `contract_value`, `balance_due`, `project_type`, `wedding_people`, and `contact_points` are never loaded. When the operator focuses a project and asks "what's the venue?", Ana may say "unavailable" even though the project page shows it clearly.
2. **No external data access.** No weather, no timezone, no sunset-time, no geocoding. The LLM call has no `tools` parameter; there is no dispatcher.
3. **No operator write/action pathway.** The widget cannot help the operator create a playbook rule, a task, or a memory note. The `tasks` table and `playbook_rule_candidates` pipeline exist but are not callable from the assistant.
4. **Refusal-heavy conversational tone.** The current system prompt does not handle small talk. "How are you?" reads as off-scope and gets deflected. This breaks the "colleague sitting beside me" feel.
5. **No grounded studio-analysis capability.** Questions like *"are we undercharging?"*, *"which packages convert best?"*, *"is destination work worth it for us?"* are real operator questions. The widget currently either refuses them or answers unhelpfully because it has no aggregated CRM/bookings/finance read surface.
6. **No app-knowledge grounding.** Operators regularly ask how to use the app itself — *"where do I find drafts?"*, *"how do I approve a rule candidate?"*, *"what does Needs filing mean?"*, *"where do I edit the venue?"*, *"why is this thread in operator review?"* The widget has no catalog of the app's routes, labels, statuses, or workflows. It currently either guesses (hallucinating buttons that don't exist) or refuses. Both are wrong; a studio manager sitting beside the operator is expected to help them use the software too.

### Why this is no longer just a memory problem

The memory scope plan (`V3_PRODUCTION_MEMORY_SCOPE_PLAN.md`) made memory retrieval production-safe. But the remaining gaps are **capability gaps**, not retrieval gaps:

- The venue problem is a **structured-read gap** on the CRM side.
- The forecast problem is an **external-tool gap**.
- The rule-update problem is a **write-path gap**.
- The "how are you" problem is an **interaction-layer gap**.
- The "are we undercharging" problem is a **grounded-analysis gap** — a read over aggregated studio data that is not currently composed.
- The "where do I find X" problem is an **app-knowledge gap** — a read over a small structured catalog of the app's own surfaces. This catalog does not currently exist in the repo; route, label, and status information is scattered across `src/App.tsx`, `NavigationDock.tsx`, and the per-mode `*ContextList.tsx` files.

This plan addresses those six capability gaps as separate planes, reusing existing infrastructure wherever possible.

---

## 2. Product framing

### Ana widget = studio manager / operator colleague AND software guide

The widget is the operator's colleague in a side pane. Bounded, contextual, tenant-scoped, colleague-voiced, propose-don't-execute, honest about what it doesn't know.

It serves two intertwined roles:

- **Studio manager** — help with the operator's actual studio work (inbox, projects, decisions, rules, tasks, analysis).
- **Software guide** — help the operator *use the app itself*: where things live, what labels mean, how to perform an action in the UI, why a thread is in a particular bucket. A manager who knows the office tools their colleague is using.

Both roles share the same widget, the same voice, the same propose-don't-execute safety model. Software-guide answers are grounded in a structured app catalog (Plane 7 below), not invented.

### What the widget should help with

Framed in operator jobs, not technical terms:

- **Running the inbox** — "what's waiting?", "is there anything urgent?", "what's stalled?"
- **Handling inquiries** — "is this serious?", "does this fit our policy?", "what have we quoted before for similar?"
- **Checking project details** — "what's the venue/date/package/contact for Thorne?"
- **Making decisions** — "can I promise a 2-week turnaround?", "is this within our travel policy?"
- **Coordinating work** — "remind me to chase Sophia Friday", "what's due this week?"
- **Remembering rules / preferences** — "add a rule that we don't shoot with speedlights", "remember this couple dislikes flash"
- **Checking live / logistics info** — "forecast for Sorrento June 6?", "what time is sunset in Capri on Sep 26?"
- **Grounded studio analysis** — "are we undercharging?", "which packages convert best?", "is destination work worth the overhead for us?"
- **Using the app itself** — "where do I find drafts?", "how do I approve a rule candidate?", "what does Needs filing mean?", "where do I edit the venue for Thorne?", "why is this thread in operator review?"
- **Natural conversation** — acknowledgements, small talk, clarifying questions, in a colleague voice

### Distinguishing from adjacent products

| Surface | Role | Ana widget posture |
|---|---|---|
| **Client-facing reply (persona writer)** | Writes prose sent to clients, grounded in `buildDecisionContext`, firewalled from raw memory | **Widget never produces client-bound prose.** `clientFacingForbidden: true` flag is structural. |
| **Generic ChatGPT** | Unbounded assistant, any topic, no tenant grounding | **Widget refuses generic assistant behaviors** (arbitrary coding help, trivia, creative writing unrelated to studio ops) with a brief polite redirect. |
| **Autonomous agent** | Long-horizon multi-step goal pursuit, unsupervised mutations | **Widget is explicitly not an agent.** Every write is proposed and then operator-confirmed. No planner-worker architecture. |

The widget is the **manager/colleague** position between these extremes and stays there by construction.

---

## 3. Capability model

Nine operator-facing capability buckets the widget should cover. Each is a product concept; implementation is addressed in the next section.

**B1 — Brief me.** Summarize state for a thread, project, person, the inbox, or "today." Structured read; structured output.

**B2 — Look things up.** Answer a specific CRM / memory / playbook / knowledge question. Pointed read; factual answer.

**B3 — Help me decide.** Weigh a situation against playbook + past memory + current context. Bounded recommendation; never binding.

**B4 — Tell me what to do next.** Read `Today` buckets (inquiry / needs-filing / operator-review / drafts / decisions / tasks from the Today-tabs semantics) and surface the most useful next action.

**B5 — Apply / update rules.** Propose a `playbook_rule_candidate` or `authorized_case_exception`; operator confirms; existing RPC promotes. Never direct writes to `playbook_rules`.

**B6 — Create tasks / notes / follow-ups.** Propose a `task`, `memory`, or scheduled reminder; operator confirms; narrow write endpoint executes.

**B7 — Live / logistics help.** Bounded external reads (weather, timezone, sunset) via typed LLM tool calls, cached, rate-limited, tenant-scoped.

**B8 — Grounded studio analysis.** Read over aggregated CRM + bookings + finance + pipeline data to answer evidence-based questions. **In scope.** The distinction from generic consulting is strict: analysis must be grounded in the studio's own data. See §6 for the full scoping rule.

**B9 — Help me use the app.** Answer questions about the app's own surfaces: where to find a tab, what a status or chip means, how to perform an action in the UI, why a thread landed in a particular bucket, which settings page owns a configuration. Grounded in a structured in-repo app catalog (Plane 7). **Not** a generic software-help feature and **not** a rewrite of the UI's tooltips — the widget answers from the catalog or admits gaps.

Conversational handling (small talk, tone, refusal classes) is not a capability bucket — it's a quality attribute that applies across all nine. It lives in the prompt/interaction plane (§4).

---

## 4. Capability planes — architecture model

Seven planes, each with a distinct contract and safety boundary. Every capability in §3 maps to one or two planes.

### Plane 1 — Internal reads (mostly live)

Studio memory, project/person memory (when focused), `playbook_rules` merged with `authorized_case_exceptions`, `knowledge_base`, CRM digest. Governed by `buildAssistantContext`. Free to invoke per request. Tenant-scoped by `photographer_id`.

**Current gap covered:** Plane 1 is mostly live; structured project truth (§1 gap 1) is the one hole and Slice 1 closes it by extending the CRM digest.

### Plane 2 — Structured project truth (extended reads)

When the widget call includes `focusedWeddingId`, additionally load:

- Full `weddings` row: `location`, `package_name`, `contract_value`, `balance_due`, `story_notes`, `project_type`
- `wedding_people` joined with `people` for role context
- `contact_points` for the people on this wedding
- Optionally: open `tasks`, recent `escalation_requests`, recent `drafts` (counts + status, not bodies)

Same for `focusedPersonId` where applicable. This is not a new table; it's an expanded selector on the existing CRM schema.

### Plane 3 — External read tools

LLM tool calls that reach outside the tenant database for bounded live data.

- Typed input/output schemas
- Server-side dispatcher with per-tool auth, caching (TTL per logical key), rate-limiting (per-tenant)
- No PII outbound
- Deterministic, idempotent, observable

**First tool:** `lookup_event_weather(location, date)` — most common studio question tied to live data.
Later tools: `lookup_location_timezone`, `lookup_location_sunset`, `lookup_location_coordinates`.

### Plane 4 — Proposed actions (structural, no execution)

Assistant emits a typed `ProposedAction` in its response. The UI renders it as a confirmation card with Accept / Edit / Reject.

Kinds:
- `playbook_rule_candidate` — operator wants to add/update a rule
- `authorized_case_exception` — operator wants to bend a rule for a case
- `task` — operator wants a reminder or to-do
- `memory_note` — operator wants to remember a fact (uses the `scope` model from the memory plan)
- `studio_setting_change` — operator wants to change a tenant-level setting (later)

Proposals are free to emit; execution is Plane 5.

### Plane 5 — Confirmed executions (operator-gated writes)

Triggered only by explicit UI confirmation of a Plane 4 proposal. Never autonomous.

Execution paths (reuse first; add narrow endpoints only when no existing path applies):

- `playbook_rule_candidate` → new narrow edge handler `insert-operator-assistant-playbook-rule-candidate` inserts into `playbook_rule_candidates` with `source_type='operator_assistant'`. Subsequent promotion uses existing `review_playbook_rule_candidate` RPC + edge handler.
- `authorized_case_exception` → reuse `complete_learning_loop_operator_resolution` RPC or add a narrower insert endpoint; tenant-auth required.
- `task` → new narrow edge handler `insert-operator-assistant-task` inserts into `tasks`.
- `memory_note` → new narrow edge handler `insert-operator-assistant-memory` inserts into `memories` with operator-chosen `scope` (per the memory scope plan).
- `studio_setting_change` → new narrow edge handler wrapping `patchPhotographerSettingsAdmin` with operator-tenant auth.

Every execution persists audit lineage back to the assistant session that proposed it.

### Plane 6 — Prompt / interaction layer

System prompt governs: Ana's voice, scope boundaries, refusal classes, social handling, propose-don't-execute contract, honesty about missing context.

Not a feature plane; a qualifier across all the others. Tuning lives in `completeOperatorStudioAssistantLlm.ts`.

### Plane 7 — App knowledge catalog

A small, structured, in-repo catalog describing the app's operator-facing surfaces:

- **Routes** — top-level paths (`/today`, `/inbox`, `/pipeline`, `/pipeline/:id`, `/calendar`, `/workspace`, `/directory`, `/settings`, `/onboarding`) and a short human description of each.
- **Nav dock items** — labels, icons, target routes.
- **Per-mode left-rail sections** — e.g. Inbox (Primary, Starred, Drafts, Sent, All mail, Ana routing → Ana drafts / Escalations / Auto-filed, Projects, Gmail labels); Today (Drafts, Inbox threads, Tasks, Escalations); Pipeline (Inquiries, Active bookings, Deliverables, Archived); Calendar (event-type filters, workspaces, timezones); Workspace (Financials, Sales, Studio Tools); Directory (Contacts, Clients, Vendors, Venues).
- **Label / chip / status vocabulary** — project stages (`inquiry → consultation → proposal_sent → contract_out → booked → prep → final_balance → delivered → archived`); inbox buckets (Inquiry, Needs filing, Operator review, Promo & system); draft statuses (`pending_approval`, `approved`, `rejected`); task status vocabulary; automation modes (`automation_mode`, `compassion_pause`, `strategic_pause`, `agency_cc_lock`); calendar event types (`shoot`, `consult`, `travel`, `block`).
- **"Where do I do X" pointers** — short imperative entries like *"edit venue → Pipeline → open project → Overview card → Edit"*, *"approve a rule candidate → Settings → Playbook → Candidate review"*, *"change automation mode → Pipeline → open project → Manual controls card"*.

This catalog **does not exist in the repo today.** Route, label, and status information is scattered across `src/App.tsx`, `src/components/Dock/NavigationDock.tsx`, and the per-mode `InboxContextList.tsx` / `TodayContextList.tsx` / `PipelineContextList.tsx` / `CalendarContextList.tsx` / `DirectoryContextList.tsx` / `WorkspaceContextList.tsx` files. Creating the catalog as a machine-readable module is the smallest safe enabling step for B9; it is called out explicitly in the slice plan.

**Contract rules:**
- Static TypeScript module, versioned with the repo, updated when UI structure changes.
- Read-only; no runtime component introspection from the assistant.
- Loaded into assistant context either always (bounded; small size) or gated when the query pattern looks like app-help. Start with always-loaded.
- Not a substitute for tooltips, onboarding, or help docs — it's the grounding layer that lets the widget answer from fact rather than guess.

---

## 5. Existing repo pieces to reuse

Do not invent. Everything below is already in the repo.

| Need | Reuse |
|---|---|
| Retrieval foundation | `buildAssistantContext.ts` (extend; do not replace) |
| CRM read shape | `fetchAssistantCrmDigest.ts` (extend selector list) |
| Memory scope retrieval | `selectAssistantMemoryIdsDeterministic` + `fetchSelectedMemoriesFull` per memory scope plan |
| Playbook authority | `fetchActivePlaybookRulesForDecisionContext` + `deriveEffectivePlaybook` + `fetchAuthorizedCaseExceptionsForDecisionContext` |
| Knowledge base | `fetchRelevantGlobalKnowledgeForDecisionContext` + `match_knowledge` RPC |
| Rule-candidate creation → promotion | `playbook_rule_candidates` table + `review_playbook_rule_candidate` RPC + edge handler |
| Case exception creation | `complete_learning_loop_operator_resolution` RPC (artifacts array supports `authorized_case_exception`) |
| Task writes | `tasks` table (pattern used by `runV3ThreadWorkflowDueSweep.ts`) |
| Memory writes | `memories` insert path (with `scope` + `person_id` per memory scope plan) |
| Settings writes | `patchPhotographerSettingsAdmin` (in `supabase/functions/_shared/settings.ts`) — wrap for operator-tenant use |
| LLM tool-use pattern | `supabase/functions/inngest/functions/persona.ts:109-192` — working Anthropic tool loop to model against; operator widget on OpenAI can use native function-calling |
| Knowledge retrieval for tools | `match_knowledge` RPC pattern |
| Inbox / Today bucket derivation | `deriveInboxBucket` + the Today-tabs work (reuse for B4 "what's next") |
| App surfaces / routes / labels | **Not yet centralized.** Routes live in `src/App.tsx:37-159`; nav dock in `src/components/Dock/NavigationDock.tsx:15-23`; per-mode left-rail vocabulary in `InboxContextList.tsx`, `TodayContextList.tsx`, `PipelineContextList.tsx`, `CalendarContextList.tsx`, `DirectoryContextList.tsx`, `WorkspaceContextList.tsx`; stage mapping in `PipelineContextList.tsx:24-51`; automation mode labels in `WeddingManualControlsCard.tsx`; calendar event types in `CalendarContextList.tsx:26-31`. **Reuse as authoring sources** to populate the Plane 7 catalog; the assistant never queries these components at runtime. |

**Net-new:**
- Tool dispatcher skeleton (small, ~1 file)
- `ProposedAction` type + response schema
- A handful of narrow edge handlers for execution (one per write kind)
- **App knowledge catalog module** (Plane 7; machine-readable, in-repo) and a loader that injects a bounded excerpt into assistant context
- Optional: `fetchStudioAnalysisSnapshot` for Plane 1 expansion when studio-analysis slices land

---

## 6. Must-have / next / later / out-of-scope

### Must have now (widget is not trustworthy without these)

- **Full structured project truth in focused mode** (Plane 2 extension). Fixes the venue-unavailable class of bug.
- **Inbox / Today state recall** (B4 via existing bucket derivation).
- **Playbook-first decision support** (B3) — answer policy questions by quoting effective policy with source attribution.
- **Natural conversational behavior** (Plane 6 prompt tune). Social openers answered briefly and warmly.
- **"What I don't know" behavior** — when context is missing, say what's missing and where to check in the app.
- **App-help responses grounded in a catalog** (B9; Plane 7). Operators using the app for the first time will ask navigation/label/status questions on day one. Depends on the enabling slice that builds the catalog.

### Next wave

- **First external tool: weather** (Plane 3; B7).
- **`ProposedAction` response schema** (Plane 4; prepares B5/B6).
- **Confirmed execution for `playbook_rule_candidate`** (Plane 5; B5).
- **Cross-thread person-scope recall** (memory-plan Slice 4 already wires this; widget just passes participant `person_id`s).
- **Day-start / day-end summary** (B1 at studio scope).
- **Thread-contextual widget behavior** — widget auto-passes focused thread/project.

### Later

- **Second/third external tools:** timezone, sunset, geocoding.
- **Confirmed execution for tasks** (B6, task kind).
- **Confirmed execution for memory notes** (B6, memory kind).
- **Confirmed execution for `authorized_case_exception`** (B5, exception kind).
- **Scheduled reminders / follow-ups** — tasks with due dates that surface on Today.
- **Multi-turn session state** — bounded per-session history; no cross-session memory.
- **Grounded studio analysis (B8).** Aggregated CRM + bookings + finance + pipeline read over the tenant's own data. See §6.1 for the scoping rule.
- **Studio settings mutations** via propose → confirm.

### Out of scope for this widget

- Drafting or sending anything client-facing. That surface is the thread-level persona writer.
- Generic web browse / search / research.
- Payments, contract generation, legal drafting.
- Cross-tenant questions (tenant isolation is inviolable).
- Autonomous multi-step action chains.
- Medical, legal, financial advice unrelated to studio ops.
- Cross-session personal chat history.
- Creative direction / artistic opinions / "should I change my style."
- **Generic ungrounded business consulting.** See §6.1.
- **Generic software documentation or third-party help.** B9 app-help answers come from the in-repo Plane 7 catalog only. The widget does not explain React, Gmail, browser behavior, or any tool outside this app. If the catalog doesn't cover a surface, the widget says so and points the operator at Settings / Onboarding or suggests raising it as feedback.

### 6.1 The grounded-analysis scoping rule

The widget's B8 capability is **in scope** and non-trivial. The distinction:

**In scope (grounded studio analysis).** Questions answered from the studio's **own data**: bookings history, `weddings.contract_value`, `package_name` + booking mix, `stage` funnel conversion, project-type distribution, `payments` (if wired), travel frequency, time-to-booking, cost-to-book proxies, client-retention signals, recent win/loss ratios.

**Concrete examples that must be supported:**
- "Are we undercharging?" — compare recent `contract_value` distributions to package list and industry-neutral anchors in `playbook_rules` or onboarding.
- "Which packages convert best?" — funnel view from `stage='inquiry'` through `stage='booked'` by `package_name`.
- "Is destination work worth it for us?" — travel-tagged bookings' `contract_value` vs. local bookings, net of booked-vs-lost ratios.
- "What does our recent data suggest?" — bounded digest of the last N bookings, leads, and outcomes with a factual observation.

**Out of scope (generic consulting).** Opinions not grounded in the studio's own data or explicit policy: market-trend speculation, generic pricing advice, brand positioning, creative direction. If the operator asks a question the data cannot answer, the widget says what's missing and suggests how to capture it.

**Safety of grounded analysis:**
- Output is always framed as *observation*, not binding business advice.
- Numbers cited must come from the structured read; no invented statistics.
- When the sample is too small to support a claim, the widget says so.
- No forecasts without clearly labeling them as projections from current data.
- No comparisons against competitors or the market — only against the studio's own history and stated policy.

This is a real capability, and shipping it later — not in the first wave — is intentional: the read layer, the proposed-action layer, and the tool layer need to be stable before an analytical read is layered on top.

---

## 7. Guardrails

Preserve across every slice.

- **Tenant safety.** Every read and every write filters by `photographer_id = auth.uid()` (or the resolved tenant id). No helper ever queries across tenants.
- **No client-facing prose from the widget.** `AssistantContext.clientFacingForbidden = true`. The persona writer refuses any input carrying this flag.
- **Propose → confirm for writes.** The assistant never executes a mutation. The UI is the consent layer.
- **Rule updates go through candidates.** No direct writes to `playbook_rules`. Promotion uses the existing `review_playbook_rule_candidate` RPC.
- **No hallucinated live data.** Tool calls are typed and cached; tool outputs are cited with source name and "as of" timestamp.
- **Respect the memory scope model.** Cross-project leakage is unrepresentable; person-scope and studio-scope memories obey the caps in `V3_PRODUCTION_MEMORY_SCOPE_PLAN.md`.
- **Respect the writer firewall.** No path routes assistant output into a client-facing writer.
- **Honesty about absence.** When structured reads, tools, or memory cannot answer, the widget says so and suggests where to check.
- **Short system prompt.** Refusal classes are short, explicit, and non-lecturing.
- **Audit lineage on every write.** Every row produced by an execution plane carries `source_type='operator_assistant'` and a reference to the assistant session.
- **No fabricated app surfaces.** For B9 app-help answers, the widget cites only routes, labels, statuses, and workflows that appear in the Plane 7 catalog. It never invents tabs, buttons, settings pages, or status values. If the question is about a surface the catalog doesn't cover, the widget says the catalog doesn't describe it and suggests where the operator might look manually. This guardrail is the primary defense against hallucinated software help.
- **Catalog-UI parity.** When the UI is restructured (route rename, section added, status vocabulary changed), the Plane 7 catalog must be updated in the same PR. A divergence check (lint or test) should fail CI when catalog entries reference strings that no longer appear in the source files. This keeps the catalog honest without runtime introspection.

---

## 8. Final product definition

> **Ana (operator widget) is the studio operator's colleague in a side pane: she reads what the operator is looking at, speaks in the studio's policy, answers evidence-based questions over the studio's own data, explains how to use this app from a grounded catalog, proposes changes for the operator to confirm, never acts alone, and stays out of everything that isn't studio work.**

The widget earns daily use by being fast, grounded, honest about gaps, and never surprising with a write.

---

## Appendix — Capability ↔ Plane map

| Capability | Planes involved |
|---|---|
| B1 Brief me | 1, 2 |
| B2 Look things up | 1, 2 |
| B3 Help me decide | 1, 2, 6 (playbook-first framing) |
| B4 Tell me what to do next | 1 (Today buckets) |
| B5 Apply / update rules | 4 → 5 |
| B6 Create tasks / notes / follow-ups | 4 → 5 |
| B7 Live / logistics help | 3 |
| B8 Grounded studio analysis | 1 (extended aggregate read), 6 |
| B9 Help me use the app | 7 (app catalog), 6 (framing) |
| Natural conversation (quality) | 6 |
