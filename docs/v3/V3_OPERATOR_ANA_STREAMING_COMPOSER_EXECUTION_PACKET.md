# V3 Operator Ana - Streaming Composer Execution Packet

> **Status:** Composer-oriented implementation packet.
> **Scope:** Internal Ana operator widget only.
> **Source plan:** `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
> **Purpose:** Break the streaming work into smaller, safer Composer slices with shared context and tighter boundaries.

---

## Use This Doc For

Use this doc as the execution spine for Composer prompts.

The upstream streaming slice plan is already correct architecturally. This packet does **not** replace it. It just breaks the work down further so Composer can implement it without losing context or overreaching.

If this packet conflicts with the upstream streaming slice plan, the upstream plan wins on architecture, and this packet wins on slice sizing.

---

## Source Of Truth

### Primary streaming docs

- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_PROJECT_TYPE_SEMANTICS_SLICE.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md`

### Key code paths

- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\completeOperatorStudioAssistantLlm.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\parseOperatorStudioAssistantLlmResponse.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\handleOperatorStudioAssistantPost.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\operator-studio-assistant\index.ts`
- `C:\Users\Despot\Desktop\wedding\src\components\SupportAssistantWidget.tsx`
- `C:\Users\Despot\Desktop\wedding\src\lib\operatorStudioAssistantWidgetResult.ts`

### Streaming-relevant tests

- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\completeOperatorStudioAssistantLlm.test.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\handleOperatorStudioAssistantPost.test.ts`

---

## Non-Negotiable Contracts

These hold for every slice.

1. Keep Chat Completions. Do **not** switch Ana to Responses API in this feature.
2. Keep `response_format: { type: "json_object" }` on the final JSON-producing pass.
3. Stream only the visible `reply` text.
4. Keep `proposedActions` atomic in the final payload. Do **not** incrementally parse or stream them.
5. Keep the legacy non-streaming path intact behind a flag.
6. Do **not** stream internal tool-selection or reasoning.
7. Tool-call turns are allowed to show dots until the final text-producing pass begins.
8. Do **not** add a stop-generating button in this feature.
9. Do **not** mix this with unrelated operator-widget architecture work.

---

## Feature Flag Contract

The implementation should preserve the same flag model described in the upstream streaming plan:

- Server flag: `OPERATOR_ASSISTANT_STREAMING_V1`
- Client flag: `VITE_OPERATOR_ASSISTANT_STREAMING_V1`

Expected behavior:

- Flag off: current non-streaming behavior remains untouched.
- Flag on + request advertises streaming: use SSE path.
- Any other case: keep legacy JSON path.

Do not invent a second flag unless there is a hard technical need.

---

## Event Contract

Only these SSE events are allowed:

- `token`
- `done`
- `error`

Expected payloads:

- `token`: `{ "delta": string }`
- `done`: final legacy-shaped assistant payload
- `error`: `{ "message": string }`

Do not add extra stream event types in these slices.

---

## What We Are Not Doing

Do not pull any of these into the implementation:

- Responses API migration
- incremental `proposedActions` rendering
- streamed internal reasoning
- stop-generating UI
- streaming telemetry dashboards
- persona-writer/client-draft streaming
- prompt redesign unrelated to one tiny reply-first ordering reinforcement if truly needed

---

## Recommended Slice Count For Composer

Use **5 slices** for Composer.

Why 5 instead of the upstream 3:

- the upstream 3 are architecturally correct
- but the backend slice is still too big for Composer if done in one shot
- and the widget slice is safer if the client stream parser is already landed and tested first

This is a sizing change, not an architecture change.

### Composer slice breakdown

1. Reply extractor foundation
2. SSE framing + client stream parser foundation
3. LLM streaming backend core
4. Edge-function SSE transport
5. Widget streaming consumer

---

## Shared Composer Rules

Every Composer prompt for these slices should assume:

1. Inspect the source plan doc first:
   `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
2. Inspect the exact files listed in that slice before editing.
3. Keep changes narrow.
4. Do not opportunistically refactor unrelated code.
5. Keep the legacy path passing.
6. Add tests in the same slice where behavior is introduced.
7. If a slice exposes a follow-up dependency, report it cleanly and stop.

---

## Slice 1 - Reply Extractor Foundation

### Why this slice exists

The highest-risk logic in streaming is extracting the growing `reply` string from a streaming JSON object without turning this into a generic incremental JSON parser project.

This slice isolates that risk as pure logic with tests only.

### In scope

- Add:
  - `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\streamingReplyExtractor.ts`
- Add dedicated unit tests for that file.
- Implement:
  - JSON-mode reply extraction
  - plain-text passthrough mode
  - escape handling across chunk boundaries
  - reply-not-first-field handling

### Out of scope

- no SSE response wiring
- no OpenAI streaming calls
- no widget changes
- no edge function changes
- no flag reads

### Files Composer should inspect first

- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\parseOperatorStudioAssistantLlmResponse.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\completeOperatorStudioAssistantLlm.ts`

### Acceptance criteria

1. The extractor can progressively emit reply text from a streamed JSON object.
2. The extractor handles escaped characters and split escapes correctly.
3. If the content is plain text instead of JSON, it emits plain text safely.
4. It never emits malformed partial escape output.
5. It is pure and fully unit-tested.

### Tests expected

- new `streamingReplyExtractor.test.ts`
- reply-first JSON
- reply-not-first JSON
- empty reply
- escaped quotes
- escaped backslashes
- unicode escape
- split unicode escape across chunks
- plain text passthrough

### Handoff to Slice 2

Slice 2 may import this extractor as a stable utility. Do not change its API shape casually after this lands.

---

## Slice 2 - SSE Framing + Client Stream Parser Foundation

### Why this slice exists

Before touching the live backend or widget, we want the transport helpers stable and tested:

- server-side SSE event encoding
- client-side SSE stream consumption

These are pure enough to land without changing behavior yet.

### In scope

- Add:
  - `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\operatorAssistantSseEncoder.ts`
  - `C:\Users\Despot\Desktop\wedding\src\lib\operatorStudioAssistantStreamClient.ts`
- Add dedicated tests for both.
- Implement only:
  - event encoding
  - event parsing
  - chunk-splitting tolerance
  - abort-safe client consumption

### Out of scope

- no edge function changes
- no widget state/render changes
- no OpenAI streaming wiring
- no env flag logic

### Files Composer should inspect first

- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\operator-studio-assistant\index.ts`
- `C:\Users\Despot\Desktop\wedding\src\components\SupportAssistantWidget.tsx`

### Acceptance criteria

1. SSE encoder produces valid `event:` / `data:` frames.
2. Multi-line JSON payloads are encoded safely.
3. Client parser yields `token`, `done`, and `error` events in order.
4. Client parser tolerates event framing split across network chunks.
5. Abort closes the parser cleanly.

### Tests expected

- new `operatorAssistantSseEncoder.test.ts`
- new `operatorStudioAssistantStreamClient.test.ts`
- single event
- split event across chunks
- multiple sequential events
- abort mid-stream
- malformed trailing data ignored safely

### Handoff to Slice 3

Slice 3 may assume:

- reply extraction exists
- SSE framing exists
- client parser exists

No production behavior should have changed yet.

---

## Slice 3 - LLM Streaming Backend Core

### Why this slice exists

This slice adds the streaming-aware LLM execution path without yet exposing it through the edge function response contract.

That keeps the biggest backend logic change separate from transport wiring.

### In scope

- Modify:
  - `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\completeOperatorStudioAssistantLlm.ts`
  - optionally `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\handleOperatorStudioAssistantPost.ts` only as needed to expose a streaming-aware variant
- Add a streaming variant that:
  - uses `stream: true`
  - emits reply deltas through a callback
  - preserves the final parsed payload
  - keeps tool-call turns non-visible until final text-producing pass
- Keep existing non-streaming functions intact

### Out of scope

- no edge SSE response yet
- no widget fetch changes
- no UI state changes
- no stop button

### Files Composer should inspect first

- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\completeOperatorStudioAssistantLlm.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\completeOperatorStudioAssistantLlm.test.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\handleOperatorStudioAssistantPost.ts`

### Acceptance criteria

1. A new streaming-capable LLM path exists.
2. Non-tool turns can emit progressive reply deltas.
3. Tool-call turns do not emit first-pass internal/tool text.
4. Final payload still parses through the existing parser contract.
5. Legacy non-streaming path remains intact and default-safe.

### Tests expected

- extend `completeOperatorStudioAssistantLlm.test.ts`
- non-tool streaming happy path
- tool-call path streams only final text-producing pass
- final parsed result equals full accumulated content
- malformed final JSON still fails the same way as legacy parser expectations

### Handoff to Slice 4

Slice 4 may assume the backend can already produce reply deltas internally via callback. It only needs to expose them over SSE.

---

## Slice 4 - Edge Function SSE Transport

### Why this slice exists

Once the backend core can emit deltas, the edge function can expose them as SSE behind the feature flag while preserving the legacy JSON path.

### In scope

- Modify:
  - `C:\Users\Despot\Desktop\wedding\supabase\functions\operator-studio-assistant\index.ts`
  - `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\handleOperatorStudioAssistantPost.ts`
- Add:
  - SSE success path
  - flag + `Accept: text/event-stream` gating
  - `token`, `done`, `error` event output
  - request-abort propagation where practical
- Preserve legacy JSON path exactly when flag is off or client does not request streaming

### Out of scope

- no widget consumption yet
- no replacement of `supabase.functions.invoke(...)` yet
- no UI behavior changes

### Files Composer should inspect first

- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\operator-studio-assistant\index.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\handleOperatorStudioAssistantPost.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\operatorStudioAssistant\completeOperatorStudioAssistantLlm.ts`

### Acceptance criteria

1. Flag off keeps legacy JSON response unchanged.
2. Flag on + streaming request returns `text/event-stream`.
3. SSE response emits `token` events, then one `done` event.
4. Validation failures still use the non-streaming error behavior before a stream starts.
5. Mid-stream failures emit one `error` event and close cleanly.

### Tests expected

- new `operator-studio-assistant.stream.test.ts` or equivalent
- content-type negotiation
- flag-off legacy JSON regression
- token then done ordering
- error event path

### Handoff to Slice 5

Slice 5 may assume the edge function can already stream valid SSE when the flag is on and the request asks for it.

---

## Slice 5 - Widget Streaming Consumer

### Why this slice exists

This is the user-visible slice:

- bypass `supabase.functions.invoke(...)` on the streaming path
- consume SSE directly
- grow an in-flight assistant line
- replace it with the existing final assistant display on `done`

### In scope

- Modify:
  - `C:\Users\Despot\Desktop\wedding\src\components\SupportAssistantWidget.tsx`
  - only type-level support in `C:\Users\Despot\Desktop\wedding\src\lib\operatorStudioAssistantWidgetResult.ts` if truly needed
- Add:
  - in-flight assistant message variant
  - direct fetch streaming path behind client flag
  - abort on close
  - abort on unmount
  - abort on new request replacing the prior in-flight turn
- Reuse `buildOperatorStudioAssistantAssistantDisplay(...)` on `done`

### Out of scope

- no stop-generating button
- no visual redesign
- no proposedAction streaming
- no carry-forward redesign

### Files Composer should inspect first

- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
- `C:\Users\Despot\Desktop\wedding\src\components\SupportAssistantWidget.tsx`
- `C:\Users\Despot\Desktop\wedding\src\lib\operatorStudioAssistantWidgetResult.ts`
- `C:\Users\Despot\Desktop\wedding\src\lib\operatorStudioAssistantStreamClient.ts`

### Acceptance criteria

1. Flag off preserves the current widget path exactly.
2. Flag on uses direct fetch + SSE.
3. Assistant text appears progressively in an in-flight line.
4. Three dots disappear once first text delta arrives.
5. Final `done` event produces the same final assistant display path as before.
6. Abort on close/unmount/new request works cleanly.
7. Proposed action cards still appear only at the end.

### Tests expected

- new `SupportAssistantWidget.streaming.test.tsx`
- streaming happy path
- error event path
- abort on close
- abort on new submit
- flag-off regression using existing invoke path

### Completion note

At the end of Slice 5, the feature is implementation-complete and still flag-gated.

---

## Suggested Composer Prompt Pattern

For each slice, Composer prompts should include:

1. Read the upstream streaming plan:
   `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
2. Read this execution packet:
   `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_COMPOSER_EXECUTION_PACKET.md`
3. Inspect the exact files listed in the slice.
4. Implement only that slice.
5. Report:
   - files changed
   - exact behavior added
   - tests added/updated
   - whether legacy path is preserved
   - recommended next slice

---

## Sequence We Should Follow

1. Slice 1 - Reply extractor foundation
2. Slice 2 - SSE framing + client parser foundation
3. Slice 3 - LLM streaming backend core
4. Slice 4 - Edge function SSE transport
5. Slice 5 - Widget streaming consumer

Do not skip ahead unless a previous slice lands cleanly.
