# V3 Operator Ana — Follow-Up & Carry-Forward (Slice)

> **Status:** Ready to implement. Narrow-scope correctness slice.
> **Goal:** Make follow-up operator questions resolve their referents deterministically — *"what was it about?"*, *"and when is it?"*, *"did they email too?"*, *"tell me more about that couple"* — without bloating the prompt and without LLM-driven query rewriting.
> **Category:** Correctness. No new capability; tightens the existing session-history mechanism.
> **Depends on:** `V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md` — the handler set from that plan is what the carry-forward pointer targets.
> **Independent of:** Project-type slice, Projects-domain execution slice. Safe to ship any order after the plan.

---

## 1. Problem statement

The widget already bounds a 3 turn-pair session history (via `OPERATOR_STUDIO_ASSISTANT_RECENT_SESSION_ADDENDUM`). That helps the LLM see *what was said*. It does not help the LLM reliably see *what was mentioned* — i.e. the stable identifier of the project, person, or thread the prior turn resolved to.

In practice:

- Operator: *"what's going on with the Elena & Marco inquiry?"* → Ana finds and names the project.
- Operator: *"and when is it?"* → Ana re-reads the prior raw turn text, sometimes re-resolves the project, sometimes guesses from context blocks, sometimes asks for clarification unnecessarily.
- Operator: *"did they email too?"* → Ana must re-resolve the person Elena + Marco belong to, then invoke the threads handler, which often fails because the name resolution happens *again* on less complete context.

The root cause is that the prior turn's *resolved referents* are not structurally carried into the next turn. Everything is re-inferred from raw text.

This slice adds a **structured carry-forward pointer** — a few stable IDs and a domain tag — to the shared context, so the next turn's LLM can see exactly what the prior turn resolved to and call the right handler without re-resolving.

---

## 2. Current repo behavior

Baseline:

- `OPERATOR_STUDIO_ASSISTANT_RECENT_SESSION_ADDENDUM` tells the model that prior turns are for pronoun resolution and immediate follow-ups only, and that grounding must come from the current turn's Context.
- Conversation history is bounded to 3 turn-pairs, 800 chars per user turn, 1200 chars per assistant turn, total ≤ 6000 chars.
- The assistant's prior-turn reply is raw text. The prior turn's resolved project/person/thread IDs are **not** passed into the next turn.
- No server-side carry-forward extraction exists.
- No query rewriting or pre-processing on the operator's follow-up text.

Failure mode in practice: the LLM must re-perform entity resolution every turn. On clear questions it works; on terse follow-ups it guesses or fails.

---

## 3. Proposed architecture

Add a small, structured **carry-forward pointer** as a shared-context field. Populate it server-side from the prior turn's signals. The LLM reads it to resolve referents; handlers receive its IDs when the LLM calls them.

### Shape of the carry-forward pointer

A single flat JSON object in the shared context block, labeled clearly. The pointer is **always emitted when prior-turn signals exist** — it is never hidden from the LLM by a server-side heuristic. Server-side heuristics only populate *advisory hint* fields; the LLM decides whether to follow the pointer.

```
## Carry-forward pointer (from prior turn; advisory for follow-up resolution)
{
  "lastDomain": "projects" | "threads" | "calendar" | "playbook" | "memories" | "studio_analysis" | "app_help" | "knowledge" | "none",
  "lastFocusedProjectId": "<uuid>" | null,
  "lastFocusedProjectType": "wedding" | "commercial" | "video" | "other" | null,
  "lastMentionedPersonId": "<uuid>" | null,
  "lastThreadId": "<uuid>" | null,
  "lastEntityAmbiguous": true | false,
  "ageSeconds": <int>,
  "advisoryHint": {
    "likelyFollowUp": true | false | null,
    "reason": "short_cue_detected" | "no_cue_detected" | "topic_change_shaped" | "fresh_session" | "age_expired" | "focus_changed" | null,
    "confidence": "high" | "medium" | "low"
  }
}
```

The pointer is tenant-scoped by construction (derived from the prior turn, which was scoped to the same photographer). The `advisoryHint` is the *only* place server-side heuristics live; they never remove fields or suppress the pointer.

### How it is populated

At the end of each turn, the handler layer extracts signals from the handler results and the assistant reply, and stashes the pointer in the session transport (the same request/response pathway the widget already uses for `conversation` bounded history):

- `lastDomain` — the domain of the last handler call, or `"none"` if no handler fired.
- `lastFocusedProjectId` / `lastFocusedProjectType` — set when:
  - `operator_lookup_projects` returned a `uniqueWeddingId`, or
  - `operator_lookup_project_details` was called, or
  - a widget-level `focusedWeddingId` was in scope.
- `lastMentionedPersonId` — set when `operator_lookup_projects` or `operator_lookup_people` returned a unique person match.
- `lastThreadId` — set when `operator_lookup_threads` returned a single thread answer.
- `lastEntityAmbiguous` — `true` when the prior turn's handler returned 2+ candidates and the LLM asked the operator to disambiguate.
- `ageSeconds` — seconds since the prior turn.

Nothing here requires LLM invocation. All fields come from deterministic outputs of the existing (and planned) handlers.

### How the LLM uses it

One paragraph is added to the system prompt:

> **Follow-up resolution.** The `Carry-forward pointer` block above is a structured summary of what the prior turn resolved to, and is **always present when prior signals exist**. Read it on every turn. When the operator's current question uses a pronoun, a demonstrative, or a short reference back to the prior topic, use the pointer's IDs to call the right handler directly rather than re-resolving the entity from raw text. The `advisoryHint` fields (`likelyFollowUp`, `reason`, `confidence`) are server-side *nudges*, not gates — trust them as a prior, but make the final call yourself based on the current question. If the current question names a different entity, a different project, or a different domain, **ignore** the pointer and resolve fresh. If `lastEntityAmbiguous` is true, treat the follow-up as still requiring disambiguation unless the operator picked a candidate in the current turn.

### Advisory hint (server-side, not a gate)

The server populates `advisoryHint` with a small deterministic signal so the LLM has a weak prior on whether the current turn *looks like* a follow-up. This is advisory only; the pointer's structured fields remain available regardless of the hint value.

Signal sources (any combination may set the hint):

- **Length and cue surface.** Short queries containing pronouns or starter words (*"and"*, *"what about"*, *"tell me more"*, *"why"*, *"when"*, *"where"*, *"who"*, *"it"*, *"that one"*, *"they"*, *"them"*, *"the couple"*, *"the project"*) → `likelyFollowUp: true`, `confidence: medium`, `reason: "short_cue_detected"`.
- **Entity-naming shape.** Query contains a clearly fresh entity name or a domain keyword that doesn't match `lastDomain` → `likelyFollowUp: false`, `confidence: medium`, `reason: "topic_change_shaped"`.
- **Auto-clear conditions fired.** Focus changed, `ageSeconds` exceeded, or no prior pointer → `likelyFollowUp: false`, `confidence: high`, `reason: "fresh_session"` / `"age_expired"` / `"focus_changed"`. In these cases the pointer's ID fields will already be null; the hint explains why.
- **No signal either way.** Neither cue nor topic-change shape detected → `likelyFollowUp: null`, `confidence: low`, `reason: "no_cue_detected"`. This is the common case; the LLM uses the pointer fields directly and decides based on the content of the current question.

**Principles the heuristic must honor:**

1. **Never remove pointer fields.** Even when `likelyFollowUp: false`, every ID and tag that was populated by the prior turn stays in the block. Server-side heuristics do not gate information flow.
2. **Never synthesize an active pointer.** If the prior turn produced no resolved entity, the ID fields stay null; the hint cannot fabricate one.
3. **Keep the cue list small and boring.** A brittle cue list that tries to cover every phrasing is worse than a small list that the LLM can override. Do not expand the cue list into heuristic NLP. If cue coverage becomes a live issue in telemetry, the response is to *remove* cues and rely more on the LLM, not to add more.

The carry-forward pointer is primarily deterministic structured data. The advisory hint is a polite suggestion. This is intentional: we prefer a pointer the LLM can see and possibly ignore over a hidden one the LLM couldn't use.

### Carry-forward expiry and explicit clear

The pointer clears automatically when:

- The widget's `focusedWeddingId` / `focusedPersonId` changes between turns (already known; just drop the old pointer).
- `ageSeconds` exceeds a bound (e.g., 3 minutes). Longer gaps usually mean topic change.
- The operator's current turn resolves a **different** entity explicitly (handler returns a different `uniqueWeddingId`, and the LLM confirms in the reply).
- The operator explicitly signals reset (e.g., "new question:", "let's talk about…"). Not a hard rule; the LLM can decide.

### What we explicitly do NOT do

- **No LLM-based query rewriting.** Rewriting adds cost, latency, and a new failure surface. We pass the carry-forward IDs; the LLM interprets them.
- **No persistent server-side session store.** Carry-forward is session-scoped, round-trip through the request body like today's `conversation` history.
- **No heavy entity extraction.** Only the already-resolved IDs from deterministic handlers flow through; no NLP on raw text.
- **No recursive planning.** One turn, one carry-forward, one bounded handler loop.
- **No cross-tenant carry-forward.** Trivially safe because the pointer lives in the widget's request body under the same tenant auth.

---

## 4. Files likely to change

### New

- `supabase/functions/_shared/operatorStudioAssistant/operatorAssistantCarryForward.ts`
  - Exports `CarryForwardPointer` type, `extractCarryForwardFromTurn(handlerCalls, assistantReply)`, and `computeCarryForwardAdvisoryHint(query, pointer)` — the latter returns the advisory-hint object, never a boolean gate, and **never** removes or modifies the pointer's data fields.
  - Pure functions; no DB calls.
- `supabase/functions/_shared/operatorStudioAssistant/operatorAssistantCarryForward.test.ts` — unit tests.

### Modified

- `src/types/assistantContext.types.ts` — add `carryForward?: CarryForwardPointer` to the shared context.
- `supabase/functions/_shared/context/buildAssistantContext.ts` — accept carry-forward from the request and pass it through.
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — render the `## Carry-forward pointer` block as part of the shared context (Layer A in the domain-first plan).
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — add the follow-up resolution paragraph to the system prompt; extract pointer from the current turn's tool calls and include in the response (so the widget can echo it back on the next turn).
- `supabase/functions/_shared/operatorStudioAssistant/handleOperatorStudioAssistantPost.ts` — accept `carryForward` on request body; validate shape; attach to context build.
- `src/components/SupportAssistantWidget.tsx` — store the returned carry-forward and send it with the next turn; clear on widget close or focus change.

### Not touched

- Memory scope schema.
- Handler implementations (they return what they already return; the carry-forward layer extracts from that).
- Tenant isolation / RLS.
- Prompt caching prefix — the carry-forward block is part of the thin shared context and may vary per turn, which is acceptable because it is tiny (~200 chars) and its variance tracks the session, not cross-tenant.

---

## 5. Acceptance criteria

1. **Pointer shape:** the carry-forward pointer in the prompt is a JSON-looking block with the fields in §3, including the `advisoryHint` object. When prior-turn signals exist, the pointer's ID fields are populated; they are **never** removed or redacted by the heuristic.
2. **Advisory hint correctness:** short follow-up queries with cue words produce `advisoryHint.likelyFollowUp: true` with `confidence: medium`. Clearly topic-changed queries produce `likelyFollowUp: false`. Ambiguous queries produce `likelyFollowUp: null, confidence: low`. The pointer's ID fields are **identical** in all three cases for a given prior turn.
3. **Auto-clear on focus change:** when `focusedWeddingId` differs between turns, the pointer's ID fields are empty and `advisoryHint.reason = "focus_changed"` (`likelyFollowUp: false`, `confidence: high`).
4. **Auto-clear on age:** when `ageSeconds` exceeds the bound, the pointer's ID fields are empty and `advisoryHint.reason = "age_expired"`.
5. **Handler round-trip:** a fixture where Turn 1 resolves a `uniqueWeddingId` produces a Turn 2 request whose body includes `carryForward.lastFocusedProjectId = <that id>` regardless of the Turn 2 query shape.
6. **LLM uses the pointer:** in a mocked-LLM fixture where the pointer has `lastFocusedProjectId`, a short follow-up like "when is it?" causes the LLM to invoke `operator_lookup_project_details` with that ID rather than asking for clarification — even when `advisoryHint.likelyFollowUp` is `null`, because the LLM decides based on the question, not the hint.
7. **LLM ignores pointer on explicit new entity:** in a fixture where Turn 2 names a different project explicitly, the LLM resolves fresh and does not cite the prior turn's project — regardless of `advisoryHint` value.
8. **No regression:** turns without carry-forward (first turn of a session) produce byte-identical behavior to today for non-follow-up queries.
9. **No cross-tenant leak:** trivially asserted — the pointer is client-state round-tripped under the same JWT.

---

## 6. Tests that should exist

### Unit

- **`operatorAssistantCarryForward.test.ts`**
  - `extractCarryForwardFromTurn` with a successful `operator_lookup_projects` call → pointer has the expected `lastFocusedProjectId`.
  - With no handler call and a pure small-talk reply → pointer has `lastDomain === 'none'` and all IDs null.
  - With a `lastEntityAmbiguous` scenario (multiple project candidates) → pointer flag is set to true.
  - `computeCarryForwardAdvisoryHint` — positive cue match produces `likelyFollowUp: true`; topic-change-shaped input produces `likelyFollowUp: false`; ambiguous input produces `likelyFollowUp: null`; **in all three cases the pointer's ID fields are identical and are never cleared by the helper**.

### Integration (mocked LLM)

- **Two-turn project follow-up fixture:** Turn 1 asks about Elena & Marco; Turn 2 asks "when is it?". Assert: Turn 2 LLM request includes `carryForward.lastFocusedProjectId` and no re-resolution step, and the mocked LLM's Turn 2 response cites the project.
- **Ambiguity persistence:** Turn 1 returns two project candidates; the LLM asks to disambiguate; Turn 2 asks "the Milan one" — assert `lastEntityAmbiguous: true` carried and the LLM picks the Milan candidate.
- **Focus-change clearing:** widget state changes `focusedWeddingId` between turns; pointer is empty in Turn 2.
- **Age expiry:** mock `ageSeconds` past the bound; pointer is dropped.
- **Topic-change override:** Turn 1 resolves project X; Turn 2 names project Y explicitly; the LLM resolves Y and does not carry X.

### Regression

- All existing widget golden tests pass unchanged when the feature flag is off.
- With the flag on, single-turn questions produce the same `reply` and `proposedActions` as before.

---

## 7. Risks / tradeoffs

- **Stale referent on mis-detected topic change.** If the advisory hint says `likelyFollowUp: true` when the real question is a topic change, the LLM might answer about the wrong project. Mitigation: because the pointer is always visible, the LLM has the question and the pointer side-by-side; the system-prompt paragraph tells it to override the hint when the question names a different entity. The hint is a nudge, not a forcing function.
- **Brittle cue lists.** Operators write in shorthand; a comprehensive cue list is impossible. The deliberate choice here is a small cue list that produces a weak `medium`-confidence signal at best, with `likelyFollowUp: null` (confidence: low) as the common case. Do **not** expand the cue list toward natural-language classification; if follow-up resolution fails in telemetry, the response is to remove cues and trust the LLM more, not to add more heuristics.
- **Operator mental model divergence.** Some operators may expect a fresh session each question; others will expect continuity. The auto-clear rules (focus change, age, explicit new entity) align with most intuitive models. Accept a small number of surprises; telemetry will tell us where to tune.
- **Pointer size in the prompt.** ~200 chars per turn. Negligible. Caching-slice-compatible.
- **Coordination with domain-first plan.** The pointer fields (`lastFocusedProjectId`, etc.) map directly to inputs handlers accept. No new handler parameters are introduced by this slice — the handlers already accept project IDs.
- **Client-side state complexity.** The widget must round-trip the pointer between turns. Equivalent to how it already round-trips `conversation`. Same pattern, one new field. Small risk.
- **LLM ignoring the pointer.** Some models ignore structured hints. Mitigation: prompt paragraph names the block specifically and instructs the LLM to use it for pronoun resolution. Integration tests assert the behavior on fixtures.

---

## 8. Rollout guidance

- **Env flag:** `OPERATOR_ASSISTANT_CARRY_FORWARD_V1`. Default off; flip staging; observe fixture tests; flip prod after 48 hours.
- **Sequencing:** ship after or alongside the Projects domain-first execution slice. The pointer's value is highest when handlers are the source of truth.
- **Telemetry:** per call, log `{ pointer_present: bool, pointer_has_ids: bool, advisory_likely_follow_up: "true"|"false"|"null", advisory_reason, advisory_confidence, last_domain, pointer_age_seconds, llm_invoked_handler_using_pointer: bool }`. After two weeks, assess whether the advisory-hint thresholds (cue list, age bound) are actually informing LLM behavior. If the LLM's handler-selection rate does not correlate with `advisory_likely_follow_up`, the hint is noise and the cue list should shrink, not grow. Do not tune based on vibes; tune from the log.
- **Rollback:** flip the flag off. The pointer is dropped from context; the session addendum continues as-is.

---

## Appendix — One-line summary

**Pass a tiny structured referent pointer (last project id, last person id, last domain, last-was-ambiguous flag) between widget turns so short follow-ups like "and when is it?" reach the right handler without the LLM re-resolving anything from raw text. The pointer is always visible when it exists; a small server-side `advisoryHint` nudges the LLM but never hides the pointer.**
