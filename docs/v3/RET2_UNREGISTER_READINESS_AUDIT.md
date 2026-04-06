# RET2 — Unregister-readiness audit (legacy `ai/intent.*` workers)

**Slice type:** Analysis only — **no workers removed** from [`supabase/functions/inngest/index.ts`](../../supabase/functions/inngest/index.ts). This document satisfies **RET2 planning** in [`V3_FULL_CUTOVER_PLAN.md`](V3_FULL_CUTOVER_PLAN.md) before any **RET2 execution** (actual unregister).

**Baseline:** CUT2 + CUT4–CUT8 **D1 execution** is implemented in `triage.ts` (explicit allow/deny for legacy specialist dispatch when the matching CUT live gate is off). **Global registrations unchanged.** Intake and downstream **`ai/intent.persona`** remain **out of scope** for specialist CUT parity; see [`INTAKE_MIGRATION_POST_CUT8_SLICE.md`](INTAKE_MIGRATION_POST_CUT8_SLICE.md).

**Related:** [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) (RET0 / triage inventory), [`PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md`](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md) (full Inngest roster + in-repo producers), [`RET1C_D1_CANDIDATE_SELECTION.md`](RET1C_D1_CANDIDATE_SELECTION.md) (evidence procedure), [`RET2_STATIC_UNREGISTER_RISK_AUDIT.md`](RET2_STATIC_UNREGISTER_RISK_AUDIT.md) (producer inventory + risk tiers, static only).

---

## 1. Inventory — `ai/intent.*` workers in `inngest/index.ts`

These are the registered workers whose **primary trigger** is a legacy client specialist or downstream persona event (subset of the full `functions: []` array).

| # | Import / variable | Trigger event | Module |
|---|-------------------|----------------|--------|
| 1 | `intakeFunction` | `ai/intent.intake` | `functions/intake.ts` |
| 2 | `conciergeFunction` | `ai/intent.concierge` | `functions/concierge.ts` |
| 3 | `logisticsFunction` | `ai/intent.logistics` | `functions/logistics.ts` |
| 4 | `commercialFunction` | `ai/intent.commercial` | `functions/commercial.ts` |
| 5 | `projectManagerFunction` | `ai/intent.project_management` | `functions/projectManager.ts` |
| 6 | `studioFunction` | `ai/intent.studio` | `functions/studio.ts` |
| 7 | `personaFunction` | `ai/intent.persona` | `functions/persona.ts` |

**Related but out of RET0 email/web `INTENT_EVENT_MAP` scope:**

| Variable | Trigger | Notes |
|----------|---------|--------|
| `internalConciergeFunction` | `ai/intent.internal_concierge` | Triage **WhatsApp** bypass (`comms/whatsapp.received` / operator legacy) — not dashboard web client intake. |

**Not legacy `ai/intent.*` (listed so they are not confused with unregister targets in this audit):** `triageFunction`, `outboundFunction`, `rewriteFunction`, `whatsappOrchestratorFunction`, `calendarRemindersFunction`, `contractFollowupFunction`, `prepPhaseFunction`, `postWeddingFunction`, `clientOrchestratorV1Function`, `operatorOrchestratorFunction`, `operatorEscalationDeliveryFunction`.

---

## 2. In-repo producers (who sends the event)

| Event | Primary producers (this repo) |
|-------|-------------------------------|
| `ai/intent.intake` | `triage.ts` (`dispatch-event` when `dispatch_intent === "intake"`). |
| `ai/intent.concierge` | `triage.ts` — main path legacy; web-widget fast path when CUT2 off + D1 allows. |
| `ai/intent.project_management` | `triage.ts` — main path when CUT5 off + D1 allows (known wedding). |
| `ai/intent.logistics` | `triage.ts` — main path when CUT6 off + D1 allows (known wedding). |
| `ai/intent.commercial` | `triage.ts` — main path when CUT7 off + D1 allows (known wedding). |
| `ai/intent.studio` | `triage.ts` — main path when CUT8 off + D1 allows (known wedding). |
| `ai/intent.persona` | **Not** sent by triage. **`intake.ts`**, **`concierge.ts`**, **`logistics.ts`** (`inngest.send`); QA simulators (`qa_sim_*.ts`). |

**Ambiguity (unchanged from Phase 2 D1 audit):** `comms/email.received` has **no** `inngest.send` in this repo — email ingress may be external. Do **not** infer “no triage” from repo alone. No `inngest.send` for specialist events was found **outside** `triage.ts` for the six specialist intents (concierge–studio); production could still inject events via Inngest Cloud or other deploys.

---

## 3. Classification buckets

### 3.1 Still required by supported **triage** paths (email + dashboard web)

| Worker / event | Why |
|----------------|-----|
| **`intake`** | Stage-gated cold lead / intake path; triage emits `ai/intent.intake` when routing chooses intake. |
| **`concierge`** | CUT2 (web widget) and CUT4 (main path) **off** + D1 **allow** → legacy `ai/intent.concierge`. |
| **`project_management`**, **`logistics`**, **`commercial`**, **`studio`** | Matching **CUT5–CUT8** off + D1 **allow** → legacy specialist event. |

**D1 note:** When a CUT is off and D1 **disallows** legacy, triage **does not** emit that specialist event (blocked status). That does **not** make the worker unregister-safe: rollback and “fail open” D1 defaults still imply **potential** legacy emissions whenever envs allow.

### 3.2 Still required by **non-triage** producers (in-repo)

| Worker / event | Producers |
|----------------|-----------|
| **`persona`** | Downstream of **`intake`**, **`concierge`**, **`logistics`** workers; QA sims. **Commercial / project_management / studio** workers in this repo do **not** send `ai/intent.persona` (they are leaf-style handlers for their intent). |

Unregistering **`personaFunction`** would break intake and specialist chains that still hand off to persona unless those sends are migrated first.

### 3.3 Rollback / historical / default-off CUT posture

With **CUT2 / CUT4–CUT8** env gates **off** (typical rollback), triage **relies on** legacy `ai/intent.*` for the corresponding intents. **Unregistering any specialist worker while those paths are supported would drop events on the floor.**

### 3.4 Likely **first** unregister candidates **later** (hypothesis — not approved)

Order of likely future review **after** sustained production evidence (RET1b rollup, gates default-on policy), **not** an instruction to unregister now:

1. **Specialist workers** (`commercial`, `studio`, `project_management`, `logistics`, `concierge`) — **if** triage never emits their event for the agreed window **and** orchestrator parity is proven **and** persona downstream is resolved for chains that need it. **Concierge** remains entangled with **persona** and **web-widget CUT2**.
2. **`intake`** — last among client ingress workers; depends on **intake migration** ([`INTAKE_MIGRATION_POST_CUT8_SLICE.md`](INTAKE_MIGRATION_POST_CUT8_SLICE.md)), not CUT4-style gates alone.
3. **`persona`** — typically **after** all producers (`intake`, `concierge`, `logistics`, QA) no longer need it or are migrated.

**No worker in §3.4 is unregister-ready from repository evidence alone.**

---

## 4. Unregister-readiness criteria (per worker)

Use **all** of the following before removing a worker from `index.ts`:

| Criterion | Question |
|-----------|----------|
| **P1 — Triage** | Does `triage` **ever** emit this event for **supported** email/web paths you still maintain? If **yes** → **not ready**. |
| **P2 — Other producers** | Do **intake**, **specialists**, **webhooks**, **QA**, or **external** systems still send this event? If **yes** → **not ready**. |
| **P3 — Downstream** | Will removing the worker break a **required** chain (e.g. **`persona`** after intake/concierge/logistics)? If **yes** → **not ready** until chain is migrated. |
| **P4 — Rollback** | Can you still roll back CUT gates without this worker? If **no** → **not ready**. |
| **P5 — Evidence** | Do production logs (RET1) show **~0** dispatches for this event for the agreed window, with ops sign-off? If **no** → **not ready**. |

---

## 5. Worker-by-worker status (this audit)

| Worker | Event | Unregister-ready? | Blockers (summary) |
|--------|-------|-------------------|---------------------|
| `intakeFunction` | `ai/intent.intake` | **No** | Triage emits for intake path; post-bootstrap orchestrator optional **inside** intake; persona handoff. |
| `conciergeFunction` | `ai/intent.concierge` | **No** | CUT2 + CUT4 paths; legacy when gates off + D1 allow; emits **persona**. |
| `logisticsFunction` | `ai/intent.logistics` | **No** | CUT6; legacy path; emits **persona**. |
| `commercialFunction` | `ai/intent.commercial` | **No** | CUT7; triage legacy path; no persona in-repo from this worker — still triage + rollback. |
| `projectManagerFunction` | `ai/intent.project_management` | **No** | CUT5; triage legacy path. |
| `studioFunction` | `ai/intent.studio` | **No** | CUT8; triage legacy path. |
| `personaFunction` | `ai/intent.persona` | **No** | Intake + concierge + logistics + QA; not triage-direct. |

**Unequivocally dead from all supported producers (in-repo):** **none** — consistent with [`PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md`](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md) §3.2.

---

## 6. Evidence still missing before **actual** unregister

1. **Production RET1 exports** — time-bounded counts of `downstream_inngest_event` / `lane` for each legacy event (not only triage returns if events are injected elsewhere).
2. **Declared env posture** — whether CUT2 / CUT4–CUT8 are **default-on** in production (reduces legacy volume; does not alone justify unregister).
3. **External / manual Inngest sends** — confirmation that no ops or tooling emits `ai/intent.*` outside triage.
4. **Intake + persona migration state** — explicit go/no-go for retiring **`intake`** or **`persona`** per intake migration doc.
5. **WhatsApp / operator** — `internal_concierge` and other lanes remain separate; do not unregister client specialists based on email/web work alone without checking those graphs.

---

## 7. Slice outcome

- **Unregister-readiness audit:** documented (this file).
- **Code change:** none required for audit-only slice; **`inngest/index.ts`** unchanged except cross-reference comment if present.
- **Pilot candidate selection:** [`RET2_PILOT_CANDIDATE_SELECTION.md`](RET2_PILOT_CANDIDATE_SELECTION.md) — production export runbook, **one** pilot decision rule (studio / commercial / PM preferred over concierge/logistics for persona blast-radius), **RET2 execution** checklist. **No named candidate** until a real RET1 rollup exists.
- **Next RET2 execution slice (suggested):** after a production rollup names a pilot per that doc — **pilot unregister** for that single worker with staging validation and rollback; **or** defer until intake/persona milestones. Do **not** batch-remove multiple legacy workers without per-worker proof.

---

## 8. Revision

| Date | Note |
|------|------|
| 2026-04-06 | Initial RET2 unregister-readiness audit post CUT2 + CUT4–CUT8 D1 execution. |
