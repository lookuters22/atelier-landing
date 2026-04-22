# V3 Operator Ana — Projects Domain-First (First Execution Slice)

> **Status:** Ready to implement. Concrete execution slice.
> **Goal:** Convert the **Projects / CRM** domain from push-context to handler-pull. Thin the shared context's project-related blocks; promote `operator_lookup_projects` and a new `operator_lookup_project_details` to the authoritative source for project data in the widget's answers.
> **Category:** Architecture transition — the first domain cut in the domain-first plan.
> **Depends on:** `V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md`
> **Pairs with:** `V3_OPERATOR_ANA_PROJECT_TYPE_SEMANTICS_SLICE.md` (ship in the same window; they reinforce each other).
> **Can ship independently of:** `V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md` (carry-forward becomes more valuable once this slice lands, but neither blocks the other).

---

## 1. Problem statement

The single biggest visible failure of the operator widget is wrong-source selection on **project-related** questions:

- *"What's going on with the Elena & Marco inquiry?"* — Ana sometimes answers from memory digest fragments instead of the project record.
- *"What's the venue for Thorne?"* — Ana says "unavailable" because the focused-project-facts block didn't include it, even though the project page does.
- *"What's going on with the Milan project?"* — Ana defaults to the wedding-shaped tone even when the Milan project is commercial.
- *"Tell me about Beaumont"* — the CRM digest's 12-row limit means Beaumont is sometimes not in scope; Ana says she can't find them even though the project exists.

The root cause is structural: the widget pre-loads a **CRM digest** (12 recent weddings, 15 recent people) and, when a project is focused, a **focused-project facts block**. The LLM chooses among these plus the rest of the dossier. When none of them has the needed fact — or when the needed fact is in a project not in the 12 most recent — Ana guesses, deflects, or fabricates.

This slice replaces that pattern for the Projects domain:

- Shared context keeps only a **minimal project summary** (currently focused project: id, type, stage, display title only).
- A new `operator_lookup_project_details(projectId)` handler is the authoritative path for deep project facts.
- The existing `operator_lookup_projects` remains the authoritative path for name/location lookups; its output carries `project_type` so the LLM answers in the right vocabulary.
- The CRM digest is retired from default shared context and becomes a handler call when needed (`operator_lookup_projects` with empty or broad query).

---

## 2. Current repo behavior

Baseline to preserve unless explicitly changed:

- `fetchAssistantCrmDigest.ts` loads 12 recent `weddings` (id, couple_names, stage, wedding_date) and 15 recent `people` (id, display_name, kind).
- `fetchAssistantFocusedProjectFacts.ts` is called only when `focusedWeddingId` is set; loads the wedding row + joined `wedding_people` + `contact_points`, plus open-task / open-escalation / pending-approval-draft counts.
- `operator_lookup_projects` handler exists; invoked by the LLM via the two-pass tool loop. Input: `query: string`. Output: candidates, unique match signals, personMatches.
- `operator_lookup_project_details` does **not** exist yet as a handler — the focused-project facts block is the only deep-detail surface.
- Persona writer and memory scope rules are untouched; this slice does not cross into them.

---

## 3. Proposed architecture

Four changes, each small and independently testable.

### Change 1 — Thin the shared context's project block to a minimal summary

Replace the always-loaded `## Focused project facts` block (when `focusedWeddingId` is present) with a single **one-line summary**:

```
## Focused project (summary — call operator_lookup_project_details for specifics)
{ "projectId": "<uuid>", "projectType": "wedding" | "commercial" | "video" | "other", "stage": "...", "displayTitle": "..." }
```

The deep facts (location, package, contract value, balance, wedding_people, contact_points, counts) are **not** in the shared context. They are fetched on demand via the new handler.

When `focusedWeddingId` is not set, this block is omitted entirely.

### Change 2 — Retire the default CRM digest from shared context

Remove the always-loaded `## CRM digest` block. Operators who ask about projects or people get the answer via handler calls (`operator_lookup_projects`, `operator_lookup_people`). The LLM is instructed in the system prompt to use the handlers for project/person questions.

Exception to retain: when the question is ambient (e.g., *"what's on my plate?"*, the operator-state summary block), the operator-state summary already provides the needed counts. No digest is required for that class.

### Change 3 — Add `operator_lookup_project_details` handler (UUID-only, deep-detail)

New handler, same contract pattern as the existing three. This handler and `operator_lookup_projects` form the **canonical resolver/detail pair** called out in the domain-first plan's "Handler boundary discipline" section. Their boundary is enforced at the input-schema level, not just by convention.

**Name:** `operator_lookup_project_details`

**Role:** Return the deep facts of a **single known project**, given its UUID. Nothing else.

**Input schema:** `{ projectId: string (UUID v4) }` — **UUID only**. Does not accept names, partial names, venues, or natural-language queries. If the LLM calls it with a non-UUID string, the handler returns a structured error, not a best-effort lookup.

**Tool description (the field OpenAI uses for tool selection) must explicitly name both sides of the boundary:**

> *"Fetch the full facts of one known project, given its UUID. Use this **after** resolving a project id via `operator_lookup_projects` or when a `projectId` is already in scope (focused-project summary, carry-forward pointer). **Do not** use this to search by name, venue, location, or text — use `operator_lookup_projects` for that."*

**Output (rich enough for most single-call answers — §3.5 latency rule):** typed project facts including:
- `projectId`
- `projectType` (first-class; always present)
- `stage`
- `displayTitle`
- `location`
- `eventStartDate`, `eventEndDate` (nullable)
- `packageName`, `contractValue`, `balanceDue` (nullable; omitted when unset)
- `storyNotes` (bounded excerpt, e.g., 400 chars)
- `people`: array of `{ personId, displayName, role, isApprovalContact }`, capped at 12
- `contactPoints`: array of `{ personId, kind, value }`, capped at 12
- `openTaskCount`, `openEscalationCount`, `pendingApprovalDraftCount`

The output shape is deliberately broad so a typical follow-up *("who is the approval contact?", "what's the balance due?", "what's the venue?")* is answered by this one call without a second handler round-trip. It is **not** broad enough to answer thread or calendar questions — those route to `operator_lookup_threads` and (future) `operator_lookup_calendar`.

Tenant-scoped via `photographer_id = auth.uid()` in the RPC/query. Cross-tenant requests return a structured `notFound`, not data.

### Boundary discipline for this slice (crystal-clear resolver/detail split)

The single most important reviewer check on this slice:

| Handler | Input | What it returns | What it MUST NOT do |
|---|---|---|---|
| `operator_lookup_projects` | `query: string` (natural language: name, partial, venue, location, type) | A bounded candidate list with distinguishing fields + `project_type` on every row; marks unique match when applicable | Never accept a UUID. Never return full project facts. Never include deep fields like `storyNotes`, `wedding_people`, `contact_points`. |
| `operator_lookup_project_details` | `projectId: UUID` | Deep project facts (the full output shape above) | Never accept a name or partial string. Never search. Never return multiple projects. Never fall back to "closest match" if the UUID is unknown — return `notFound`. |

No helper is added that covers "either a name or a UUID." If the LLM has a name, it calls the resolver first; then it calls the detail fetcher with the resolved UUID. If the LLM already has a UUID (from the shared-context focused-project summary or the carry-forward pointer), it calls the detail fetcher directly.

**Typical call patterns:**

- Focused-project question with `focusedWeddingId` already in shared context → one call: `operator_lookup_project_details(projectId)`.
- Named project not currently in focus → two calls: `operator_lookup_projects("Elena & Marco")` → `operator_lookup_project_details(<resolved projectId>)`.
- Multiple projects matching a name → the resolver returns candidates and the LLM asks the operator to disambiguate before calling the detail fetcher.

Reviewers should reject any PR that blurs this boundary (e.g. adds name-matching fallback to the detail fetcher, or adds deep fields to the resolver's candidate rows).

This is the first slice where the resolver/detail pattern ships. Later domain slices (threads, calendar, memory) should mirror this shape where it applies, and document any deviation in their own slice docs.

### Change 4 — System prompt gains a project-domain handler-routing paragraph

Add one paragraph to the system prompt:

> **Project questions.** When the operator asks about a project (by name, venue, stage, or other property), call `operator_lookup_projects` to resolve the project, then — if more detail is needed — call `operator_lookup_project_details` with the resolved `projectId`. Do not infer project facts from the brief focused-project summary in the shared context alone; it is a pointer, not a source. When the project has a `projectType` other than `wedding`, frame the answer in the vocabulary appropriate to that type (see Project type discipline).

---

## 4. Files likely to change

### New

- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantProjectDetailsTool.ts`
  - Handler function, schema definition, and register into the lookup-tools array.
  - Pure read; tenant-scoped.
  - One fetcher (or reuses `fetchAssistantFocusedProjectFacts` internally with the `projectId` parameter).

- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantProjectDetailsTool.test.ts`
  - Unit tests for input validation, tenant-scoping, and output shape.

### Modified

- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.ts`
  - Register the new tool alongside `operator_lookup_projects`, `operator_lookup_threads`, `operator_lookup_inquiry_counts`.
  - Raise `MAX_LOOKUP_TOOL_CALLS_PER_TURN` only if necessary; today's value of 3 is expected to remain sufficient.

- `supabase/functions/_shared/context/buildAssistantContext.ts`
  - Stop loading the CRM digest by default.
  - When `focusedWeddingId` is set, load only the **minimal project summary** (`projectId`, `projectType`, `stage`, `displayTitle`) — not the full facts.
  - The existing `fetchAssistantFocusedProjectFacts.ts` is still used, but only through the new handler path.

- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts`
  - Emit the minimal summary block (when applicable), not the full focused-project facts block.
  - Drop the `## CRM digest` section from the STABLE band.

- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts`
  - Add the new handler to the tool-call registry.
  - Add the project-domain handler-routing paragraph to the system prompt.

### Not touched

- `src/types/operatorAssistantProposedAction.types.ts` — no change to proposed-action shapes.
- Write paths, propose → confirm, persona writer, memory scope.
- Tenant isolation, RLS.
- `operator_lookup_projects` input/output shape (only ensures `project_type` is in the output, per the project-type semantics slice).

---

## 5. Acceptance criteria

1. **Shared context is thinner.** The rendered STABLE and PER_QUERY user-band text no longer contains `## CRM digest` or the full `## Focused project facts` block. When `focusedWeddingId` is set, a minimal summary block is present with exactly the four fields listed in §3 Change 1.
2. **New handler registered.** `operator_lookup_project_details` appears in the widget's exposed tools and is callable via the two-pass tool loop.
3. **Deep-detail handler output includes `project_type`.** Tool output shape test asserts the field is present for every call result.
4. **Name-based lookup still works.** Existing `operator_lookup_projects` integration tests pass unchanged; `project_type` is present on every candidate row.
5. **Focused-project follow-up path.** A fixture where the widget passes `focusedWeddingId` for Thorne, and the operator asks "what's the venue?", causes the LLM to call `operator_lookup_project_details` with that project's id and cite the `location` from the handler result.
6. **Out-of-digest lookup path.** A fixture where the operator names a project (Beaumont) that is not in a recent list causes the LLM to call `operator_lookup_projects` and then, if needed, `operator_lookup_project_details`, and to answer from the handler result rather than "I don't see them."
7. **No cross-tenant leak.** Asserting `operator_lookup_project_details` with a `projectId` from a different tenant returns empty or `notFound`.
8. **No regression on ambient questions.** "What's on my plate today?" continues to work from the operator-state summary; no handler call is required for that class.
9. **Token budget improves.** Caching-slice telemetry shows the STABLE band size drops by the removed CRM digest and focused-facts block sizes; per-call input-token count decreases on average.

---

## 6. Tests that should exist

### Unit

- **`operatorAssistantProjectDetailsTool.test.ts`**
  - Valid `projectId` → returns typed result with `projectType`.
  - Invalid UUID → returns structured error, not a throw.
  - Cross-tenant `projectId` → returns `notFound` or empty, no data leak.
  - Output caps (12 people, 12 contact points, 400-char story excerpt) are honored.
- **Formatter tests** — STABLE band no longer contains `## CRM digest`; minimal summary block appears when `focusedWeddingId` is set; full `## Focused project facts` is gone.

### Integration (mocked LLM)

- **Focused deep-detail:** `focusedWeddingId` passed; question asks for venue. Assert: LLM's first (or only) tool call is `operator_lookup_project_details`; reply cites the handler result.
- **Name lookup + detail:** question names a project by a rare name not in any ambient digest. Assert: LLM calls `operator_lookup_projects`, then `operator_lookup_project_details` if needed, and reply cites the detail.
- **Ambient question:** "what's on my plate?" triggers zero project-domain tool calls; reply comes from operator-state summary.
- **Tenant isolation:** a project id from another tenant is not resolvable; the mocked LLM receives a `notFound` and answers accordingly.

### Regression

- Every existing widget integration test passes unchanged when the new handler is enabled.
- `operator_lookup_projects` tests pass unchanged (this slice does not modify its input/output shape beyond ensuring `project_type` is in the output — covered by the project-type semantics slice).
- Caching-slice fingerprint test: the STABLE band's cacheable-prefix fingerprint remains stable across calls with different questions in the same tenant and session window.

---

## 7. Risks / tradeoffs

- **More tool calls → higher latency on project-heavy turns.** A focused-project deep question now makes one handler call where today it made zero. Expected latency impact: +150–300 ms per affected turn. A *named-project* question goes through the resolver first, then the detail fetcher — two serial calls, adding roughly +500–1000 ms. This is the sequential-chain latency trap from the domain-first plan (§3.5). Mitigation: the detail handler's output shape is broad enough (people, contact points, counts, key dates) that a typical follow-up does **not** require a third call. If telemetry shows projects routinely chained with threads or calendar in the same turn, the right response is to consider a compound `operator_lookup_project_overview` handler per the plan — not to widen `operator_lookup_project_details` to include thread or calendar data.
- **LLM may skip the handler and fabricate.** The system prompt paragraph explicitly forbids inferring from the summary alone. Integration fixtures assert the handler call. If fabrication persists in telemetry, escalate to adding a light-weight guard: if the reply references a project fact that was not in any handler result, log a `operator_assistant_ungrounded_project_claim` warn — this is a telemetry hook, not a correctness enforcement.
- **LLM may call the wrong handler in the pair.** The resolver/detail boundary is crisp but a small model can still mis-pick — e.g. call `operator_lookup_project_details` with a name it guessed was a UUID. Mitigations: (a) strict input-schema validation on each handler rejects wrong-shape inputs with a clear error the LLM can read and correct on the next turn; (b) tool descriptions explicitly name the anti-pattern (*"Do not use this to search by name"*); (c) integration fixtures cover both "name → resolver first" and "UUID-in-context → detail directly" call paths. If mis-selection rate is measurably bad post-deploy, the fix is sharper tool descriptions, not a general-purpose handler.
- **Projects not in the ambient summary will still need name resolution.** `operator_lookup_projects` handles this. If name resolution quality is weak (typos, partial matches), that is an orthogonal concern (the deterministic `pg_trgm` improvement discussed in earlier analyses) and belongs in its own slice — not in the detail handler.
- **Shared-context shrinkage changes the cacheable-prefix fingerprint.** Expected; the caching slice's fingerprint log will re-baseline. Add a one-time note in the release telemetry.
- **Behavior change visible to operators.** Questions about projects Ana used to "kind of answer" (from the 12-row digest) now require the handler to fire. The failure mode shifts from "vague answer" to "answered correctly" in the typical case and to "not found" only when the project truly isn't reachable by the lookup tools. Operators will notice the improvement; no communication needed beyond the release note.
- **Other domains still push-loaded.** This slice covers Projects/CRM only. Thread activity, calendar, memory samples, and studio analysis remain in the push path until later slices. That is by design — one domain at a time.
- **Do not over-generalize this slice.** Reviewer checklist: the PR must introduce exactly one new handler (`operator_lookup_project_details`), not add a new input shape to the existing resolver, not introduce a "convenience" handler that covers both inputs, not add thread/calendar/memory fields to the detail output. Every extra field or input path widens the tool-selection attack surface and is explicitly out of scope for this slice.

---

## 8. Rollout guidance

- **Env flag:** `OPERATOR_ASSISTANT_PROJECTS_DOMAIN_FIRST_V1`. Default off on merge. Enable in staging first; observe fixture tests pass; observe the projects-domain telemetry (tool call rate, failure rate, latency).
- **Rollout combined with `OPERATOR_ASSISTANT_PROJECT_TYPE_SEMANTICS_V1`.** Both flags on together in staging for 48 hours; both on in prod after a healthy window.
- **Telemetry:**
  - Per call, log whether `operator_lookup_project_details` was invoked and whether the reply referenced fields from its output (coarse heuristic: substring presence of the handler's `displayTitle` or `location`).
  - Track average input-token count (should drop); average tool-call count (should increase by ~0.3/turn on project-heavy turns).
  - Track `operator_assistant_llm_failed` rate (should not increase).
- **Rollback:** flip the flag off. The shared context rehydrates the CRM digest and focused-project facts block; the new handler stays callable but no longer required.
- **Operator-facing communication:** none required. This is an infrastructure/correctness improvement; operators should experience better answers for project-specific questions.

---

## 9. What this slice explicitly does not include

- No changes to Threads, Calendar, Memory, Studio Analysis, Playbook, or Knowledge domains. Those are later slices in the domain-first plan.
- No new project fields or schema changes.
- No change to `operator_lookup_projects` beyond ensuring `project_type` is in its output (which is also in the project-type semantics slice).
- No carry-forward pointer — that slice is independent and may land before, after, or alongside this one.
- No new LLM model, no temperature change, no new proposed-action kinds.
- No UI changes in the widget beyond natural consequence (no visual difference).

---

## Appendix — One-line summary

**Remove the CRM digest and the full focused-project facts block from the always-on shared context. Add a minimal focused-project summary (id/type/stage/title) and a new `operator_lookup_project_details(projectId)` handler that accepts UUID only. Keep the resolver/detail boundary strict: `operator_lookup_projects` for natural-language search, `operator_lookup_project_details` for deep facts by UUID. Make the detail output rich enough that most project follow-ups are answered in one call.**
