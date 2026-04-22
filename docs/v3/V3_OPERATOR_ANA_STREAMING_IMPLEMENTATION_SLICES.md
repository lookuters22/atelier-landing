# V3 Operator Ana — Streaming Implementation Slices

> **Status:** Execution-ready. Narrow-scope slice plan for adding reply-text streaming to the operator Ana widget.
> **Scope:** Operator widget only. No API switch, no architecture redesign, no prompt reshape.
> **Depends on:** current widget + edge function architecture as it exists today (Chat Completions, `json_object` response format, two-pass tool loop).
> **Pairs with (do not bundle):** `V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md` and its domain slices — orthogonal; ship independently.

---

## Slice count

**Three slices.** Each is Composer-sized and independently mergeable:

1. **Extractor + SSE encoder foundation** — pure code + tests, no wiring.
2. **Backend streaming path** — edge function + LLM call, flag-gated.
3. **Widget streaming consumption** — in-flight UI + abort, same flag.

Not four: there is no natural fourth seam. "Stop generating" UI, advanced telemetry, and rollout hardening are all either trivial follow-ons to Slice 3 or belong to an ops doc — not to the streaming feature itself.

---

## Cross-cutting contracts (apply to every slice)

These must be identical across slices or the whole thing fails at integration.

### Feature flag

Single deno env var: **`OPERATOR_ASSISTANT_STREAMING_V1`**. Values: `"true"` / `"false"` (default false). The same name is exposed to the client build as **`VITE_OPERATOR_ASSISTANT_STREAMING_V1`** so the widget can match server posture without duplicating logic.

- Server reads the env in `operator-studio-assistant/index.ts` and decides per request. Flag on + request header `Accept: text/event-stream` → stream path. Otherwise → legacy JSON path. Either condition alone is **not** enough; both must be true.
- Client reads the env at widget mount. Flag on → sends `Accept: text/event-stream` and the stream consumer. Flag off → keeps the existing `supabase.functions.invoke` path untouched.

### Legacy path preservation

The existing non-streaming request/response contract stays intact for the entire duration of this work. Every slice lands with the flag off by default and zero runtime behavior change in the legacy path. The legacy code is not refactored, wrapped, or shimmed — it is simply not called when streaming is engaged.

### Tool-call turns

- First pass is **never streamed to the client**. Its only operator-visible outcome is either tool calls (no text for the client) or direct content. When it emits direct content, that content becomes the user reply and streams on the **final** text-producing pass, which in this case is the first pass itself; see Slice 2 for the exact branching.
- On the tool-call path, the operator sees dots until the second pass begins producing tokens (roughly 1.5–2.5 seconds). From that point, text streams.
- No partial tool-call signaling, no "Ana is thinking" affordance beyond the existing three-dots indicator. Kept deliberately plain.

### `done` payload mapping

The final SSE event carries the exact payload the legacy path returns today:

```
event: done
data: {
  reply: string,                                   // full reconstructed text
  proposedActions?: OperatorAssistantProposedAction[],
  clientFacingForbidden: true,
  retrievalLog: AssistantRetrievalLog,
  carryForward: OperatorAnaCarryForwardClientState | null
}
```

The widget runs this through the existing `buildOperatorStudioAssistantAssistantDisplay` helper, unchanged. Proposed-action cards, contract-violation fallback, dev-retrieval ribbon, carry-forward round-trip all continue to work as today because the final shape is identical.

### Event vocabulary

Only three SSE event types across the whole feature. Any future addition requires a plan amendment.

- `event: token` — `data: { "delta": "<text fragment>" }`
- `event: done` — `data: { ...final payload above }`
- `event: error` — `data: { "message": "<brief human-readable>" }`

### What never streams

- `proposedActions` — atomic at end. No incremental parsing, no partial cards.
- `retrievalLog`, `carryForward`, `clientFacingForbidden` — all in the `done` event only.
- First-pass tool-call decision reasoning — not user-visible; not emitted.
- Internal LLM reasoning from o-series models — N/A; we use `gpt-4.1-mini` which does not expose reasoning.

---

## Slice 1 — Streaming reply extractor + SSE encoder foundation

### Why this slice exists

The highest-risk code in streaming is the JSON-string scanner that extracts the growing `reply` value from a streaming `response_format: json_object` response. Isolating it as pure code with full unit coverage lets us land it with zero production risk before anything is wired up. The SSE encoder belongs in the same slice because it's equally foundational and equally pure.

### In scope

- New file **`supabase/functions/_shared/operatorStudioAssistant/streamingReplyExtractor.ts`**
  - Exports a class/factory producing a stateful scanner: `createReplyExtractor()` → `{ feed(chunk: string): { deltaText: string; finished: boolean }; state(): "seeking" | "inside" | "done" | "plain_text" }`.
  - Handles JSON string escapes (`\"`, `\\`, `\/`, `\n`, `\t`, `\r`, `\b`, `\f`, `\uXXXX`) correctly, including escapes split across chunk boundaries.
  - Detects at feed-time whether accumulated buffer starts with `{` (JSON mode) or not (plain-text passthrough mode for tool-enabled first-pass direct content, which has no `response_format`). In plain-text mode, every chunk is emitted as delta.
  - In JSON mode, seeks for `"reply"\s*:\s*"`, then streams the string body as delta until an unescaped closing `"` is encountered, then transitions to `done` and emits no further deltas.
  - If the object's first field is not `reply`, the extractor stays in `seeking` until `reply` appears, buffers nothing operator-visible, and emits the full string as one delta when it appears.
  - Pure function; no I/O; Deno and Node safe.
- New file **`supabase/functions/_shared/operatorStudioAssistant/operatorAssistantSseEncoder.ts`**
  - Exports `encodeSseEvent(event: "token" | "done" | "error", data: unknown): Uint8Array`.
  - Produces `event: X\ndata: <JSON.stringify(data)>\n\n` with a newline-safe `data` (multi-line JSON split across `data:` lines if needed).
  - No external dependency.
- New file **`src/lib/operatorStudioAssistantStreamClient.ts`**
  - Exports `consumeOperatorAssistantSseStream(res: Response, signal: AbortSignal)` → `AsyncIterable<{ type: "token" | "done" | "error"; data: unknown }>`.
  - Uses `res.body.getReader()` + `TextDecoder`; line-buffered SSE parser; tolerates events split across network chunks; yields typed events in order.
  - On abort: cancels the reader, closes the iterator cleanly.
  - No React, no Supabase, no widget-specific state.

### Out of scope

- No changes to the edge function routing.
- No changes to the widget.
- No changes to `completeOperatorStudioAssistantLlm.ts`.
- No feature flag reading anywhere — this slice is pure utilities.
- No wiring to OpenAI's streaming API.
- No partial-`proposedActions` extraction — ever.

### Target files to inspect / change

- **Inspect only:** `parseOperatorStudioAssistantLlmResponse.ts` (to confirm the final parser's shape remains the target for stream-end).
- **New files:** three listed above.
- **No edits** to any existing production file in this slice.

### Acceptance criteria

1. Extractor handles: reply-is-first-field, reply-is-not-first-field, plain-text (no JSON wrapper), all JSON escape classes, escapes split across chunks, empty reply, reply containing the substring `"reply"` as content, reply with trailing whitespace after closing `"`.
2. Extractor never emits a partial escape sequence as a literal backslash.
3. SSE encoder handles multi-line JSON and non-ASCII characters correctly.
4. Client stream consumer parses contrived fixtures containing: single-frame events, split-frame events, interleaved `token` + `done`, trailing junk, abort-mid-stream.
5. 100% of exported functions have unit tests; no integration tests required in this slice.

### Test expectations

- **`streamingReplyExtractor.test.ts`** — minimum 15 cases covering the list in acceptance #1 plus the JSON-mode / plain-text detection switch. Fixture-driven.
- **`operatorAssistantSseEncoder.test.ts`** — minimum 5 cases: simple token, done with full payload, error, multi-line data, unicode.
- **`operatorStudioAssistantStreamClient.test.ts`** — minimum 6 cases: single event, split event, multiple events, error event surfaced, abort mid-stream, trailing partial frame ignored.

### Handoff note to Slice 2

Slice 1 produces three self-contained utilities. Slice 2 imports them at their stable paths. The scanner's `feed()` API and the encoder's function signature are the interfaces Slice 2 will wire; do not change them after Slice 1 merges without bumping a version note in this doc.

---

## Slice 2 — Backend streaming path (edge function + LLM call)

### Why this slice exists

The edge function needs to return an SSE body, and the LLM call site needs to switch from one-shot to `stream: true` and emit deltas through the extractor. Both changes are tightly coupled; splitting them adds no value. This slice is gated behind the feature flag and preserves the legacy JSON path untouched.

### In scope

- Modify **`supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts`**
  - Add a streaming variant: `completeOperatorStudioAssistantLlmStreaming(ctx, options, onToken)` where `onToken: (delta: string) => void` is called during text generation.
  - Internally:
    - **First pass (tools available):** send `stream: true` with `tools: OPERATOR_READ_ONLY_LOOKUP_TOOLS`, `tool_choice: "auto"`. Consume OpenAI stream. Accumulate `delta.tool_calls` separately from `delta.content`. If any tool call emerges, stop forwarding content deltas (there shouldn't be any in practice), collect tool_calls fully, execute tools as today, proceed to second pass. If only content emerges (no tool_calls), feed it through the extractor and forward deltas to `onToken`; this content becomes the final reply.
    - **Second pass (post-tool-result):** send `stream: true`, `response_format: { type: "json_object" }`, `tool_choice: "none"`. Feed all content deltas through the extractor; forward deltas to `onToken`.
    - On stream end (either pass that produces the final reply): return the full `OperatorStudioAssistantLlmResult` by running the existing `parseOperatorStudioAssistantLlmResponse` against the accumulated raw content. This gives us `{ reply, proposedActions, readOnlyLookupToolTrace, readOnlyLookupToolOutcomes }` for the `done` event.
  - The existing non-streaming `completeOperatorStudioAssistantLlm` function stays and remains the legacy code path. No refactor.
- Modify **`supabase/functions/_shared/operatorStudioAssistant/handleOperatorStudioAssistantPost.ts`**
  - Add a streaming variant: `handleOperatorStudioAssistantPostStreaming(supabase, photographerId, body, onToken)` → returns the same `OperatorStudioAssistantResponseBody` shape as today at the end.
  - Same context-build path as today (`buildAssistantContext`, conversation validation, carry-forward extraction). Only difference: calls `completeOperatorStudioAssistantLlmStreaming` instead of the one-shot, passing `onToken` through.
  - On LLM error mid-stream: emit through `onToken` nothing further; bubble the error for the edge function to convert into an `event: error` frame. Preserve the existing fallback "[Studio assistant - retrieval succeeded, reply generation failed]" behavior as a terminal `done` event payload, not as a mid-stream delta.
- Modify **`supabase/functions/operator-studio-assistant/index.ts`**
  - After auth, body-parse, and validation: read env flag + request `Accept` header.
  - **Streaming branch:**
    - Return a `new Response(readable, { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } })`.
    - Construct the readable via `new ReadableStream({ start(controller) { ... } })`.
    - Call `handleOperatorStudioAssistantPostStreaming`, passing an `onToken` that enqueues an `event: token\ndata: {"delta":...}\n\n` frame.
    - On completion, enqueue `event: done\ndata: { full payload }\n\n`. Close the controller.
    - On error, enqueue `event: error\ndata: {"message":...}\n\n`. Close the controller.
    - Clean error taxonomy: validation errors never start a stream (return legacy JSON 4xx as today); only post-validation errors emit `event: error`.
  - **Legacy branch:** unchanged. Same `json(result, 200)` as today.
  - Client abort (request aborted): the edge function's readable controller will naturally throw on enqueue after the client disconnects; catch and silently drop the cancellation. The in-flight OpenAI fetch should receive the same abort propagation — pass an `AbortSignal` derived from the request's own signal down through `completeOperatorStudioAssistantLlmStreaming`'s fetch call to OpenAI.

### Out of scope

- Any widget change.
- Any change to the legacy `completeOperatorStudioAssistantLlm` / `handleOperatorStudioAssistantPost` functions beyond optionally factoring shared context-build into a reusable helper (optional and only if it's cleanly extractable — do not force it).
- Any change to `parseOperatorStudioAssistantLlmResponse.ts`. Reused as-is at stream end.
- Any change to proposal validators, tool handlers, or carry-forward code.
- Any prompt change.
- Any metric/dashboard creation.

### Target files to inspect / change

- **Modify:** `completeOperatorStudioAssistantLlm.ts`, `handleOperatorStudioAssistantPost.ts`, `operator-studio-assistant/index.ts`.
- **Import from Slice 1:** `streamingReplyExtractor.ts`, `operatorAssistantSseEncoder.ts`.
- **No touch:** the parser, validators, tool registry, carry-forward module, context builder.

### Acceptance criteria

1. **Flag off by default:** with `OPERATOR_ASSISTANT_STREAMING_V1` unset or `"false"`, the edge function behavior is byte-identical to pre-slice behavior for every existing integration test.
2. **Flag on + SSE Accept:** the edge function returns `Content-Type: text/event-stream` and emits `token` events followed by a single `done` event matching the legacy payload shape.
3. **Flag on without SSE Accept:** still returns the legacy JSON response. Both conditions must hold for streaming.
4. **Non-tool turn:** OpenAI's streamed `delta.content` chunks pass through the extractor and surface as `token` events; `done` event's `reply` matches the concatenation of all `token` deltas plus any content the extractor buffered before emitting (e.g. when `reply` is not the first JSON field).
5. **Tool-call turn:** first pass emits zero `token` events to the client; tool execution runs as today; second pass emits `token` events; `done` payload contains `readOnlyLookupToolTrace`, `readOnlyLookupToolOutcomes`, and full `reply` reconstructed from the second-pass content.
6. **Abort propagation:** when the client closes the connection mid-stream, the OpenAI fetch is aborted and no further OpenAI tokens are consumed; server does not throw in unhandled.
7. **Error in LLM mid-stream:** no partial `done` event; one `event: error` frame with a brief message; controller closed cleanly.
8. **Proposal parsing:** after streaming, `done` event's `proposedActions` equals what the legacy parser would have produced from the same full content. Regression lock via shared fixture.

### Test expectations

- **Unit:** `completeOperatorStudioAssistantLlm.test.ts` — extended with streaming-mode tests using a mocked OpenAI streaming response. Minimum 6 new tests: non-tool happy path, tool-call path, tool-call path with zero content before tools, malformed JSON at stream end, abort mid-stream, error response.
- **Unit:** `handleOperatorStudioAssistantPost.test.ts` — extended with a streaming variant: asserts `onToken` callbacks in order, terminal payload shape matches legacy one-shot on identical inputs.
- **Integration:** new `operator-studio-assistant.stream.test.ts`:
  - SSE content-type negotiation.
  - Frame-order assertion (token* then done).
  - Flag-off and Accept-mismatch cases return legacy JSON unchanged.
  - Parses the `done` event with an existing parser helper and asserts equivalence to the legacy JSON shape on the same canned LLM response.
- **Regression:** all existing tests pass unchanged when the flag is off.

### Handoff note to Slice 3

At the end of Slice 2, a curl request with `Authorization`, `apikey`, `Accept: text/event-stream`, and the streaming flag on produces a valid SSE stream. Slice 3 only needs to consume it from the widget — nothing server-side changes.

---

## Slice 3 — Widget streaming consumption + in-flight UI + abort

### Why this slice exists

The widget currently uses `supabase.functions.invoke()` which cannot consume SSE. This slice switches to a direct `fetch` against the edge URL, introduces an in-flight assistant message that grows as tokens arrive, and wires `AbortController` lifecycle. All flag-gated; legacy path fully preserved.

### In scope

- Modify **`src/components/SupportAssistantWidget.tsx`**
  - Add a new chat-line variant alongside the existing ones: `{ id, role: "assistant", kind: "in_flight", streamingText: string, focusSnapshot }`. Extend the discriminated union type; the existing `kind: "answer"` / `kind: "contract_violation"` variants stay.
  - Introduce `inFlightAbortRef = useRef<AbortController | null>(null)`.
  - Flag check at mount via `import.meta.env.VITE_OPERATOR_ASSISTANT_STREAMING_V1`. When off, keep the exact current code path (including `supabase.functions.invoke`) with no behavior change.
  - When on, in `submitQuestion`:
    1. Push user line (as today).
    2. Push an in-flight assistant line with `streamingText: ""`.
    3. Create an `AbortController`, store in ref.
    4. Issue `fetch(edgeFunctionUrl, { method: "POST", body: JSON.stringify(payload), headers: { Authorization, apikey, "Content-Type": "application/json", "Accept": "text/event-stream" }, signal: controller.signal })`. Pull `Authorization` and `apikey` from the Supabase session and the anon key respectively (same values the `invoke` helper uses internally).
    5. Consume the stream via `consumeOperatorAssistantSseStream(res, controller.signal)` from Slice 1.
    6. On each `token` event: `setMessages(prev => updateInFlight(prev, id, m => ({ ...m, streamingText: m.streamingText + delta })))`.
    7. On `done` event: pass the payload to the existing `buildOperatorStudioAssistantAssistantDisplay(payload, { devMode })` unchanged. Replace the in-flight line with a final `{ kind: "assistant", display }` line. Update `carryForwardRef` from the same payload (same code as today).
    8. On `error` event or stream failure: replace the in-flight line with an error line using the existing error-rendering path (same message pattern as today's catch block). Do not keep the partial text on screen.
  - Loading indicator: the three-dots is shown when any in-flight line has `streamingText.length === 0`. As soon as the first delta arrives, dots disappear and text renders in the same assistant bubble.
  - Abort triggers:
    - Widget closes via its existing close handler → `inFlightAbortRef.current?.abort()`; remove any in-flight line.
    - User submits a new question while an in-flight line exists → abort prior, replace in-flight with nothing (or collapse to an "interrupted" line — pick the quieter option; recommend: drop the in-flight line silently) before pushing the new user+in-flight lines.
    - Component unmount → `useEffect` cleanup aborts.
- Modify **`src/lib/operatorStudioAssistantWidgetResult.ts`**
  - No functional change. Optional: export an explicit `OperatorStudioAssistantInFlightDisplay` type for the in-flight variant if helpful for widget typing. Keep narrow; do not add rendering logic.
- **Do not change** `buildOperatorStudioAssistantAssistantDisplay` — it remains the terminal path for both streaming (on `done`) and non-streaming.

### Out of scope

- No "stop generating" UI button. Abort exists internally; the user-facing button is an obvious future ~10-line follow-up that belongs in its own small slice if prioritized.
- No persistence of partial text across page reloads.
- No streaming of `proposedActions`.
- No dev-retrieval ribbon reshape.
- No carry-forward changes.
- No widget styling refresh beyond the "dots vanish when text arrives" behavior.

### Target files to inspect / change

- **Modify:** `src/components/SupportAssistantWidget.tsx`.
- **Possibly extend:** `src/lib/operatorStudioAssistantWidgetResult.ts` (types only; no logic change).
- **Import from Slice 1:** `src/lib/operatorStudioAssistantStreamClient.ts`.
- **No touch:** `buildOperatorStudioAssistantAssistantDisplay` logic, proposed-action normalizers, carry-forward client-state handling.

### Acceptance criteria

1. **Flag off:** widget behavior is byte-identical to pre-slice behavior. All existing widget tests pass unchanged. `supabase.functions.invoke` is still called.
2. **Flag on, successful stream:** user submits a question → three dots appear briefly → first text chunk renders within the first `token` event → text grows until `done` → final assistant line is indistinguishable from a non-streamed assistant line (same display, same proposed-action cards, same ribbon).
3. **Flag on, tool-call turn:** three dots persist through the tool pass (acceptable), then text streams once the second pass starts. Final state is identical to the non-streamed case.
4. **Carry-forward round-trip:** the value in the `done` event's `carryForward` field replaces `carryForwardRef.current` and is sent on the next turn exactly as today.
5. **Abort on close:** closing the widget mid-stream fires `abort()`, the `fetch` terminates, the in-flight line is removed, no further React state updates occur.
6. **Abort on new submit:** submitting a new question while one is streaming aborts the prior stream cleanly, drops the prior in-flight line, and starts a fresh turn.
7. **Component unmount abort:** `useEffect` cleanup aborts; no "set state on unmounted component" warnings in tests.
8. **Error mid-stream:** widget shows the same error surface as today's `catch` block; partial text is not left on screen.
9. **No legacy regression:** contract-violation handling, dev-mode retrieval ribbon, and all proposed-action card rendering work identically whether the payload arrived via streaming or non-streaming.

### Test expectations

- **Unit:** `SupportAssistantWidget.streaming.test.tsx` — new test file with `fetch` mocked to return a scripted SSE stream:
  - Happy path: tokens render progressively; final display matches fixture.
  - Tool-call path: dots persist past first-pass; text appears during second-pass.
  - Error event replaces in-flight with error line.
  - Abort-on-close removes in-flight; no further updates.
  - Abort-on-new-submit.
  - Flag off: uses `supabase.functions.invoke`; no `fetch` call observed.
- **Regression:** every existing widget test passes unchanged when the flag is off.
- **Integration (optional, one test):** end-to-end with the Slice 2 edge function (mocked OpenAI) to confirm a real SSE stream → widget rendering path works.

### Handoff note

At the end of Slice 3, the streaming feature is functionally complete. The feature flag remains off by default on both server and client. Flipping the flag on in staging for one tenant, watching telemetry (time-to-first-token, abort rate, `operator_studio_assistant_llm_failed` rate), and then flipping prod is an operations-slice task handled outside this implementation plan. No further code changes required for rollout itself.

---

## Appendix — Not in this plan

Explicitly deferred; do not pull into any of the three slices:

- **"Stop generating" UI button.** Abort mechanics exist after Slice 3; the button is trivial to add later but out of scope for the core feature.
- **Streaming telemetry dashboard.** Per-call structured logs are sufficient until the feature has real usage.
- **Partial `proposedActions` rendering.** Contract is atomic; do not change.
- **Responses API migration.** Separate decision; unrelated.
- **Multi-turn streaming state / server-side conversation retention.** Not part of this feature.
- **Streaming on the persona writer (client-facing).** Different surface, different safety envelope, out of scope.

---

## Appendix — One-line summary per slice

1. **Ship the scanner and SSE plumbing as isolated, tested utilities.**
2. **Wire the scanner into the LLM call and the edge function, flag-gated, legacy path untouched.**
3. **Consume the SSE stream in the widget with an in-flight line, flag-gated, legacy path untouched.**
