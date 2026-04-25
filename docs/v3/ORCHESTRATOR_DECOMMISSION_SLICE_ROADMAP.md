# Orchestrator Decommission Slice Roadmap

## Why this roadmap exists

The original cleanup brief assumed `supabase/functions/inngest/functions/triage.ts` and the `_shared/orchestrator/` migration stack were still the live production path.

The Inngest production evidence says otherwise:

- active events/runs were observed for:
  - `import/gmail.delta_sync.v1`
  - `inbox/thread.requires_triage.v1`
  - `import/gmail.labels_refresh.v1`
  - `operator/escalation.pending_delivery.v1`
  - scheduled timers
- no recent runs were observed for:
  - `ai/intent.*`
  - `ai/orchestrator.client.v1`
  - `comms/email.received`
  - `comms/web.received`

That changes the framing, but it does **not** justify deleting the whole legacy/orchestrator stack immediately.

## Verified code truths

### 1. The live post-ingest path is real

The active Gmail path is:

- [processGmailDeltaSync.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processGmailDeltaSync.ts)
- emits `inbox/thread.requires_triage.v1`
- consumed by [processInboxThreadRequiresTriage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)

### 2. The old pre-ingest triage path is not fully deletable

[triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts) is still registered in [inngest/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/index.ts) and still listens to:

- `comms/email.received`
- `comms/web.received`

### 3. `comms/email.received` currently looks orphaned in-repo

Repo search found the event definition and the consumer in `triage.ts`, but **no emitter** for `comms/email.received` in `supabase/functions/`.

This makes the email pre-ingress lane a strong decommission candidate, but not yet a delete target without confirming no external emitter exists.

### 4. `comms/web.received` — in-repo emitter retired (execution Slice A)

[webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts) **no longer** emits `comms/web.received`. It returns **410 Gone** with `web_pre_ingress_retired`. `triageFunction` may still subscribe to `comms/web.received` until a later unregister PR; any **new** web traffic must use the supported replacement path (not this webhook emit).

### 5. The active Gmail/thread path still depends on old routing modules

The live worker [processInboxThreadRequiresTriage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts) imports:

- `isTriageBoundedUnresolvedEmailMatchmakerEnabled` from [triageShadowOrchestratorClientV1Gate.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts)
- shared triage logic from [emailIngressClassification.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/emailIngressClassification.ts)
- downstream dispatch from [runMainPathEmailDispatch.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/runMainPathEmailDispatch.ts)

### 6. The active Gmail/thread path can still reach legacy or orchestrator workers

[processInboxThreadRequiresTriage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts) calls [runMainPathEmailDispatch.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/runMainPathEmailDispatch.ts), and that helper can still emit:

- `ai/intent.intake`
- `ai/intent.concierge`
- `ai/intent.project_management`
- `ai/intent.logistics`
- `ai/intent.commercial`
- `ai/intent.studio`
- `ai/orchestrator.client.v1`

So these are **not proven dead** just because they did not appear in a one-day Inngest sample.

### 7. `clientOrchestratorV1` is not purely dormant

[processIntakeExistingThread.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processIntakeExistingThread.ts) can still emit:

- `ai/orchestrator.client.v1`
- `ai/intent.persona`

via intake post-bootstrap gates under `_shared/intake/`.

So the right framing is:

- `triage.ts` and CUT/shadow scaffolding are likely overgrown and partly dormant
- but `clientOrchestratorV1` and some routing gates are still reachable from active flows

## What we are actually doing

We are **not** doing a mass delete of `_shared/orchestrator/`.

We are doing a safe decommissioning program:

1. detach the live Gmail/thread path from old orchestrator gate modules
2. make the still-live downstream dispatch edges explicit
3. prove which pre-ingress paths are truly unused
4. only then delete dormant migration scaffolding

## Non-goals

- No schema changes as part of this cleanup track unless a later slice explicitly requires it
- No UI work
- No behavior-changing migration from legacy workers to `clientOrchestratorV1` in the first slices
- No “delete everything under `_shared/orchestrator`” PR

## Slice roadmap

### Slice 0 — Baseline and guardrails

Status: complete in analysis, keep as execution baseline

Goal:

- establish the source-of-truth architecture
- record what is active, what is reachable, and what is only legacy scaffolding

Acceptance:

- roadmap approved
- no deletes yet

---

### Slice 1 — Extract live routing flags out of the orchestrator gate file

**Status:** complete (orchestrator decommission prep).

Goal:

- move the **live post-ingest** flags/helpers out of [triageShadowOrchestratorClientV1Gate.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts) into a neutral triage module
- stop the active Gmail/thread path from importing `_shared/orchestrator/*` just to read bounded-unresolved / dedup gates

Likely files:

- new: `supabase/functions/_shared/triage/triageRoutingFlags.ts`
- [emailIngressClassification.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/emailIngressClassification.ts)
- [processInboxThreadRequiresTriage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)
- [triageShadowOrchestratorClientV1Gate.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts)

Expected scope:

- extract and re-home:
  - `isTriageBoundedUnresolvedEmailMatchmakerEnabled`
  - `isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled`
  - `isTriageDeterministicInquiryDedupV1Enabled`
  - `getTriageQaBoundedNearMatchSyntheticConfidenceScore`
  - related bounded unresolved constants
- keep backward-compatible re-exports from the old file so legacy code does not break yet

Acceptance:

- `processInboxThreadRequiresTriage.ts` no longer imports from `_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts`
- `emailIngressClassification.ts` no longer imports those live flags from `_shared/orchestrator/*`
- no behavior change

Why first:

- highest confidence cleanup
- immediate separation of active path from old migration module

---

### Slice 2 — Add explicit downstream dispatch observability for the live Gmail/thread path

**Status:** complete (orchestrator decommission prep).

Goal:

- make it undeniable which downstream events the active post-ingest worker still emits in production

Likely files:

- [processInboxThreadRequiresTriage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)
- [runMainPathEmailDispatch.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/runMainPathEmailDispatch.ts)
- targeted tests near the triage/shared dispatch helpers

Expected scope:

- emit structured logs around downstream dispatch result:
  - `legacy`
  - `intake`
  - `cut4_live`
  - `cut5_live`
  - `cut6_live`
  - `cut7_live`
  - `cut8_live`
  - blocked/no-dispatch cases
- include thread id, photographer id, dispatch intent, and result kind

Acceptance:

- active path dispatches are observable without reading code
- future deletion decisions can rely on real logs, not assumptions

Why second:

- proves actual reachability before deletion

---

### Slice 3 — Separate post-ingest dispatch policy from pre-ingress legacy migration policy

**Status:** complete (orchestrator decommission prep).

Goal:

- stop [runMainPathEmailDispatch.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/runMainPathEmailDispatch.ts) from being a mixed bag of:
  - live Gmail canonical dispatch
  - legacy `ai/intent.*` routing
  - CUT4–CUT8 orchestrator migration logic

Likely files:

- [runMainPathEmailDispatch.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/runMainPathEmailDispatch.ts)
- new: `supabase/functions/_shared/triage/postIngestThreadDispatch.ts`
- [processInboxThreadRequiresTriage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)
- [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts)

Expected scope:

- extract neutral post-ingest dispatch selection into a separate module
- leave `triage.ts` with its legacy/CUT-specific wiring
- keep behavior identical

Acceptance:

- active post-ingest worker no longer calls a helper that is semantically “main-path email dispatch”
- live Gmail/thread path has a clearly named dispatch module

Why third:

- removes the biggest naming/architecture lie from the current live path

---

### Slice 4 — Isolate the web pre-ingress path from the dead email pre-ingress path

**Status:** complete (orchestrator decommission prep).

Goal:

- reflect the real state:
  - `comms/email.received` appears orphaned
  - `comms/web.received` still has an emitter

Likely files:

- [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts)
- [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts)
- possibly [inngest/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/index.ts)

Expected scope:

- split or clearly separate the `comms/web.received` branch from the dead-looking email ingress assumptions
- add comments / structure that make web-only reachability explicit
- optionally remove the `comms/email.received` trigger if and only if no external emitter is confirmed

Acceptance:

- web path is explicit
- email pre-ingress path is either removed or formally marked as external-only pending proof

Risk note:

- do **not** remove `comms/email.received` consumer until external emitters are ruled out

---

### Slice 5 — Re-home or quarantine CUT2–CUT8 / shadow scaffolding

**Status:** complete (orchestrator decommission prep).

Goal:

- once live shared flags are extracted and post-ingest dispatch is separated, shrink the old gate file to what is truly legacy migration code

Likely files:

- [triageShadowOrchestratorClientV1Gate.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts)
- [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts)
- any CUT observation record helpers still only referenced by legacy path

Expected scope:

- keep only pre-ingress CUT/shadow helpers in orchestrator namespace
- remove shared live-path helpers already extracted in Slice 1
- reduce the blast radius of the giant gate file

Acceptance:

- `_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts` becomes legacy-only
- active post-ingest code no longer depends on it

---

### Slice 6 — Decide the future of `clientOrchestratorV1` from the real active callers

**Status:** complete (orchestrator decommission prep) — intake post-bootstrap path classified and observed (`intakePostBootstrapDispatchObservability`, `processIntakeExistingThread`); deeper cutover remains a separate decision.

Goal:

- treat `clientOrchestratorV1` as either:
  - an active intake/post-bootstrap path that deserves clearer ownership
  - or a candidate for later decommissioning

Likely files:

- [processIntakeExistingThread.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processIntakeExistingThread.ts)
- [clientOrchestratorV1.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/clientOrchestratorV1.ts)
- `_shared/intake/*OrchestratorGate.ts`

Expected scope:

- clarify whether intake post-bootstrap orchestrator is intended live behavior
- if yes, document and keep it out of the “dead scaffolding” bucket
- if no, plan its retirement separately from `triage.ts`

Acceptance:

- `clientOrchestratorV1` is classified as active, experimental, or decommission-candidate based on code + ops evidence

---

### Slice 7 — Remove dormant `traffic-cop-triage` only after reachability is truly severed

**Status:** complete (orchestrator decommission prep) — **delivered as retirement readiness audit + formal retention**, not removal. `legacyRoutingRetirementReadiness.ts`, `[triage.legacy_retirement_readiness]`, and `LEGACY_PRE_INGRESS_ROUTING_RETENTION_STATUS_SUMMARY` in `legacyRoutingCutoverGate.ts` make blockers explicit; unregister/delete remains **deferred** until prerequisites below are met.

Goal:

- de-register or delete [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts) only when:
  - no active path imports its old helpers
  - no live ingress emits `comms/web.received`
  - no external system still emits `comms/email.received`

Likely files:

- [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts)
- [inngest/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/index.ts)
- [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts) or its replacement path
- docs under `docs/v3/*RET*`

Acceptance:

- `traffic-cop-triage` is unregistered only after upstream emitters are gone or rerouted
- no live path can produce `comms/web.received` / `comms/email.received`

## Recommended execution order

1. Slice 1
2. Slice 2
3. Slice 3
4. Slice 6
5. Slice 4
6. Slice 5
7. Slice 7

## Best next slice

Start with **Slice 1**.

Reason:

- smallest safe coherence win
- directly removes active Gmail/thread imports from the old orchestrator gate file
- no deletion risk
- creates the clean seam the rest of the cleanup depends on

## What Vibecoder should not do

- Do not delete `_shared/orchestrator/` wholesale
- Do not unregister `triageFunction` yet
- Do not assume `ai/intent.*` is dead just because it did not show up in one day of runs
- Do not remove `clientOrchestratorV1` while `processIntakeExistingThread.ts` can still emit `ORCHESTRATOR_CLIENT_V1_EVENT`

## Current endpoint: cleanup complete, retirement deferred

The orchestrator **decommission-prep program** (Slices 1–7) ends in a **retained-not-removed** state, with **execution Slice A** applied:

- **Live / cleaned-up primary path:** Gmail delta → `inbox/thread.requires_triage.v1` → `processInboxThreadRequiresTriage.ts` (bounded flags, explicit post-ingest dispatch module, dispatch + intake + pre-ingress observability logs).
- **Pre-ingress web:** **`webhook-web` no longer emits `comms/web.received`** (410 `web_pre_ingress_retired`). **`triageFunction`** may still be registered for `comms/web.received` until a follow-up unregister/cleanup PR.
- **Pre-ingress email / WhatsApp:** **`triageFunction`** still consumes `comms/email.received` and WhatsApp ingress events.
- **Unsafe without an explicit ops/product PR:** hard delete of `triage.ts`, removal of `comms/*` triggers, or unregister of `triageFunction` while external `comms/email.received` producers are unproven.

**Explicit retirement blockers** (also in code: `legacyRoutingCutoverGate.ts`, `legacyRoutingRetirementReadiness.ts`):

1. `triageFunction` still registered (intentional).
2. ~~In-repo web emitter (`webhook-web`)~~ **Retired** — no longer emits `comms/web.received`.
3. `comms/email.received` — no in-repo emitter observed; **external emitters not ruled out** (**primary remaining pre-ingress blocker** for full triage retirement, aside from WhatsApp and explicit cutover).

**Next prerequisites for any future removal PR:** prove or retire external email ingress; unregister or narrow `triageFunction` triggers when safe; flip `LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA` only in the **same** change set as routing/unregister work (Step 12C/ops sign-off as applicable).

## Retirement execution — Slice A (web pre-ingress emitter)

- **Done:** `webhook-web` stopped emitting `comms/web.received`; responses are **410** with `web_pre_ingress_retired`.
- **Not in this slice:** `triage.ts` unregister, `comms/email.received`, Gmail/thread post-ingest.

## Retirement execution — Slice B (readiness + last blocker isolation)

- **Done:** `legacyRoutingRetirementReadiness` + `[triage.legacy_retirement_readiness]` use **`webEmitterPresentInRepo: false`**; remaining automated blockers are **`triage_function_still_registered`** and **`email_pre_ingress_external_emitter_not_ruled_out`** (no `web_pre_ingress_emitter_still_present`).
- **`legacyRoutingCutoverGate`:** comments + `LEGACY_PRE_INGRESS_ROUTING_RETENTION_STATUS_SUMMARY` updated to reflect web retired and **email external producer proof** as the primary unresolved pre-ingress question before any final delete/unregister PR.
- **Not in this slice:** unregister `triageFunction`, remove `comms/email.received`, routing changes.

## Source-of-truth files for this roadmap

- [processGmailDeltaSync.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processGmailDeltaSync.ts)
- [processInboxThreadRequiresTriage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)
- [processIntakeExistingThread.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processIntakeExistingThread.ts)
- [runMainPathEmailDispatch.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/runMainPathEmailDispatch.ts)
- [emailIngressClassification.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/emailIngressClassification.ts)
- [triageShadowOrchestratorClientV1Gate.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts)
- [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts)
- [clientOrchestratorV1.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/clientOrchestratorV1.ts)
- [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts)
- [inngest/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/index.ts)
