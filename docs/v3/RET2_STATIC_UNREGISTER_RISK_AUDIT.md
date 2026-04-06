# RET2 — Static + recent-run unregister-risk audit (`ai/intent.*`)

**Slice type:** Repository analysis only — **no unregister**, **no routing changes**. Does **not** claim “safe to unregister” from traffic absence.

**Inngest dashboard:** This audit has **no** access to your Inngest Cloud run history. **§4** is explicit. Any “recently seen” claim requires **your** dashboard or RET1 exports.

**Related:** [`RET2_UNREGISTER_READINESS_AUDIT.md`](RET2_UNREGISTER_READINESS_AUDIT.md), [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md), [`inngest/index.ts`](../../supabase/functions/inngest/index.ts).

---

## 1. Worker inventory (`inngest/index.ts` `functions[]`)

### 1.1 Legacy `ai/intent.*` (this audit’s focus)

| Worker module | Trigger event |
|---------------|----------------|
| `intakeFunction` | `ai/intent.intake` |
| `conciergeFunction` | `ai/intent.concierge` |
| `projectManagerFunction` | `ai/intent.project_management` |
| `logisticsFunction` | `ai/intent.logistics` |
| `commercialFunction` | `ai/intent.commercial` |
| `studioFunction` | `ai/intent.studio` |
| `personaFunction` | `ai/intent.persona` |

### 1.2 Other `ai/intent.*` registration

| Worker module | Trigger event |
|---------------|----------------|
| `internalConciergeFunction` | `ai/intent.internal_concierge` |

### 1.3 Registered but **not** `ai/intent.*`

`triageFunction`, `outboundFunction`, `rewriteFunction`, `whatsappOrchestratorFunction`, `calendarRemindersFunction`, `contractFollowupFunction`, `prepPhaseFunction`, `postWeddingFunction`, `clientOrchestratorV1Function`, `operatorOrchestratorFunction`, `operatorEscalationDeliveryFunction` — out of scope for this `ai/intent.*` table.

---

## 2. In-repo producers (by event)

Method: ripgrep for `name: "ai/intent.…"` / `event: "ai/intent.…"` and `inngest.send` paths in `supabase/functions` + `scripts`.

| Event | Triage (`triage.ts`) | Non-triage in-repo |
|-------|----------------------|----------------------|
| `ai/intent.intake` | **Yes** — `dispatch-event` when `INTENT_EVENT_MAP` resolves to intake | None |
| `ai/intent.concierge` | **Yes** — main path legacy; web-widget fast path (`ai/intent.concierge`); CUT2/4 live uses orchestrator instead | None |
| `ai/intent.project_management` | **Yes** — legacy dispatch via map when CUT5 off + D1 allows | None |
| `ai/intent.logistics` | **Yes** — same (CUT6) | None |
| `ai/intent.commercial` | **Yes** — same (CUT7) | None |
| `ai/intent.studio` | **Yes** — same (CUT8) | None |
| `ai/intent.persona` | **No** — triage does not send | **`intake.ts`**, **`concierge.ts`**, **`logistics.ts`** (`inngest.send`); **`qa_sim_10_turns.ts`**, **`qa_sim_15_turns.ts`**, **`qa_sim_conversation.ts`** |
| `ai/intent.internal_concierge` | **Yes** — WhatsApp / operator legacy branch sends only this (not email `INTENT_EVENT_MAP`) | None |

**Ambiguity (unchanged):** Events may also be injected **outside** this repo (manual Inngest send, other services). **No** in-repo producer means “no `inngest.send` to this event name found here,” not “unused in production.”

---

## 3. Classification

| Worker | Still produced by triage (email/web / widget paths)? | Produced by non-triage in-repo? | In-repo “registration-only”? |
|--------|------------------------------------------------------|----------------------------------|------------------------------|
| **intake** | Yes | No (only triage → intake) | No |
| **concierge** | Yes | No | No |
| **project_management** | Yes | No | No |
| **logistics** | Yes | No | No |
| **commercial** | Yes | No | No |
| **studio** | Yes | No | No |
| **persona** | No (triage never emits) | Yes — intake, concierge, logistics, QA sims | No — multiple producers |
| **internal_concierge** | Yes (WhatsApp branches only, not email map) | No | No |

**Workers with no in-repo producer besides the triage graph:** **None** of the seven email/web specialists + intake — **triage** is the sole in-repo sender for those events. **Persona** and **internal_concierge** have additional producers or different triage branches as above.

---

## 4. Visible recent Inngest runs

**Not available in this audit.** To label “recently exercised” vs “not seen,” use:

- Inngest Cloud → **Functions** → per-worker id (e.g. `commercial-worker`, `traffic-cop-triage`), or  
- RET1 log exports + rollup, or  
- Edge logs filtered by function name.

**Do not** infer production volume from repo silence.

---

## 5. Risk-ranked unregister list (qualitative)

**Interpretation:** “Highest risk” = **worst** candidate to unregister first (most blast radius / dependencies). This is **not** an instruction to remove anything.

| Tier | Risk if unregistered **now** (conceptual) | Workers |
|------|---------------------------------------------|--------|
| **Highest** | Breaks lead pipeline, persona chain, or broad client traffic; rollback story depends on legacy | **`persona`** (downstream of multiple workers); **`intake`** (cold path + bootstrap); **`concierge`** (CUT2 + CUT4 + volume + **persona** downstream) |
| **Medium** | Still triage-driven specialist + **persona** handoff | **`logistics`** (emits `ai/intent.persona` in-repo); **`internal_concierge`** (separate WhatsApp lane; do not mix with email-web retirement) |
| **Lower (still not “safe”)** | Triage still emits when CUT off; **no** `persona` send from worker file | **`commercial`**, **`projectManager`**, **`studio`** — align with [`RET2_PILOT_CANDIDATE_SELECTION.md`](RET2_PILOT_CANDIDATE_SELECTION.md) persona-blast-radius ordering for **hypothetical** future pilot **only after** evidence |

**Rule:** Lack of recent runs does **not** lower risk while rollback and triage still allow legacy sends.

---

## 6. Most likely first pilot **later** (not a go-ahead)

Same as RET2 pilot doc: among **`studio` / `commercial` / `project_management`**, only after **production** RET1 (or equivalent) shows **zero** legacy need **and** ops acceptance — **not** from static analysis alone.

---

## 7. Evidence missing before actual unregister

1. Time-bounded **production** dispatch counts per event (RET1 or Inngest metrics).  
2. Confirmation **no external** producers depend on the worker.  
3. **Persona / intake** migration stance for any chain that still feeds **`persona`**.  
4. **Declared CUT** env posture (rollback).  
5. **Post-unregister** monitoring and rollback runbook.

---

## 8. Revision

| Date | Note |
|------|------|
| 2026-04-06 | Initial static producer inventory + risk tiers; no dashboard access. |
