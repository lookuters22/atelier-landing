# Phase 2 Slice D1 — Retirement prep audit (conservative)

> **Historical snapshot:** Produced before **pre-ingress `triage.ts` retirement**. Row 1 below (**`triage.ts` triggers**) is **obsolete**; live email uses **`inbox/thread.requires_triage.v1`** + **`legacyWhatsappIngress.ts`** for operator WhatsApp legacy only.

**Slice type:** Analysis / prep only — **no workers unregistered, no files deleted** (no D2/D3 in this slice).

**Date / baseline:** Live email/web specialist chain remains `ai/intent.*` via **post-ingest** routing; `ai/orchestrator.client.v1` is QA/shadow-capable only.

**Method:** Trace **in-repo** `inngest.send` producers and Edge webhook entrypoints to registered workers in `supabase/functions/inngest/index.ts`. Events with **no** producer in this repository are treated as **ambiguous** (may be external systems, other deploys, or manual Inngest sends) — **do not retire** listeners on that basis alone.

---

## 1. Registered Inngest functions (examined)

| # | Worker module | Trigger event(s) |
|---|----------------|-------------------|
| 1 | ~~`triage.ts`~~ **`legacyWhatsappIngress.ts`** (retirement update) | ~~pre-ingress comms~~ — **`comms/whatsapp.received`, `operator/whatsapp.legacy.received` only** |
| 2 | `intake.ts` | `ai/intent.intake` |
| 3 | `outbound.ts` | `approval/draft.approved` |
| 4 | `rewrite.ts` | `ai/draft.rewrite_requested` |
| 5 | `concierge.ts` | `ai/intent.concierge` |
| 6 | `logistics.ts` | `ai/intent.logistics` |
| 7 | `commercial.ts` | `ai/intent.commercial` |
| 8 | `projectManager.ts` | `ai/intent.project_management` |
| 9 | `studio.ts` | `ai/intent.studio` |
| 10 | `persona.ts` | `ai/intent.persona` |
| 11 | `internalConcierge.ts` | `ai/intent.internal_concierge` |
| 12 | `whatsappOrchestrator.ts` | `comms/whatsapp.received.v2`, `client/whatsapp.inbound.v1` |
| 13 | `calendarReminders.ts` | `calendar/event.booked` |
| 14 | `milestoneFollowups.ts` | `crm/stage.updated` |
| 15 | `prepPhaseFollowups.ts` | `crm/stage.updated` |
| 16 | `postWeddingFlow.ts` | `crm/stage.updated` |
| 17 | `clientOrchestratorV1.ts` | `ai/orchestrator.client.v1` |
| 18 | `operatorOrchestrator.ts` | `operator/whatsapp.inbound.v1` |
| 19 | `operatorEscalationDelivery.ts` | `operator/escalation.pending_delivery.v1` |

---

## 2. In-repo producers (by event)

| Event | Producers in this repo |
|-------|-------------------------|
| `comms/web.received` | `webhook-web/index.ts` |
| `comms/email.received` | **None found** — likely external (e.g. email ingress not present in `supabase/functions` config) |
| `comms/whatsapp.received` | **None found** — triage still subscribes; treat as **ambiguous / possibly external** |
| `operator/whatsapp.legacy.received` | **None found** — triage subscribes; **ambiguous** |
| `ai/intent.*` (specialists + intake) | `triage.ts` (dispatch), web widget fast-path (`ai/intent.concierge`) |
| `ai/intent.persona` | `concierge.ts`, `logistics.ts`, `intake.ts`; QA sims (`qa_sim_*.ts`) |
| `approval/draft.approved` | `webhook-approval/index.ts`, `api-resolve-draft/index.ts` |
| `ai/draft.rewrite_requested` | `api-resolve-draft/index.ts` |
| `crm/stage.updated` | `_shared/tools/crmTool.ts`; `qa_runner.ts` |
| `calendar/event.booked` | `_shared/tools/calendarAgent.ts`; `qa_runner.ts` |
| `operator/whatsapp.inbound.v1` | `webhook-whatsapp/index.ts` |
| `operator/escalation.pending_delivery.v1` | `_shared/operatorDataTools.ts` |
| `ai/orchestrator.client.v1` | `triage.ts` (shadow, env-gated); `qa_runner` / orchestrator replay paths |

**Note:** `whatsappOrchestrator` events (`comms/whatsapp.received.v2`, `client/whatsapp.inbound.v1`) have **no** `inngest.send` in this repo; `qa_runner` explicitly does **not** send them. **Ambiguous** — may be future/mobile/legacy producer outside repo.

---

## 3. Classification for retirement

### 3.1 Definitely still live / must stay (repo evidence)

- **Full specialist + intake chain** driven by `triage` + web widget path — **keep all** `ai/intent.*` workers and `triage`.
- **Persona** downstream of specialists and intake — **keep** `persona`.
- **Outbound / rewrite** — **keep** (`webhook-approval`, `api-resolve-draft`).
- **CRM / calendar follow-ups** — **keep** `milestoneFollowups`, `prepPhaseFollowups`, `postWeddingFlow`, `calendarReminders` (producers present).
- **Operator lane** — **keep** `operatorOrchestrator`, `operatorEscalationDelivery`, `webhook-whatsapp` path.
- **clientOrchestratorV1** — **keep** (shadow + QA; not live replacement).

### 3.2 Proven dead → safe for D2 (none from this audit)

No registered worker could be shown **unused** with **only** repository evidence. Gaps (email ingress, legacy WhatsApp event names, client WhatsApp v1) are **unverified in production**, not proven dead.

### 3.3 Ambiguous — **keep** until production ingress is mapped

- `comms/email.received` (no local producer; triage must remain if email is live anywhere).
- `comms/whatsapp.received`, `operator/whatsapp.legacy.received` (no local producers).
- `whatsappOrchestrator` trigger events (no local producers).
- **Replay/QA:** `qa_runner` and sim scripts depend on persona and orchestrator paths — **do not** remove for “cleanup” without explicit replacement coverage.

---

## 4. Schema-only events (not separate registered workers)

`ai/draft.generate_requested` and `approval/draft.submitted` appear in `AtelierEvents` in `_shared/inngest.ts` but **no** `createFunction` in `index.ts` subscribes to them in this repo — document in ARCHITECTURE/UI context; **not** a D1 worker removal decision.

---

## 5. Slice outcome

- **D1 retirement prep:** complete (audit documented).
- **D2/D3:** **deferred** — no worker meets “unquestionably dead and unreferenced” within this repository.

**Before any future removal:** confirm production Inngest sources (email provider, any legacy WhatsApp bridges), runbooks, and B3/orchestrator cutover plans so ingress is not accidentally severed.
