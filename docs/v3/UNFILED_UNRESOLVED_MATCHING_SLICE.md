# Unfiled / unresolved matching — analysis slice (V3)

## Purpose

This document is the **evidence-based baseline** for the next major migration area after **email-only intake** scope and **known-wedding** orchestrator cutovers: **threads (and email turns) where `wedding_id` is not resolved** or **matching is ambiguous**.

It is **not** another CUT4-style “swap specialist for orchestrator” slice. Unfiled handling requires **identity + filing policy** before V3 can own outcomes safely.

**Out of scope:** WhatsApp operator lane, dashboard web widget (photographer ↔ Ana), worker retirement.

---

## 1. Product / UI definition of “unfiled”

- **Dashboard “Unfiled” inbox** loads threads where `threads.wedding_id IS NULL` (and `kind != 'other'`), via `useUnfiledInbox.ts`.
- That set includes **more than one business situation**:
  - **New email leads** routed as **`ai/intent.intake`** while the CRM wedding row does not yet exist or is not linked (thread created before bootstrap completes).
  - **Hypothetical** threads where the system could not auto-file to a wedding but still classified a non-intake intent (see §3 — **not produced by current triage**).
  - Threads created by other flows that leave `wedding_id` null.

So **“unfiled” in the DB/UI is nullable `wedding_id`**, not a single triage status code.

---

## 2. Current routing behavior (email / web main path — `triage.ts`)

Ingress: `comms/email.received` and non–widget `comms/web.received` (widget fast-path is separate below).

### 2.1 Deterministic wedding resolution

- Lookup **`clients`** by **exact inbound `sender` email** → `wedding_id` (`.limit(1).maybeSingle()`).
- If a wedding id exists, load **`weddings`** for `photographer_id` and `stage`.
- If the client row is missing or email is empty, **`wedding_id` stays null** (ambiguous or unknown sender).

### 2.2 Stage gate (intent)

- `enforceStageGate(llmIntent, projectStage, hasWedding)`:
  - If **`!hasWedding` or `!projectStage`** → enforced intent is **`intake`** (overrides the triage LLM).
  - If `hasWedding` and stage present → intent is constrained to allowed intents for the stage group.

**Consequence:** With **no deterministic wedding**, `hasWedding` is false → **enforced intent is always `intake`**. Non-intake specialist intents **do not run** on unknown-wedding email in the current pipeline.

### 2.3 Conditional matchmaker (OpenAI `gpt-4o-mini`)

- Runs only inside `conditional-matchmaker` when:
  - there is **no** deterministic `identity.weddingId`, **and**
  - enforced intent is **not** `intake`, **and**
  - tenant `photographer_id` exists, **and**
  - there is at least one **active** wedding (stage not `archived` or `delivered`).

- If it runs: **`runMatchmakerAgent`** suggests one `suggested_wedding_id` and a **confidence_score**. Only scores **≥ 90** auto-resolve `finalWeddingId`; otherwise the suggestion is stored only if persisted as `ai_routing_metadata` (when `match` is non-null and `finalWeddingId` is still null).

**Interaction with §2.2:** Because **no deterministic wedding forces `intake`**, the matchmaker’s **`intent === "intake"` early return runs first** and **`runMatchmakerAgent` is not called** today on the main email path when the sender is not on a client row.

So **LLM matchmaking for cross-wedding disambiguation is effectively dormant** until stage-gate / intent rules allow non-intake without a deterministic wedding.

### 2.4 Thread persistence

- Inserts **`threads`** with `wedding_id: finalWeddingId ?? undefined` (nullable) and optional **`ai_routing_metadata`** (suggested wedding, confidence, reasoning, classified intent) when there is no final wedding but a match object exists.

### 2.5 “Unfiled” early exit in triage

- `if (intent !== "intake" && !finalWeddingId)` → return `status: "unfiled"` (no `ai/intent.*` dispatch).

Given §2.2, **`intent` is `intake` whenever there is no deterministic wedding**, so this branch is **unreachable** with the current `enforceStageGate` logic. The **UI still shows unfiled threads** (nullable `wedding_id`) from **intake** and other sources; they are not necessarily tied to this return value.

### 2.6 Web widget fast path (`comms/web.received` with deterministic wedding)

- If **`identity.weddingId`** is set (client email on file), triage creates a thread and routes to CUT2 / concierge **without** going through the stage gate + matchmaker block above.
- **Out of scope** for client unfiled migration; listed here only so we do not confuse dashboard web with intake.

---

## 3. Ambiguity and multiple candidates

- **Deterministic layer:** one row from `clients` by email (first match if multiple rows ever exist — not a dedicated “multi-candidate” structure in code).
- **Matchmaker layer:** returns **one** suggested wedding id + score, not a ranked candidate list.
- **Multiple weddings / people** as a first-class model is **not** implemented in current migrations (see `DATABASE_SCHEMA.md` — `thread_weddings` is target, not fully live).

---

## 4. This slice — what was implemented

- **Documentation** (this file + cross-links): precise behavior, unreachable branch, dormant matchmaker.
- **Observability:** triage Inngest function return value includes **`wedding_resolution_trace`** (and structured **`matchmaker_skip_reason`** inside the matchmaker step) so ops/logs can see **why** matchmaking did or did not run, without inferring from side effects.
- **Logging:** one **`[triage.routing_resolution]`** line per main-path email/web turn (same branch as above), **default on** (no env gate) — information only.

### 4.1 Bounded unresolved email matchmaker activation (V3 migration slice)

**Env gate (single rollback toggle):** `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1` — enable with `1` or `true`; default **off** (unset).

**Narrow subset (email only, identity/filer — not orchestrator swap):**

- Ingress: **`comms/email.received`** only (dashboard **`comms/web.received`** unchanged).
- **No deterministic wedding:** `clients.email` lookup did not yield a `wedding_id` (same as “unknown sender” in §2.1).
- **Triage LLM intent is not `intake`:** the classifier returned a non-intake label (`concierge`, `logistics`, etc.) while the stage gate still forces `intake` when there is no wedding (§2.2). This targets “CRM gap / wrong email on file / cross-thread ambiguity” more than cold new leads.
- **Cold leads unchanged:** when `llm_intent === "intake"`, matchmaker does **not** run (same as before).

**When the gate is on and the subset matches:**

1. **`runMatchmakerAgent`** runs against the tenant’s active wedding roster (archived/delivered excluded), same conservative JSON contract as before (OpenAI `gpt-4o-mini`; confidence ≥ 90 to auto-resolve).
2. **Dispatch intent** is recomputed **after** resolution: `enforceStageGate(llmIntent, project_stage, !!final_wedding_id)` using the resolved wedding’s `stage` when a wedding is filed by matchmaker — so legacy **`ai/intent.*`** or CUT4–CUT8 **only** apply when a wedding id is actually resolved (or was deterministic). No known-wedding orchestrator path without a `finalWeddingId`.
3. If confidence is **below 90** or unresolved, behavior stays **intake**-shaped dispatch (`ai/intent.intake` when `dispatch_intent` is `intake`); thread may still get **`ai_routing_metadata`** suggestion fields when a low-confidence suggestion exists (unchanged persistence rules).
4. **Observability:** `wedding_resolution_trace` includes **`dispatch_intent`**, **`project_stage_used_for_dispatch`**, **`bounded_unresolved_email_matchmaker`** (`gate_on`, `subset_eligible`, `outcome`: `not_eligible` | `resolved_above_threshold` | `declined_low_confidence` | `skipped_matchmaker_not_invoked`), and **`bounded_unresolved_activation`**. **`[triage.routing_resolution]`** logs a compact **`bounded_unresolved_email_matchmaker_v1`** object (env, subset eligibility, outcome, suggested id, confidence, resolved final wedding id).

**Still out of scope for this slice:** WhatsApp, web widget, worker retirement, broad relaxation of the stage gate for all traffic, `thread_weddings` / contact graph migration.

**No change** to: intake-first behavior for cold leads (`llm_intent === "intake"`), web widget path, WhatsApp, worker registration.

### 4.2 High-confidence near-match — photographer approval escalation (bounded slice)

**Second env gate (rollback = unset):** `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1` — enable with `1` or `true`. **Requires** `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1` to be on and the same narrow email subset (§4.1); otherwise the escalation path does not run.

**Confidence band (does not lower auto-file certainty):**

- **Auto-file (unchanged):** matchmaker `confidence_score` **≥ 90** and valid `suggested_wedding_id` → `final_wedding_id` set; known-wedding dispatch as today.
- **Escalation-for-approval:** `confidence_score` in **[75, 90)** (inclusive 75, exclusive 90) **and** non-null `suggested_wedding_id` **and** matchmaker ran on the bounded path **and** no deterministic wedding → **no** auto-file, **no** `ai/intent.intake`, **no** specialist/orchestrator known-wedding dispatch.
- **Intake / manual (unchanged):** scores **below 75**, or no candidate id, or escalation gate off → prior behavior (typically `ai/intent.intake` when `dispatch_intent` is `intake`).

**Escalation representation:**

- Inserts **`escalation_requests`** with `action_key` **`request_thread_wedding_link`**, `reason_code` **`bounded_matchmaker_near_match`**, structured **`decision_justification`** (includes `candidate_wedding_id`, `confidence_score`, `matchmaker_reasoning`), `operator_delivery` **`dashboard_only`** (dashboard queue; no WhatsApp ping by default).
- Emits **`operator/escalation.pending_delivery.v1`** so existing **operator escalation delivery** behavior applies (`dashboard_only` → log-only path in `operatorEscalationDelivery`).

**Observability:**

- `wedding_resolution_trace.bounded_unresolved_email_matchmaker.outcome` may be **`escalated_for_approval`** (vs `resolved_above_threshold`, `declined_low_confidence`, …).
- `wedding_resolution_trace.unresolved_match_approval_escalation_id` when an escalation row was created.
- `[triage.routing_resolution].bounded_unresolved_email_matchmaker_v1` includes **`approval_escalation_env`** and **`near_match_for_approval`**.
- Return payload: **`intake_skipped_for_near_match_escalation`** when intake was skipped in favor of escalation.

### 4.3 QA-only synthetic confidence (deterministic E2E proof — default off)

**Env:** `TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1` — set to an **integer in [75, 89]** only when **both** `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1` and `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1` are on.

**Behavior:** After the real matchmaker returns a **non-null** `suggested_wedding_id`, triage **replaces** `confidence_score` with the configured value for routing/escalation only. The production auto-file threshold (**≥ 90**) is **unchanged**; when unset or invalid, this hook does nothing.

**Observability:** `wedding_resolution_trace.qa_synthetic_near_match_confidence_applied`, log line **`[triage.qa_synthetic_near_match_confidence]`**, and `matchmaker_reasoning` prefixed with `[qa:TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1=…]`.

**Rollback:** unset `TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1` (never enable in production unless deliberately running a proof).

---

## 5. What blocks a full “V3 unfiled” migration

1. **Policy:** When may the system auto-file a thread to a wedding vs require human filing vs stay on intake?
2. **Stage gate vs matchmaker:** Today’s gate **prevents** matchmaker from running for unknown senders; changing that is a **product/architecture** decision, not a small toggle.
3. **Data model:** Canonical **thread ↔ wedding** links (e.g. `thread_weddings`) and **contact graph** are not fully migrated.
4. **Orchestrator:** `clientOrchestratorV1` assumes **known** `weddingId` / tenant context for known-wedding paths; unfiled needs a **resolver or human-in-the-loop** contract, not a blind cutover.
5. **Evidence:** Need metrics on filing latency, wrong-file risk, and intake vs ambiguous threads before live gates.

---

## 6. Recommended next slice (after bounded activation)

1. **Production metrics:** aggregate **`wedding_resolution_trace.bounded_unresolved_email_matchmaker`** and **`matchmaker_skip_reason`** — wrong-file risk, intake vs resolved rates.
2. **Policy:** broaden or narrow the subset (e.g. subject/thread hints, allow-list tenants) before default-on.
3. **Data model:** `thread_weddings`, contact graph, multi-candidate matchmaker — still not first-class.
4. **Stage gate:** full relaxation for all unknown-wedding email remains a **product decision**, not a single env toggle.

---

## 7. References

- `supabase/functions/inngest/functions/triage.ts` — identity, stage gate, matchmaker, thread insert, unfiled early exit.
- `docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md` — email/web legacy `ai/intent.*` inventory (separate from unfiled matching; no worker removal).
- `supabase/functions/_shared/agents/matchmaker.ts` — OpenAI roster match (`gpt-4o-mini`; uses `OPENAI_API_KEY`).
- `src/hooks/useUnfiledInbox.ts` — UI definition of unfiled threads.
- `docs/v3/DATABASE_SCHEMA.md` §5.7 `threads`, §5.8 `thread_weddings` (target).
