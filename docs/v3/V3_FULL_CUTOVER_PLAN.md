# V3 Full Cutover Plan

## Purpose

This document defines the remaining path from the current **hybrid** runtime to a **fully live V3** runtime.

It is intentionally narrower than the broad cleanup docs:

- [POST_V3_CLEANUP_AUDIT.md](C:/Users/Despot/Desktop/wedding/POST_V3_CLEANUP_AUDIT.md) explains what was unsafe or legacy
- [POST_V3_CLEANUP_EXECUTION.md](C:/Users/Despot/Desktop/wedding/docs/v3/POST_V3_CLEANUP_EXECUTION.md) covers the first hardening wave
- [POST_V3_CLEANUP_PHASE2_ROADMAP.md](C:/Users/Despot/Desktop/wedding/docs/v3/POST_V3_CLEANUP_PHASE2_ROADMAP.md) tracks parity / shadow / retirement sequencing

This file is the **endgame activation plan**.

## Current State

### True today

- V3 foundations are implemented:
  - decision context
  - strict tool schemas
  - verifier / escalation contracts
  - operator lane
  - orchestrator QA / replay / shadow path
  - replay and parity harnesses
- Legacy `ai/intent.*` remains the live production path for email/web.
- `clientOrchestratorV1` is **not** yet the default live route.
- Legacy workers are still required for current production behavior.

### What this means

- The repo is **not pre-V3**
- The repo is **not fully cut over to V3**
- The repo is in a **strangler / hybrid** state

## Activation Goal

The repo can be called **fully live V3** only when all of the following are true:

1. email/web client traffic is routed through `ai/orchestrator.client.v1` for the supported production paths
2. the orchestrator produces acceptable live outcomes for those paths:
   - draft / approval handoff
   - blocked / ask / escalation handling
   - no silent no-op replacement of legacy behavior
3. legacy `ai/intent.*` specialists are no longer needed for those production paths
4. the remaining legacy workers are either:
   - intentionally retained for a separate domain, or
   - retired via D2/D3

## Non-Goals

This plan does **not** assume:

- intake must move immediately into the orchestrator
- operator WhatsApp must be merged into the client orchestrator
- every old worker must disappear before the system is useful

The target is **safe activation**, not aesthetic deletion.

## Preconditions

These must remain true before any live cutover retry:

### Safety preconditions

- tenant-proofing and sleeper hardening from the post-V3 cleanup remain intact
- no direct client-facing send bypasses are reintroduced
- legacy live routing remains the fallback until a cutover gate explicitly replaces one bounded path

### Evidence preconditions

- B3 shadow comparison logs exist and are usable
- A4 read-side parity is present in orchestrator proposal shaping
- D1 retirement-prep audit stays current for worker-removal decisions

### Operational preconditions

- ambiguous external producers are mapped before retirement work:
  - `comms/email.received`
  - `comms/whatsapp.received`
  - `operator/whatsapp.legacy.received`
  - `comms/whatsapp.received.v2`
  - `client/whatsapp.inbound.v1`

### Email/web legacy intent sequencing (readiness)

- **RET0 inventory:** [`docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) — which `ai/intent.*` events triage still emits for email/dashboard web, which paths are **orchestrator-live when gates are on**, and which workers remain **rollback when gates are off**. Use this before **RET1** (stop obsolete dispatches) or **RET2** (unregister).
- **RET1 observability (historical):** same doc **§5** — **archived** spec for **`retirement_dispatch_observability_v1`** + **`[triage.retirement_dispatch_v1]`**; the implementation was **removed** (Slice 9) with **no** current runtime emission — do not treat as a live signal.
- **RET1b rollup:** same doc **§5.5** — [`scripts/ret1_dispatch_metrics_rollup.mjs`](../../scripts/ret1_dispatch_metrics_rollup.mjs) for offline counts from log exports.
- **RET1c D1 candidate:** [`docs/v3/RET1C_D1_CANDIDATE_SELECTION.md`](RET1C_D1_CANDIDATE_SELECTION.md) — export procedure, rollup commands, first D1 candidate path (CUT2 web-widget concierge).
- **RET2 unregister-readiness audit (planning):** [`docs/v3/RET2_UNREGISTER_READINESS_AUDIT.md`](RET2_UNREGISTER_READINESS_AUDIT.md) — per-worker criteria, producers, evidence gaps; **no unregister** in that slice.
- **RET2 pilot candidate selection:** [`docs/v3/RET2_PILOT_CANDIDATE_SELECTION.md`](RET2_PILOT_CANDIDATE_SELECTION.md) — production RET1 export runbook + **one** pilot decision rule (intake/persona/WhatsApp excluded); execution deferred until evidence.
- **CUT2 D1 execution:** [`docs/v3/CUT2_WEB_WIDGET_D1_PREP_SLICE.md`](CUT2_WEB_WIDGET_D1_PREP_SLICE.md) — `TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1` + `cut2_web_widget_d1_prep` v2; legacy blocked on web-widget branch when CUT2 off if D1 disallows.
- **CUT4 D1 execution:** [`docs/v3/CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`](CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md) — `TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1` + `cut4_main_path_concierge_d1_prep` v2; legacy blocked when CUT4 off if D1 disallows.
- **CUT5 D1 execution:** [`docs/v3/CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`](CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md) — `TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1` read in triage; `cut5_main_path_project_management_d1_prep` v2; blocked status when CUT5 off + D1 disallows legacy.
- **CUT6 D1 execution:** [`docs/v3/CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md`](CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md) — `TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1` read in triage; `cut6_main_path_logistics_d1_prep` v2; blocked status when CUT6 off + D1 disallows legacy.
- **CUT7 D1 execution:** [`docs/v3/CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`](CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md) — `TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1` read in triage; `cut7_main_path_commercial_d1_prep` v2; blocked status when CUT7 off + D1 disallows legacy.
- **CUT8 D1 execution:** [`docs/v3/CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`](CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md) — `TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1` read in triage; `cut8_main_path_studio_d1_prep` v2 on routed / blocked returns.

## Recommended Slice Order

Do the remaining work in this order:

1. `CUT1` narrow live cutover candidate selection + evidence review
2. `CUT2` env-gated narrow live cutover implementation
3. `CUT3` live observation / rollback gate tightening
4. `CUT4` broader email/web cutover
5. `RET1` stop obsolete production dispatches
6. `RET2` unregister dead workers from `inngest/index.ts`
7. `RET3` delete dead modules and comments

## Slice Definitions

### CUT1. Narrow Live Cutover Candidate Review

Goal:
Choose one bounded production path that is actually plausible for V3 live ownership now.

Required output:

- one chosen candidate path
- one rejected-candidate list with reasons
- one evidence statement based on B3 logs and A4 behavior

Preferred candidate shape:

- a known-wedding web/email path
- message-oriented
- most likely to resolve into `send_message` + draft / approval
- minimal dependence on specialty-side raw writes

Do not implement routing changes in `CUT1`.

### CUT2. Env-Gated Narrow Live Cutover

Goal:
Enable exactly one bounded live path behind an explicit environment gate.

Rules:

- default remains legacy
- only one narrow branch is replaced
- shadow remains understandable
- rollback is one env change away

Required behavior:

- when gate is off:
  - legacy path remains unchanged
- when gate is on:
  - the chosen narrow branch routes live to `ai/orchestrator.client.v1`
  - the old legacy dispatch for that exact branch is skipped
- all other paths remain legacy

### CUT3. Live Observation And Rollback Tightening

Goal:
Use real production evidence from the narrow cutover path before broadening.

Required signals:

- orchestrator outcome class
- draft creation rate
- escalation artifact rate
- no-op / no-user-visible-outcome rate
- verifier block rate
- rollback-triggering failure signals

Required result:

- explicit go / no-go decision for broader cutover

### CUT4. Broader Email/Web Cutover

Goal:
Move the remaining supported non-intake email/web client traffic to V3.

Only allowed when:

- `CUT2` narrow path stayed healthy
- `CUT3` evidence is acceptable
- no major parity gaps remain for the broadened class

Do not include intake unless separately approved.

**Intake (post CUT8):** Legacy `ai/intent.intake` is structurally different from known-wedding orchestrator cutovers (CRM bootstrap, calendar extraction, persona handoff). Planning and gaps are documented in [INTAKE_MIGRATION_POST_CUT8_SLICE.md](INTAKE_MIGRATION_POST_CUT8_SLICE.md). Do not treat intake as another CUT4-style specialist swap without that analysis.

**Product scope:** **Client intake is email.** The dashboard **web** channel is photographer ↔ Ana (AI manager), not client lead capture — do not plan a “web client intake” migration slice. After **live email** post-bootstrap intake cutover, the next major adjacent target is **unfiled / unresolved matching**, not web intake.

**Unfiled / unresolved (not CUT4-style):** Baseline behavior, stage-gate vs matchmaker interaction, and observability fields are documented in [UNFILED_UNRESOLVED_MATCHING_SLICE.md](UNFILED_UNRESOLVED_MATCHING_SLICE.md). Treat as **identity + filing policy** work; do not mirror known-wedding orchestrator cutover gates without that analysis.

### RET1. Stop Obsolete Production Dispatch

Goal:
Stop producing events for legacy workers that no longer back live behavior.

Preconditions:

- replacement path is live
- rollback confidence is good
- no ingress still depends on the old event

### RET2. Unregister Dead Workers

Goal:
Remove workers from [inngest/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/index.ts) only after `RET1`.

**Readiness audit (no removal in that slice):** [`docs/v3/RET2_UNREGISTER_READINESS_AUDIT.md`](docs/v3/RET2_UNREGISTER_READINESS_AUDIT.md) — legacy `ai/intent.*` inventory, triage vs non-triage producers, persona chain, rollback. **Actual unregister** is a separate **RET2 execution** slice with per-worker proof.

Preconditions:

- no live producer
- no required ingress
- no QA / replay dependency worth preserving

### RET3. Delete Dead Modules

Goal:
Delete truly dead worker files and stale comments after `RET2`.

Preconditions:

- worker already unregistered
- no remaining imports
- no remaining runbook / comment ambiguity

## Rollout Gates

### Gate 1: eligible for narrow live cutover

All must be true:

- chosen path is bounded and reversible
- orchestrator creates a real user-visible outcome for the normal case
- shadow comparison does not show orchestrator as materially weaker than legacy for that path
- no known `P0`/`P1` blocker remains on that path

### Gate 2: eligible for broader cutover

All must be true:

- narrow cutover stayed healthy long enough to be credible
- rollback was not required
- operator / approval / outbound flows still behave correctly
- readiness logs do not show a material no-op replacement problem

### Gate 3: eligible for legacy retirement

All must be true:

- legacy path no longer receives live production traffic
- external producers are mapped
- D1 audit is updated and confirms removal safety

## Rollback Conditions

Immediate rollback to legacy is required if a live orchestrator path shows any of:

- traffic reaches V3 but yields no acceptable user-visible outcome for the normal case
- unexpected draft suppression
- unexpected escalation inflation
- tenant-safety regression
- outbound / approval regression
- clear parity regression against the path it replaced

Rollback must be:

- one gate/env toggle away
- not dependent on a code deploy if avoidable

## Legacy Retirement Conditions

A legacy worker may be retired only when:

1. its production dispatch is stopped
2. no live ingress still depends on it
3. no external producer still targets its event
4. QA/replay no longer depends on it, or a replacement exists
5. D1 evidence is updated and explicit

If any of the above is unknown, keep the worker.

## Safest First Live Candidate

Current recommendation:

- **do not choose by guesswork**
- choose the first live cutover candidate only after reviewing B3 logs for:
  - high draftability
  - low specialty-write dependence
  - low no-op outcome risk

What the first candidate should look like:

- a bounded client-reply path
- likely to become `send_message`
- not dependent on CRM mutation or specialty-side raw DB writes
- not intake
- not operator WhatsApp

## Success Definition

You can say “V3 is fully implemented and live” only when:

- supported email/web client routing is live on V3
- legacy specialist routing is no longer the default production path for those routes
- narrow cutover has already succeeded
- broader cutover has already succeeded
- retirement work removed truly obsolete legacy runtime pieces

Until then, the honest label is:

- **V3 implemented, hybrid runtime**

## Operator Note

If there is uncertainty between:

- attempting another live cutover, or
- preserving safety

choose safety and keep legacy live until evidence improves.
