# V3 Operator Ana Widget — Capability Slices

> **Status:** Active. Execution plan for `V3_OPERATOR_ANA_WIDGET_CAPABILITY_PLAN.md`.
> **Audience:** Implementation agents / engineers picking up the widget capability work.
> **Depends on:** `V3_PRODUCTION_MEMORY_SCOPE_PLAN.md` (scope model) and the memory scope slices being in the state described by the capability plan.
> **Principle:** Each slice is additive, independently mergeable, rollback-able, and ships on its own merits.

---

## Ordering rationale

Slices are ordered so that each one delivers real operator value **and** unblocks the next. The ordering is:

1. **Slice 1** — Structured project truth. Highest-impact read gap. Unblocks B1/B2/B3 when the operator has a focused project.
2. **Slice 2** — Prompt / interaction tuning. Pure prompt change. Unblocks B1/B3 conversational framing and is needed before Slice 6 (proposed-action output).
3. **Slice 3** — Today / inbox state recall. Existing bucket derivation, wired into the widget. Unblocks B4.
4. **Slice 4** — **App knowledge catalog (enabling read surface)**. Static machine-readable module describing the app's routes, nav, left-rail sections, label/status vocabulary, and "where to do X" pointers. Does not touch the assistant yet.
5. **Slice 5** — **App-help responses wired into the assistant** (B9). Catalog loaded into assistant context; prompt tuned for app-help framing; divergence check to keep the catalog honest.
6. **Slice 6** — `ProposedAction` response schema (no execution). Structural. Unblocks every write slice.
7. **Slice 7** — Tool dispatcher + first external tool (weather). Unblocks B7 and the tool pattern.
8. **Slice 8** — Confirmed execution for `playbook_rule_candidate`. Highest-leverage write, reuses existing promotion RPC.
9. **Slice 9** — Confirmed execution for `task`.
10. **Slice 10** — Confirmed execution for `memory_note`.
11. **Slice 11** — Confirmed execution for `authorized_case_exception` (case-scoped rule bending).
12. **Slice 12** — Grounded studio analysis read (B8 first cut).

Slices 9–12 are independently reorderable after Slices 1–8 have shipped and show stable telemetry. Slices 4 and 5 form an enabling pair; ship Slice 4 first and Slice 5 once the catalog has at least one round of review.

---

## Slice 1 — Structured project truth in focused mode

### Goal
When the widget call includes `focusedWeddingId`, the assistant sees the full project structure the operator sees on the project page. Closes the "venue unavailable" class of bug.

### Systems / files likely involved
- `supabase/functions/_shared/context/fetchAssistantCrmDigest.ts` — extend to load more columns when a wedding is focused.
- `supabase/functions/_shared/context/buildAssistantContext.ts` — optionally call a new `fetchAssistantFocusedProjectFacts` helper.
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — emit a new "Focused project facts" block near the top of the prompt.
- Types: `src/types/database.types.ts` (regenerated only if any view is added; no schema change required).

### What changes
- When `focusedWeddingId` is set, additionally select from `weddings`: `location`, `package_name`, `contract_value`, `balance_due`, `story_notes`, `project_type`.
- Load `wedding_people` joined with `people(display_name, kind)` for this wedding, bounded (cap ≤ 12 rows).
- Load `contact_points` for the people on this wedding (cap ≤ 12 rows).
- Load counts (not bodies) for: open `tasks`, open `escalation_requests`, pending-approval `drafts` on threads linked to this wedding.
- Formatter emits a clear "Focused project facts" block above the CRM digest, clearly labeled as authoritative structured truth.

### What explicitly does NOT change
- No schema change. No new tables. No migrations.
- No change to memory retrieval, playbook retrieval, knowledge base retrieval.
- No change to unfocused-mode behavior. When `focusedWeddingId` is null, the digest stays as-is.
- No LLM prompt change other than the new facts block.
- No tool use, no writes, no proposed actions.

### Acceptance criteria
- `focusedWeddingId` call returns an assistant response that correctly cites the wedding's `location` when asked "what's the venue?"
- When fields are null on the row (e.g. `package_name` is null), the block omits them rather than printing "null."
- Performance: extra selects are single-wedding and use existing indexes; end-to-end latency budget change < 100 ms.
- Non-focused calls are byte-identical to today's behavior.

### Tests needed
- Unit test for `fetchAssistantCrmDigest` (or new `fetchAssistantFocusedProjectFacts`): returns full row + joined people + contact points for a known wedding.
- Unit test for the formatter: given known inputs, the emitted markdown contains the "Focused project facts" block with expected fields.
- Integration test for `handleOperatorStudioAssistantPost` with a focused-wedding payload: the returned prompt text (logged/debugged) contains the new block.
- Regression test: non-focused call produces identical prompt text to pre-slice snapshot.

### Risks / rollout
- Over-reading: risk of loading too many people/contact rows on a wedding with many participants. Cap at 12 each; document the cap.
- Sensitive fields (`contract_value`, `balance_due`) appear in the operator prompt. Operator-only surface, firewalled from client prose via `clientFacingForbidden`. Acceptable.
- Rollback: revert the formatter emission; selector changes are harmless additive reads.

---

## Slice 2 — Prompt / interaction tuning

### Goal
The widget handles light conversation naturally, stays strictly operator-oriented, and prepares for structured action proposals from Slice 4.

### Systems / files likely involved
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — the system prompt (~15 lines today).

### What changes
- Add a paragraph permitting brief warm replies to social openers ("hi", "how are you", "thanks"). One or two sentences, then an invitation to a studio question.
- Add a concise refusal-class list: no generic coding help, no off-topic search-engine behavior, no medical/legal/financial advice unrelated to studio ops, no creative opinions.
- Reinforce: colleague voice, not terminal voice; answer with what the context supports; say what's missing when it isn't.
- Add "when asked to add a rule / create a task / save a note, produce a structured proposed action" (forward-reference to Slice 4's schema; until Slice 4 lands, the LLM can still describe the intended action in prose, which costs nothing).
- Keep the existing hard rules unchanged: no client-facing copy, playbook is authoritative, never falsely claim things were sent.

### What explicitly does NOT change
- No changes to retrieval, writing, or the LLM model.
- No changes to `handleOperatorStudioAssistantPost.ts`, `buildAssistantContext.ts`, or the formatter.
- No new files.

### Acceptance criteria
- "Hi, how are you?" produces a short warm reply with an offer to help, not a refusal.
- "Write me a poem" gets a polite one-liner redirect.
- "Write me an email to the client" is refused (existing rule; regression lock).
- "Add a rule that we don't shoot flash" is answered with a structured intent the operator can later act on (even before Slice 4; shaped prose is fine).
- Studio-relevant questions are answered as before.

### Tests needed
- Add a golden-prompt test (mocked LLM) verifying the final system prompt text matches the intended shape. This is the regression lock.
- Behavioral tests with a mocked LLM that asserts the request shape (user messages + system prompt) does not regress on existing cases.

### Risks / rollout
- Drift toward generic assistant bloat if the prompt grows later. Keep the prompt short; treat any future addition as a design review line item.
- Rollback: revert the prompt.

---

## Slice 3 — Today / inbox state recall in widget

### Goal
Operator can ask "what's waiting for me?" / "what's urgent?" and get a grounded answer that reads the same Today buckets the UI shows.

### Systems / files likely involved
- `src/lib/inboxThreadBucket.ts` (or equivalent bucket derivation used by the Today tabs).
- `supabase/functions/_shared/context/buildAssistantContext.ts` — extend to load a Today summary for the tenant when the query appears to ask about the inbox or the day.
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — emit a Today summary block when loaded.

### What changes
- Add `fetchAssistantTodaySnapshot(supabase, photographerId)` returning counts + a small sample (ids + subjects, no bodies) for each bucket: inquiry, needs-filing, operator-review, drafts pending, escalations open, tasks due.
- Caller decides when to load (initially: always, bounded; later: gated by query text). Start with always-load for stability.
- Prompt block clearly labels the snapshot as "Today snapshot (read-only; suggest, don't invent)."

### What explicitly does NOT change
- No changes to bucket derivation logic itself.
- No writes. No tool calls. No prompt-based refusal logic.
- No change to unfocused-mode memory retrieval.

### Acceptance criteria
- "What's urgent?" returns a prioritized summary (pulled from escalations + needs-filing counts).
- "What's waiting for me?" summarizes unread/inquiry counts.
- "Is there anything stalled?" references drafts pending or stale inquiries when available.
- Counts match the Today tabs UI.

### Tests needed
- Unit test for `fetchAssistantTodaySnapshot`: known tenant with known rows returns expected counts and sample.
- Integration test: assistant response for "what's urgent" cites counts from the snapshot.
- Regression test: non-Today queries produce the same context size budget as before (acceptable overhead since snapshot is small).

### Risks / rollout
- Over-loading on every call. Keep the snapshot small (< 30 rows total). Document the cap.
- Rollback: stop loading the snapshot; formatter becomes a no-op.

---

## Slice 4 — App knowledge catalog (enabling read surface)

### Goal
Create a single machine-readable in-repo catalog of the app's operator-facing surfaces — routes, nav items, left-rail sections, chip/label/status vocabulary, and "where to do X" pointers — so that a later slice can ground the widget's B9 app-help answers. No assistant wiring in this slice.

### Systems / files likely involved
- **New module:** `src/lib/operatorAssistantAppCatalog.ts` — the catalog itself as typed exported constants.
- **Authoring sources** (read, do not modify): `src/App.tsx:37-159` (routes), `src/components/Dock/NavigationDock.tsx:15-23` (dock), the per-mode left-rail files (`InboxContextList.tsx`, `TodayContextList.tsx`, `PipelineContextList.tsx`, `CalendarContextList.tsx`, `DirectoryContextList.tsx`, `WorkspaceContextList.tsx`), `PipelineContextList.tsx:24-51` (stage labels), `CalendarContextList.tsx:26-31` (event types), `WeddingManualControlsCard.tsx` (automation modes), the Today bucket derivation file (`deriveInboxBucket` + related).
- **New tests:** `src/lib/operatorAssistantAppCatalog.test.ts` — shape and divergence tests.

### What changes
- New module exports typed constants covering (at minimum, for first cut):
  - `APP_ROUTES`: array of `{ path, title, purpose }` for operator-facing routes.
  - `APP_DOCK_ITEMS`: array of `{ label, route, purpose }` matching `NavigationDock`.
  - `APP_MODE_LEFT_RAILS`: per mode (inbox, today, pipeline, calendar, directory, workspace), the list of `{ section, items[] }` with a short description per item.
  - `APP_STATUS_VOCABULARY`: maps of `{ value, humanLabel, meaning }` for project stages, inbox buckets, draft statuses, task statuses (if typed), automation flags, calendar event types.
  - `APP_WORKFLOW_POINTERS`: an array of short imperative entries: *"edit venue → Pipeline → open project → Overview card → Edit"*, *"approve a rule candidate → (current route, once known)"*, *"change automation mode → Pipeline → open project → Manual controls card"*, *"see drafts → Today → Drafts section, or Inbox → Ana routing → Ana drafts"*, *"see escalations → Today → Escalations section"*, *"see auto-filed threads → Inbox → Ana routing → Auto-filed"*.
- All entries are **bounded strings**. No dynamic imports, no runtime component introspection.
- Divergence tests (see below) keep the catalog from silently drifting.

### What explicitly does NOT change
- No assistant code changes. `buildAssistantContext.ts`, `formatAssistantContextForOperatorLlm.ts`, and `completeOperatorStudioAssistantLlm.ts` are untouched.
- No UI component changes.
- No schema, no migrations, no backend.
- No tooltips, onboarding, or help text added to the app UI. This catalog is for the assistant; the UI owns its own labels.

### Acceptance criteria
- Catalog covers every operator-facing route in `src/App.tsx` (test asserts route-path parity).
- Catalog covers every dock item in `NavigationDock` (test asserts label+route parity).
- Catalog covers every left-rail section label rendered in the six per-mode `*ContextList.tsx` files (test asserts substring presence of each expected label).
- Catalog covers every value in the project-stage enum (pipeline stages), inbox-bucket enum (from `deriveInboxBucket`), draft-status enum, and automation-mode flags.
- `APP_WORKFLOW_POINTERS` has at minimum one entry for each of: edit venue/date/package on a project, approve a rule candidate, change automation mode, see drafts, see escalations, see auto-filed threads, reach Settings, reach Onboarding.
- Total catalog size under ~8 KB when serialized (bounded for later prompt inclusion).

### Tests needed
- Unit: shape tests on each exported constant (required fields, no empty strings, no duplicate keys).
- **Divergence tests** (non-negotiable):
  - Route-parity: every `path` in `APP_ROUTES` exists in `src/App.tsx` (regex match on the route file); every top-level route in `src/App.tsx` appears in `APP_ROUTES` (allow an explicit allow-list for routes that are intentionally excluded, e.g. public `/` and `/login`).
  - Dock-parity: every dock item's label and route matches `NavigationDock.tsx`.
  - Stage-parity: every value in the pipeline stage enum appears in `APP_STATUS_VOCABULARY.projectStages`.
  - Bucket-parity: every value returned by `deriveInboxBucket` appears in `APP_STATUS_VOCABULARY.inboxBuckets`.
- Catalog size test: serialized size < 8 KB (fails CI if the catalog grows unbounded).

### Risks / rollout
- **Drift risk** is the main concern. The divergence tests are the defense: a PR that renames a route, adds a stage, or renames a left-rail section without updating the catalog fails CI.
- Scope creep: keep the first-cut catalog minimal. Add coverage incrementally as B9 telemetry shows what operators actually ask.
- Rollback: delete the module; nothing consumes it in this slice.

---

## Slice 5 — App-help responses wired into the assistant (B9)

### Goal
The widget answers app-help questions ("where do I find drafts?", "what does Needs filing mean?", "how do I approve a rule candidate?") grounded in the Slice 4 catalog. No hallucinated tabs, no invented buttons.

### Systems / files likely involved
- `supabase/functions/_shared/context/buildAssistantContext.ts` — load a bounded catalog excerpt and attach it to `AssistantContext`.
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — emit a new "App catalog" block.
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — prompt addition framing B9 answers.
- `src/types/decisionContext.types.ts` (or the assistant-context type file) — typed `appCatalogExcerpt` field on the context.

### What changes
- Catalog import: the edge function reads the catalog module and attaches a bounded excerpt (entire catalog if under 8 KB — it will be for the first cut).
- Formatter emits an "App catalog (authoritative app-surface truth)" block clearly labeled as describing *this app's* routes and labels — not generic software help.
- Prompt addition:
  - *"When the operator asks how to use this app (where to find a tab, what a status or chip means, how to perform an action), answer from the App catalog block above. Quote the label exactly as the catalog uses it."*
  - *"If the catalog doesn't cover the question, say so briefly and suggest Settings or Onboarding. Do not invent tabs, buttons, or status values."*
  - *"Do not answer generic software questions (browser, Gmail, React). Only this app."*
- No change to retrieval of memory / playbook / CRM / knowledge base.

### What explicitly does NOT change
- No write paths. No new edge endpoints.
- No change to `buildDecisionContext` (reply-time context). B9 is assistant-only.
- No change to memory scope, persona writer, or client-facing flows.

### Acceptance criteria
- "Where do I find drafts?" → widget cites the exact left-rail path from the catalog (e.g. *"Today → Drafts section, or Inbox → Ana routing → Ana drafts"*).
- "What does Needs filing mean?" → widget quotes the catalog's definition for the Needs filing bucket.
- "How do I approve a rule candidate?" → widget cites the catalog's workflow pointer; if pointer is missing from the catalog, widget says so and suggests Settings, rather than guessing.
- "How do I rebase a Git branch?" → polite one-line redirect; widget does not attempt to answer.
- Response cites only strings present in the catalog excerpt. A test asserts this for a curated set of questions.

### Tests needed
- Unit test with mocked LLM: assistant response to an app-help question contains a catalog-derived substring.
- **Hallucination guard test:** assistant response to a question about a surface the catalog describes does not contain strings that appear nowhere in the catalog (bounded string-match test on a curated fixture).
- Generic-software-question test: widget declines ("I can help with this app — try Settings or Onboarding.") rather than answering.
- Regression: non-app-help queries produce the same prompt size envelope as before (catalog excerpt is small and additive).

### Risks / rollout
- LLM still may paraphrase in ways that sound like invented tabs even when grounded. The hallucination guard test is the primary defense; if violations recur, tighten prompt wording ("quote label exactly").
- Catalog gaps will surface as operator complaints ("Ana said there's no page for X but I know there is"). That is a prompt-to-update-the-catalog signal, not an assistant bug — handle by updating the Slice 4 catalog and re-running divergence tests.
- Rollback: remove the catalog load from `buildAssistantContext` and drop the prompt paragraph; widget returns to pre-slice B9-absent behavior.

---

## Slice 6 — `ProposedAction` response schema (structural, no execution)

### Goal
The assistant can emit structured proposed actions alongside its prose reply. The UI renders them as confirmation cards. No writes are executed in this slice.

### Systems / files likely involved
- **New type file:** `src/types/operatorAssistantProposedAction.types.ts` — defines the `ProposedAction` discriminated union and the response wrapper.
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — switch to structured output using OpenAI `response_format` (JSON schema) or Anthropic tool-use. Simplest first-cut: OpenAI JSON mode with an explicit schema in the system prompt.
- `supabase/functions/_shared/operatorStudioAssistant/handleOperatorStudioAssistantPost.ts` — extend `OperatorStudioAssistantResponseBody` to include optional `proposedActions: ProposedAction[]`.
- `src/components/SupportAssistantWidget.tsx` — render a confirmation card for each proposed action with Accept / Edit / Reject stubs (buttons don't call anything yet).

### What changes
- `ProposedAction` union kinds: `playbook_rule_candidate`, `authorized_case_exception`, `task`, `memory_note`, `studio_setting_change`. Each with a typed payload.
- LLM is instructed (via prompt) to emit one or more proposed actions when the operator asks to add/update/remember something.
- Response carries `{ replyText, proposedActions?, retrievalLog, clientFacingForbidden: true }`.
- UI renders a card per proposed action with labels reflecting the kind; Accept button is a stub that logs an intent event (for observability only).

### What explicitly does NOT change
- No writes happen. No edge endpoints for execution exist yet.
- `clientFacingForbidden: true` remains on the response.
- Existing read flows unchanged.

### Acceptance criteria
- Operator saying "add a rule that we don't shoot flash" results in a `playbook_rule_candidate` proposed action with sensible fields (`proposed_action_key`, `topic`, `proposed_instruction`, `proposed_decision_mode='forbidden'`, `proposed_scope='global'`).
- Operator saying "remind me to chase Sophia on Friday" results in a `task` proposed action with a parsed `due_date`.
- Operator saying "remember that Marco needs 4-hour scouting" results in a `memory_note` proposed action with `scope='person'` and the matched `person_id` when resolvable from focused context.
- When the query is purely informational, `proposedActions` is empty.

### Tests needed
- Schema tests for each `ProposedAction` kind (golden inputs → expected shape).
- Integration tests with mocked LLM verifying the response contains correctly-typed proposed actions for canonical prompts.
- UI snapshot test that the confirmation card renders for each kind.

### Risks / rollout
- LLM may produce malformed proposals. Validate the JSON schema server-side before returning to the UI; drop invalid proposals with a logged warning.
- Scope creep: only the five kinds listed above. No ad-hoc additions.
- Rollback: remove the `proposedActions` field from the response; UI falls back to prose-only rendering.

---

## Slice 7 — Tool dispatcher skeleton + first external tool (weather)

### Goal
The widget can answer live-data questions about a focused project's date. Single tool, single external API, deterministic.

### Systems / files likely involved
- **New folder:** `supabase/functions/_shared/operatorStudioAssistant/tools/`
  - `registry.ts` — tool registry and dispatcher.
  - `lookupEventWeather.ts` — the first tool.
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — switch from plain completion to OpenAI function-calling (gpt-4o-mini supports it natively).
- `supabase/functions/_shared/operatorStudioAssistant/handleOperatorStudioAssistantPost.ts` — handle the tool-loop (call → dispatch → re-call with tool result → final answer).
- Optional cache table migration: `supabase/migrations/YYYYMMDDHHMMSS_operator_assistant_tool_cache.sql` creating a simple `operator_assistant_tool_cache` (tool name, cache key, payload, fetched_at).

### What changes
- `registerTool(name, { inputSchema, outputSchema, execute })` — small typed registry.
- `dispatchToolCall(name, input, { photographerId })` — validates, caches, rate-limits, returns typed output or a typed error.
- `lookup_event_weather({ location: string, date: string })` — calls a reputable free weather API (Open-Meteo is a low-friction default; document the choice and make it configurable).
- Tool output includes `sourceName` and `asOf` fields. Prompt instructs the LLM to cite those when using the result.
- Cache TTL per `(tool, location, date)` key (e.g. 6h).
- Rate limit per tenant (e.g. 50 tool calls / hour; configurable).

### What explicitly does NOT change
- No other tools added.
- No external data flows outbound except the weather query itself (location string + date). No PII.
- No writes.

### Acceptance criteria
- Operator asks "what's the forecast for Capri on Sep 26?" (with `focusedWeddingId` matching that project, OR with location in the query). The assistant emits a tool call; dispatcher fetches; LLM returns a forecast summary with source name and as-of timestamp.
- Rate-limited tenant gets a graceful error ("weather lookup is currently rate-limited; try again in a few minutes") rather than a silent failure.
- Offline external API: dispatcher returns a typed error; the LLM reports that the lookup failed.

### Tests needed
- Unit test for the dispatcher with a mocked registry.
- Unit test for `lookup_event_weather` with a mocked HTTP response.
- Rate-limit and cache behavior tests.
- Integration test with a mocked LLM: tool call arrives → dispatcher returns fixture → LLM final answer references the fixture.

### Risks / rollout
- External API outage. Fail gracefully; never inject synthesized weather data.
- Cost / rate: Open-Meteo free tier is generous; monitor.
- Tool-selection regression on simple questions. If the LLM invokes the tool unnecessarily, constrain via prompt: "call the weather tool only when the operator explicitly asks about weather/forecast for a specific place and date."
- Rollback: remove the tool registration; LLM falls back to plain completion.

---

## Slice 8 — Confirmed execution for `playbook_rule_candidate`

### Goal
The operator can go from "add a rule for X" to a live `playbook_rules` row with one assistant turn + two clicks (Accept the proposal, Approve the candidate). The only new write path is the candidate insertion; promotion reuses the existing `review_playbook_rule_candidate` RPC.

### Systems / files likely involved
- **New edge handler:** `supabase/functions/insert-operator-assistant-playbook-rule-candidate/index.ts` — POST endpoint, JWT auth, photographer-tenant auth, validates payload, inserts into `playbook_rule_candidates`.
- `src/components/SupportAssistantWidget.tsx` — the `playbook_rule_candidate` confirmation card's Accept button calls the new endpoint.
- Optional: small UI affordance that points the operator at the existing candidate review dashboard after insertion.

### What changes
- New endpoint inserts a row into `playbook_rule_candidates` with: `review_status='candidate'`, `source_type='operator_assistant'`, `originating_operator_text` (verbatim operator message), `source_escalation_id=null`, `observation_count=1` (or per existing constraint).
- Row links back to the assistant session via a new optional column `assistant_session_id UUID` — or, if preferred as zero-schema-change, stored in a small JSON metadata field already on the table. **Prefer the existing metadata field** to avoid a migration; document the contract.
- UI Accept button calls the new endpoint; on success, closes the card with a confirmation; on failure, surfaces the error.
- Subsequent approval by the operator uses the existing `review-playbook-rule-candidate` edge handler — no change to that path.

### What explicitly does NOT change
- `review_playbook_rule_candidate` RPC — untouched.
- `playbook_rules` table — no direct writes from the assistant.
- `authorized_case_exceptions` — out of scope for this slice.
- `complete_learning_loop_operator_resolution` — untouched.
- Memory, tasks, settings — untouched.

### Acceptance criteria
- End-to-end: operator says "add a rule that we decline travel-only inquiries outside Italy" → proposed action card renders → Accept → candidate row exists in `playbook_rule_candidates` with correct fields → operator approves via existing review UI → `playbook_rules` row is created.
- Idempotency: double-clicking Accept does not insert duplicate candidates (use a client-side debounce + server-side idempotency key based on assistant session + proposal id).
- Audit: every created candidate carries `source_type='operator_assistant'` and is attributable to a session.
- Tenant safety: attempting to insert a candidate for a different `photographer_id` than the authenticated tenant is rejected.

### Tests needed
- Unit test for the new edge handler: valid payload inserts; invalid payload (missing required field, cross-tenant) is rejected.
- Integration test: mocked LLM proposes a candidate → Accept → DB check.
- Regression test for `review_playbook_rule_candidate`: still works, promotes candidate to rule.

### Risks / rollout
- Bad candidates polluting the review queue. Rely on the existing human approval gate; Ana never promotes directly.
- Rollback: disable the endpoint; UI Accept button becomes a stub. No data loss.

---

## Slice 9 — Confirmed execution for `task`

### Goal
Operator can turn "remind me to X" into a real task row.

### Systems / files likely involved
- **New edge handler:** `supabase/functions/insert-operator-assistant-task/index.ts` — POST endpoint, auth, validates, inserts into `tasks`.
- UI: Accept button on the `task` proposed-action card calls the new endpoint.

### What changes
- Endpoint inserts into `tasks(photographer_id, wedding_id?, thread_id?, title, due_date?, status='pending')`.
- Task is tagged via an additional JSON field / column if the table has one, with `source='operator_assistant'` and the assistant session reference.
- UI surfaces a confirmation and a link to the task in the Today or Pipeline view.

### What explicitly does NOT change
- `tasks` schema — no migration unless the table lacks a `source` column; prefer an existing metadata/JSON column.
- The existing Inngest-driven task insertion (`runV3ThreadWorkflowDueSweep.ts`) — untouched.
- Task surfacing in the Today view — reuses existing logic.

### Acceptance criteria
- "Remind me to chase Sophia Friday" → Accept → task row exists with sensible `title` and `due_date`.
- Task shows up on Today's Tasks tab.
- Tenant safety: cross-tenant attempt rejected.

### Tests needed
- Unit test for the endpoint (valid / invalid / cross-tenant).
- Integration test: end-to-end.
- UI snapshot test for the task card.

### Risks / rollout
- Inconsistent due-date parsing. Prefer letting the LLM emit a structured `due_date` (ISO) in the proposal; if missing, the card asks the operator for a date before Accept is enabled.
- Rollback: disable the endpoint.

---

## Slice 10 — Confirmed execution for `memory_note`

### Goal
Operator can say "remember X" and the assistant proposes a memory note; on Accept, a row lands in `memories` with the correct scope per `V3_PRODUCTION_MEMORY_SCOPE_PLAN.md`.

### Systems / files likely involved
- **New edge handler:** `supabase/functions/insert-operator-assistant-memory/index.ts` — POST endpoint, auth, validates, inserts into `memories`.
- UI: Accept button on the `memory_note` proposed-action card.

### What changes
- Endpoint inserts into `memories` with:
  - `scope` (project / person / studio) per the memory scope plan's CHECK constraint.
  - `wedding_id` if `scope='project'`; `person_id` if `scope='person'`; both null if `scope='studio'`.
  - `type`, `title`, `summary`, `full_content` from the proposal.
  - `source_type='operator_assistant'` if the column exists; else a metadata field.
- LLM-proposed `scope` is validated server-side. If the proposal's scope is inconsistent with its fk values, the endpoint returns a validation error and the UI asks the operator to pick a scope.
- UI confirmation shows the created memory id with a link to a memory browser (if one exists; optional).

### What explicitly does NOT change
- Memory retrieval logic — untouched. New rows are picked up automatically by the scope-aware selector.
- The memory scope schema — no migration; this slice assumes the memory scope plan is live.
- Existing learning-loop memory writes (`captureDraftLearningInput.ts`, `complete_learning_loop_operator_resolution`) — untouched.

### Acceptance criteria
- "Remember that Marco needs 4-hour scouting" → proposal has `scope='person'` + `person_id` when resolvable → Accept → memory row exists with correct scope.
- "Remember that we don't shoot flash" → proposal has `scope='studio'` → Accept → studio-scope memory row.
- CHECK constraint rejects malformed combinations (regression test).
- Cross-tenant write is rejected.

### Tests needed
- Unit test: endpoint valid/invalid/cross-tenant.
- Integration: end-to-end for each of the three scopes.
- Regression: memory-scope selector correctly surfaces the newly-written row in a subsequent assistant call.

### Risks / rollout
- Mis-scoped proposals (e.g. personal note accidentally saved as studio). UI must make the scope explicit on the card; operator must confirm scope before Accept.
- Rollback: disable the endpoint.

---

## Slice 11 — Confirmed execution for `authorized_case_exception`

### Goal
Operator can say "for this case only, do X differently" and the assistant proposes an `authorized_case_exception`. On Accept, the exception row is active within its effective window.

### Systems / files likely involved
- **New narrow edge handler:** `supabase/functions/insert-operator-assistant-authorized-case-exception/index.ts` — or reuse `complete_learning_loop_operator_resolution` with an artifacts array limited to a single exception. Prefer the narrow handler for clarity.
- UI: Accept button on the `authorized_case_exception` proposed-action card.

### What changes
- Endpoint inserts into `authorized_case_exceptions` with `status='active'`, required FKs, `override_payload` validated against the plan's shape, `approved_by` set to the tenant user, `approved_via_escalation_id=null` (operator-initiated, no escalation).
- `deriveEffectivePlaybook` continues to merge these unchanged; the new row is picked up on the next request.

### What explicitly does NOT change
- `authorized_case_exceptions` schema — untouched.
- `deriveEffectivePlaybook` — untouched.
- Learning-loop-driven exceptions — untouched.

### Acceptance criteria
- "For Thorne only, waive the travel fee" → proposed action with correct `wedding_id`, `overrides_action_key`, `override_payload` → Accept → row exists and is active → next `buildDecisionContext` / `buildAssistantContext` call sees the exception merged.
- Effective window defaults to "active from now, no expiry" unless the operator specifies.
- Cross-tenant rejected.

### Tests needed
- Unit for the endpoint.
- Integration: end-to-end including `deriveEffectivePlaybook` picking up the new row.

### Risks / rollout
- Mis-targeting (exception narrows the wrong rule). Propose-confirm gates this; the card must show the affected `action_key` and the resulting `decision_mode` plainly.
- Rollback: disable the endpoint.

---

## Slice 12 — Grounded studio analysis (B8, first cut)

### Goal
Operator can ask evidence-based questions over their own studio data ("are we undercharging?", "which packages convert best?", "is destination work worth it?") and receive grounded observations, not generic advice.

### Systems / files likely involved
- **New helper:** `supabase/functions/_shared/context/fetchStudioAnalysisSnapshot.ts` — composes a bounded analytical view from `weddings`, `clients`, `payments` (if wired), `wedding_people`, `tasks`, `escalation_requests`, recent history (bounded window, e.g. last 24 months).
- `supabase/functions/_shared/context/buildAssistantContext.ts` — adds an optional `includeStudioAnalysis: boolean` flag; loads the snapshot when true.
- `formatAssistantContextForOperatorLlm.ts` — emits a "Studio analysis snapshot" block with clear labeling.
- System prompt update in `completeOperatorStudioAssistantLlm.ts` — guidance for B8: *"Analytical answers must be grounded in the Studio analysis snapshot. Do not invent numbers. When the sample is too small for a claim, say so. Frame answers as observations from the studio's own data, not as business advice."*

### What changes
- Snapshot shape (bounded):
  - Recent-N (e.g. 24) `weddings` with `stage`, `wedding_date`, `package_name`, `contract_value`, `balance_due`, `project_type`, location.
  - Funnel counts by stage: how many inquiry → consultation → proposal_sent → booked → delivered in the window.
  - Package mix (distribution of `package_name` among booked).
  - Project-type mix (if non-wedding projects exist).
  - Travel-tag distribution (destination vs local) if derivable from `location` or profile.
- Guardrails enforced in the prompt:
  - Label all outputs as observations, not advice.
  - Refuse or downgrade confidence when sample is small.
  - Never cite numbers absent from the snapshot.
  - Never compare to "the market" or "competitors" — only to the tenant's own history and policy.
- Opt-in loading: the snapshot only loads when `includeStudioAnalysis` is true, set by the UI when the operator's query matches a narrow analytical pattern (e.g. contains pricing/conversion/performance terms) OR when the operator explicitly invokes an "Ask Ana about my studio" affordance. Default off.

### What explicitly does NOT change
- No new tables. Snapshot is composed from existing schema.
- No external consulting data, no market benchmarks, no competitor data.
- No writes.
- No change to existing read flows when `includeStudioAnalysis` is false.

### Acceptance criteria
- "Are we undercharging?" with enough booking history returns observations like "Last 12 booked projects averaged $X; Signature package booked N times at average $Y vs. list $Z." No invented numbers.
- Small-sample case: "We have only 3 booked projects in the last 12 months, so conversion analysis is thin — here's what the data shows, with low confidence."
- "Which packages convert best?" returns a funnel-by-package breakdown from the snapshot.
- Generic-consulting question outside the snapshot ("should I reposition my brand?") gets a polite decline with "what's in my data" reframing.

### Tests needed
- Unit test for `fetchStudioAnalysisSnapshot`: known tenant, known windows, verified aggregate counts.
- Integration test with mocked LLM: snapshot present → analytical question produces cited numbers; snapshot absent → question redirected.
- Regression: standard widget queries are unaffected when `includeStudioAnalysis` is false.

### Risks / rollout
- Over-interpretation by the LLM (e.g. claiming a significant trend from 3 data points). Mitigate via the prompt rule and by including a `sampleSize` field in the snapshot that the model is told to consider.
- Sensitive fields in the prompt (`contract_value`, `balance_due`). Operator-only; firewall preserved.
- Latency: snapshot composition should be < 300ms for typical tenants. Cache per-tenant for a short window (e.g. 5 minutes) if needed.
- Rollback: disable the `includeStudioAnalysis` branch; snapshot is never loaded; prompt regains its pre-slice shape.

---

## Status at end of slice plan

After Slice 12:

- The widget answers factual questions grounded in full project truth (Slice 1).
- The widget feels like a colleague, not a terminal (Slice 2).
- The widget knows what's on the operator's plate today (Slice 3).
- The widget knows this app's own surfaces and answers app-help questions from a catalog, not invention (Slices 4–5).
- The widget proposes structured actions the operator can confirm (Slice 6).
- The widget can check live weather for a shoot (Slice 7).
- The widget can create rules, tasks, memory notes, and case exceptions, all gated by operator confirmation (Slices 8–11).
- The widget can answer evidence-based studio questions over the tenant's own data (Slice 12).

### Explicitly deferred beyond this plan

- Second/third external tools (timezone, sunset, geocoding) — add after Slice 7 is stable and telemetry confirms usage patterns.
- Multi-turn session state — bounded per-session history; no cross-session memory.
- Studio settings mutations via propose → confirm — write-risk is higher; wait for demand.
- Autonomous multi-step action chains — out of scope for this widget by product definition.
- Any path that routes assistant output into a client-facing writer — out of scope by safety invariant.
- Richer app-help surfaces beyond the Slice 4 catalog (contextual screenshots, interactive guides, in-app tooltips) — tooltips belong to the UI, not this widget; expand the catalog instead.

### What not to reopen here

- Memory scoring, access logging, scheduled hygiene, clustering, LLM consolidation, memory embeddings, TTL. All deferred by the memory scope plan; this widget plan does not need them and does not unblock them.
- Renaming `weddings` → `projects`. Cosmetic; out of scope.
- Cross-tenant queries of any kind. Tenant isolation is inviolable.

---

## Appendix — Slice dependencies

```
Slice 1 (structured truth)   ──┐
Slice 2 (prompt tune)        ──┼─► Slice 6 (ProposedAction) ──┬─► Slice 8  (rule-candidate write)
Slice 3 (Today recall)       ──┘                               ├─► Slice 9  (task write)
                                                               ├─► Slice 10 (memory write)
                                                               └─► Slice 11 (exception write)

Slice 4 (app catalog)        ──► Slice 5 (app-help wiring; depends on Slice 2 prompt)

Slice 7 (weather tool) — independent; depends only on Slice 2's prompt.

Slice 12 (studio analysis) — depends on Slice 1 (structured truth) and Slice 2 (prompt); independent of write slices.
```

Read-only slices: 1, 2, 3, 4, 5, 7, 12.
Propose-confirm write lattice: 6, 8, 9, 10, 11.

The app-catalog pair (4 → 5) is independent of the write lattice and of the tool and analysis slices. It can ship in parallel with any of Slices 1, 2, 3 as soon as Slice 4's divergence tests are green.
