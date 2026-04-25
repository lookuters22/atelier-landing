# POST-V3 CLEANUP PHASE 2 ROADMAP

## Purpose

This document defines the **remaining** cleanup work after:

- the post-V3 audit
- Slices 1–3 hardening
- the failed early Slice 4 cutover attempt
- the safety rollback back to legacy email/web routing

Current truth:

- the repo is **safer** than before
- the repo is **not yet fully cut over**
- the V3 client orchestrator is still **QA/replay only**

That is acceptable for now.

Do not force final cutover until replacement coverage is real.

## Current State

### Done

- sleeper wake-up safety hardening
- tenant-proofing on still-live legacy workers
- direct-send / bypass hardening
- legacy email/web cutover attempt was safely rolled back

### Not Done

- V3 orchestrator does not yet replace the legacy specialist chain end-to-end
- triage still routes production email/web through legacy `ai/intent.*`
- legacy workers are still registered and still needed for production traffic

## Rule For Phase 2

Do **not** cut over routing first.

Instead:

1. make the new path behaviorally complete
2. prove it in replay/QA
3. then move traffic
4. only then remove legacy workers

## Remaining Workstreams

## Workstream A — Orchestrator Parity

Goal:
Bring `clientOrchestratorV1` up from placeholder status to a real replacement path.

### A1. Action proposal beyond verifier + calculator

Current gap:

- `clientOrchestratorV1` only proposes verifier + placeholder calculator

Needed:

- propose real client-facing action families
- resolve playbook / decision-mode implications
- carry enough structured outcome to support draft creation or escalation

Do not cut over traffic yet.

### A2. Draft creation path

Current gap:

- orchestrator does not create `drafts`

Needed:

- add a bounded draft-generation path that produces the same core output class the legacy runtime does:
  - a draft for approval
  - or a blocked/escalated outcome

Important:

- no direct send
- keep approval/outbound pipeline intact

### A3. Escalation / blocked-action parity

Current gap:

- orchestrator can block, but does not yet replace the older practical “what happens next” behavior

Needed:

- when verifier or policy blocks an action, route to:
  - operator escalation
  - safe ask-first output
  - or draft-only behavior

### A4. Read-side parity

Current gap:

- heavy context exists, but specialist-worker behavior is still richer in some domains

Needed:

- confirm the orchestrator can cover the minimum live email/web cases currently handled by:
  - concierge
  - logistics
  - commercial
  - project manager
  - studio

Do not remove those workers until this is true.

## Workstream B — Replay And QA Proof

Goal:
Prove the new path before live cutover.

### B1. Replay harness for `ai/orchestrator.client.v1`

Needed:

- stable replay fixture inputs for:
  - known wedding
  - no wedding / unfiled
  - high broadcast-risk case
  - ask-first / draft-only cases
  - escalation-triggering case

### B2. Outcome assertions

Needed:

- verify that orchestrator outputs:
  - draft when it should
  - block when it should
  - ask/escalate when it should
  - never silently auto-send

### B3. Regression comparison against legacy

Needed:

- compare a small gold set of legacy email/web threads against orchestrator outcomes
- identify where the new path is still weaker

Only after this should live traffic move.

## Workstream C — Controlled Routing Cutover

Goal:
Move live traffic in stages instead of all at once.

### C1. Shadow fanout

Preferred first move:

- keep legacy production routing
- also fan out to `ai/orchestrator.client.v1` in shadow mode for observability only
- do not let shadow mode create live sends

This is safer than immediate replacement.

### C2. Narrow live cutover

Only after shadow confidence:

- move one bounded class of email/web traffic to orchestrator first
- examples:
  - concierge-like replies only
  - or known-wedding web threads only

Do not cut over all non-intake traffic at once.

Status update:

- an early narrow web-widget cutover was attempted and then rolled back
- current orchestrator behavior is still not a full live replacement for the old path
- do **not** retry C2 until read-side parity is stronger and B3 comparison signals look good

**Reassessment slice (post A4, roadmap step 8):** Live C2 remains **off** — no env-gated live dispatch to `ai/orchestrator.client.v1` in `triage`. Machine-readable hold: `getOrchestratorClientV1LiveCutoverReadiness()` / constant `ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER` in `supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts` (reason code `C2_HOLD_REASSESSMENT_POST_A4_NOT_READY`). Email/web `triage` return payloads include `orchestrator_client_v1_live_cutover` for ops (grep `C2_HOLD_`).

### C3. Broader cutover

After narrow live cutover proves stable:

- move the remaining non-intake email/web traffic

### C4. Intake decision

Separate question:

- `ai/intent.intake` can remain separate until intake migration is truly ready
- **Product scope:** client **intake** is **email**; dashboard **web** is photographer ↔ Ana — not a “web client intake” cutover target (see `INTAKE_MIGRATION_POST_CUT8_SLICE.md` §0)

Do not force intake into orchestrator just to “finish cleanup.”

### C5. Unfiled / unresolved matching (parallel track)

This is **not** the same as CUT4–CUT8 known-wedding live cutover. Baseline behavior and blockers are in **`docs/v3/UNFILED_UNRESOLVED_MATCHING_SLICE.md`**.

- **Observability (implemented):** main-path `triage` returns include **`wedding_resolution_trace`**; logs **`[triage.routing_resolution]`** (information only; no dispatch change).
- **Bounded matchmaker activation (optional):** `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1` — narrow email subset + re-dispatch after resolution; see **`UNFILED_UNRESOLVED_MATCHING_SLICE.md`** §4.1. Default off.
- **Do not** treat unfiled email as a second CUT4 until **filing policy** and **stage gate vs matchmaker** decisions are explicit.

## Workstream D — Legacy Worker Retirement

Goal:
Remove only what is truly replaced.

### D0. Email/web `ai/intent.*` inventory (readiness — no removal)

**Done (RET0 slice):** [`docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) classifies triage-driven legacy specialist events for **`comms/email.received`** and **`comms/web.received`** (main path + web-widget branch): live vs CUT2/CUT4–CUT8 **gated orchestrator** vs **rollback**, and directional retirement preconditions. Comments in `triage.ts` (`INTENT_EVENT_MAP`) and `inngest/index.ts` point here.

### D0b. RET1 dispatch observability (historical — module removed, Slice 9)

**Superseded:** The planned **`retirement_dispatch_observability_v1`** return field + **`[triage.retirement_dispatch_v1]`** log line were tied to pre-ingress **`triage.ts`** work. **`retirementDispatchObservabilityV1.ts` was deleted** with **no replacement** in the current runtime. See **§5** in [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) for the **archived** schema and rollup notes only — **not** a live telemetry contract.

### D0c. RET1b rollup script (readiness — no removal)

**Done:** [`scripts/ret1_dispatch_metrics_rollup.mjs`](../../scripts/ret1_dispatch_metrics_rollup.mjs) aggregates exported log lines into counts by **`lane`**, **`branch_code`**, **`downstream_inngest_event`**, **`dispatch_intent`**, legacy **`ai/intent.*`**, **`rollback_capable`**, plus heuristic hints. See [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) **§5.5**.

### D0d. RET1c evidence + first D1 candidate (planning — no removal)

**Done:** [`docs/v3/RET1C_D1_CANDIDATE_SELECTION.md`](RET1C_D1_CANDIDATE_SELECTION.md) — procedure to export logs and run the rollup; template for production numbers; **first recommended D1 candidate:** CUT2 **web-widget known-wedding** legacy **`ai/intent.concierge`** path (narrowest gate, distinct `path_family`). No production export was checked into the repo; fill template after export.

### D0e. CUT2 web-widget D1 execution (narrow — no global unregister)

**Done:** [`docs/v3/CUT2_WEB_WIDGET_D1_PREP_SLICE.md`](CUT2_WEB_WIDGET_D1_PREP_SLICE.md) — **`TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1`** read on web-widget known-wedding branch; when legacy disallowed and CUT2 off → **no** `ai/intent.concierge`; **cut2_web_widget_d1_prep** `schema_version: 2`; RET1 blocked lane + sentinel. Main-path concierge (CUT4) unchanged.

**Not done:** unregister **`conciergeFunction`** (`D2`) globally — other paths still emit `ai/intent.concierge`.

### D0f. CUT4 main-path concierge D1 execution (narrow — no global unregister)

**Done:** [`docs/v3/CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`](CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md) — **`TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1`** read on main-path concierge + known-wedding; **`cut4_main_path_concierge_d1_prep`** v2; RET1 blocked lane + sentinel; **`status: cut4_main_path_concierge_d1_blocked_no_dispatch`**. CUT2 and CUT5–CUT8 unchanged.

**Not done:** CUT5+ D1 gates; unregister **`conciergeFunction`** (`D2`) globally.

### D0g. CUT5 main-path project_management D1 prep + execution (no removal)

**Done:** [`docs/v3/CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`](CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md) — **`TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1`** read in triage; **`cut5_main_path_project_management_d1_prep`** v2; RET1 blocked lane + sentinel; **`status: cut5_main_path_project_management_d1_blocked_no_dispatch`**. CUT2, CUT4, CUT6–CUT8 unchanged.

**Not done:** CUT6+ D1 gates; unregister **`projectManagerFunction`** (`D2`) globally.

### D0h. CUT6 main-path logistics D1 prep + execution (no removal)

**Done:** [`docs/v3/CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md`](CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md) — **`TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1`** read in triage; **`cut6_main_path_logistics_d1_prep`** v2; RET1 blocked lane + sentinel; **`status: cut6_main_path_logistics_d1_blocked_no_dispatch`**. CUT2, CUT4, CUT5, CUT7–CUT8 unchanged.

**Not done:** unregister **`logisticsFunction`** (`D2`) globally.

### D0i. CUT7 main-path commercial D1 prep + execution (no removal)

**Done:** [`docs/v3/CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`](CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md) — **`TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1`** read in triage; **`cut7_main_path_commercial_d1_prep`** v2; RET1 blocked lane + sentinel; **`status: cut7_main_path_commercial_d1_blocked_no_dispatch`**. CUT2, CUT4–CUT6, CUT8 unchanged.

**Not done:** unregister **`commercialFunction`** (`D2`) globally.

### D0j. CUT8 main-path studio D1 prep + execution (no removal)

**Done:** [`docs/v3/CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`](CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md) — **`TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1`** read in triage; **`cut8_main_path_studio_d1_prep`** v2; RET1 blocked lane + sentinel; **`status: cut8_main_path_studio_d1_blocked_no_dispatch`**. CUT2, CUT4–CUT7 unchanged.

**Not done:** unregister **`studioFunction`** (`D2`) globally.

### D1. Stop production dispatch

A worker becomes removable only after:

- triage no longer produces its event
- replay/QA coverage exists for its replacement
- no other live ingress depends on it

**Slice D1 (retirement prep, conservative):** In-repo producer/ingress audit documented in `docs/v3/PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md`. No workers were removed; several triage ingress events have **no** local `inngest.send` (may be external) — map production before any D2.

### D2. Unregister from `inngest/index.ts`

Only after D1:

- remove unused imports
- remove unused entries from `functions: []`

**RET2 unregister-readiness audit (planning, no removal):** [`docs/v3/RET2_UNREGISTER_READINESS_AUDIT.md`](docs/v3/RET2_UNREGISTER_READINESS_AUDIT.md) — per legacy `ai/intent.*` worker: triage vs non-triage producers, persona dependencies, rollback. **Actual unregister** requires a separate execution slice with production evidence (see audit §6–§7).

**RET2 pilot candidate selection (no removal):** [`docs/v3/RET2_PILOT_CANDIDATE_SELECTION.md`](docs/v3/RET2_PILOT_CANDIDATE_SELECTION.md) — runbook + single-pilot rule after RET1 rollup; intake/persona/WhatsApp out of scope for first specialist pilot.

### D3. Delete dead modules

Only after D2 and final sanity checks:

- remove truly orphaned worker files
- remove stale comments and docs

## Recommended Slice Order

Do these in this order:

1. **A1** real orchestrator action proposal
2. **A2** orchestrator draft-creation path
3. **A3** orchestrator blocked/escalation parity
4. **B1/B2** replay harness and assertions
5. **C1** shadow fanout
6. **B3** compare shadow outcomes to legacy
7. **A4** read-side parity
8. **Reassess C2** using B3 shadow comparison evidence plus A4 parity improvements
9. **C2** narrow live cutover
10. **C3** broader live cutover
11. **D1/D2/D3** worker retirement

Practical note:

- the original plan placed `C2` immediately after `B3`
- actual implementation review showed `C2` was still premature and had to be rolled back
- the safe sequence is now `B3 -> A4 -> reassess C2`, not `B3 -> C2` directly

## Prompt Pattern

Use this shape for each Phase 2 slice:

```text
Implement one narrow slice from docs/v3/POST_V3_CLEANUP_PHASE2_ROADMAP.md only.

Current baseline:
- docs/v3/POST_V3_CLEANUP_AUDIT.md
- docs/v3/POST_V3_CLEANUP_EXECUTION.md
- docs/v3/POST_V3_CLEANUP_PHASE2_ROADMAP.md
- live email/web routing is still on legacy ai/intent.* by design
- ai/orchestrator.client.v1 is still QA-only unless this slice explicitly says otherwise

Read first:
- the specific files named in this slice
- docs/v3/ARCHITECTURE.md
- docs/v3/DATABASE_SCHEMA.md

Rules:
- do not broaden scope
- do not remove workers unless this slice explicitly says retirement
- do not cut over live traffic unless this slice explicitly says cutover
- preserve all earlier security hardening
- stop after this slice

Deliver:
- exact files changed
- exact capability added or gap closed
- what is still intentionally left for later slices
```

## Recommended Next Slice

Start with:

### Phase 2 Slice A1 — Real Orchestrator Action Proposal

Goal:
Replace the placeholder “verifier + calculator only” proposal logic with real structured candidate actions for email/web client traffic.

Do not create drafts yet.
Do not cut over traffic yet.
Do not remove legacy workers yet.

If this slice is not solid, every later cutover attempt will fail again.
