# Intake migration — planning slice (post CUT8)

## Purpose

After **CUT2 / CUT4–CUT8**, known-wedding specialist traffic (email and dashboard **web** widget contexts) can route to `ai/orchestrator.client.v1` behind env gates. **Client intake** (new leads) remains on **`ai/intent.intake`** by design in this phase — and **intake migration scope is email only**; dashboard web chat is **not** client intake (see §0).

This document records **what legacy intake actually does**, how that differs from **`clientOrchestratorV1`**, what **blocks** a straight “CUT9 intake” swap, and what **smallest next slices** are plausible without pretending intake is just another specialist intent.

**Out of scope here:** WhatsApp operator lane, worker removal.

---

## 0. Product scope (corrected)

- **Client intake** = **email** inbound new leads. **Web is not a client-intake channel** in this product: the **web widget** is for **photographers on the dashboard** talking to **Ana** (AI manager), analogous to the operator lane — not end clients filing new inquiries.
- **`reply_channel === "web"`** may still appear on **`ai/intent.intake`** events when triage’s ingress shape carries it; that does **not** make “web intake” a migration target. **Live intake cutover after bootstrap is scoped to email** (`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1`).
- **Next major intake-adjacent migration target** after live email intake is **unfiled / unresolved matching** — not a “web intake” slice.

---

## 1. What the legacy intake path does today

Source: `supabase/functions/inngest/functions/intake.ts`, `createIntakeLeadRecords.ts`, `linkOriginThreadToIntakeWedding.ts`.

1. **Agentic extraction + calendar research**  
   - OpenAI tool loop with **`check_calendar_availability`** (up to several rounds).  
   - Produces structured fields: `couple_names`, `wedding_date`, `location`, `budget`, `story_notes`, **`raw_facts`**.

2. **CRM bootstrap (writes)**  
   - **`createIntakeLeadRecords`**: inserts **`weddings`** (stage `inquiry`), **`clients`**, **`threads`** (“Initial Inquiry”), **`messages`** (inbound copy).  
   - This is a **new-lead creation** path, not “reply on an existing wedding” only.

3. **Origin thread linkage**  
   - If triage already created a thread (`thread_id` on the intake event), **`linkOriginThreadToIntakeWedding`** associates that origin thread with the new wedding.

4. **Downstream handoff**  
   - Emits **`ai/intent.persona`** with **`raw_facts`** for brand-voice drafting (separate worker).

**Triage’s role:** For `intent === "intake"`, triage persists a **thread + inbound message** (possibly **without** `wedding_id`), then dispatches **`ai/intent.intake`** with `photographer_id`, optional `wedding_id`, `thread_id`, `raw_message`, `sender_email`, `reply_channel` (`email` for client email ingress; `web` only reflects **dashboard web** ingress shape — **not** “client web intake” as a product lane). Intake worker then performs the extraction + **additional** DB rows and handoff. **Shadow orchestrator is explicitly skipped for intake** (`shadow_orchestrator` → `skipped_intake`).

---

## 2. What `clientOrchestratorV1` does today

Source: `clientOrchestratorV1.ts`, `clientOrchestratorV1Core.ts`, `buildDecisionContext.ts`.

- Assumes **resolved tenant** `photographerId` and typically **thread-scoped** work.  
- Builds **decision context** (playbook, audience, memories, drafts summary).  
- **Proposes** candidate actions → **verifier** → optional **`drafts`** insert and/or **escalation** artifact under **`draft_only` / `auto` / etc.**  
- Does **not** implement: multi-round **calendar extraction**, **`createIntakeLeadRecords`**, **`linkOriginThreadToIntakeWedding`**, or **`ai/intent.persona`** handoff.

So the orchestrator is a **reply / approval / escalation** engine on existing CRM context, not a **greenfield lead factory** matching the current intake worker contract.

---

## 3. Gap summary (why intake ≠ CUT4–CUT8)

| Concern | Legacy intake | Orchestrator today |
|--------|----------------|-------------------|
| Calendar tool loop | Yes | No |
| Structured extraction JSON | Yes | No |
| Create wedding + client + lead thread | Yes | No |
| Link triage origin thread → new wedding | Yes | No |
| Persona handoff | Yes (`ai/intent.persona`) | No |
| Draft / verifier / escalation | Indirect (via persona) | Yes (core) |

**Conclusion:** Replacing **`ai/intent.intake`** with **`ai/orchestrator.client.v1` alone** would drop **lead creation, calendar research, and persona handoff** unless those are reimplemented or chained explicitly.

---

## 4. Chosen slice for this phase: Option A (planning + tiny observability)

- **No** env-gated live orchestrator branch for intake in this slice (**Option B deferred**).  
- **Yes** bounded documentation (this file).  
- **Yes** one small **runtime** addition: triage return includes an explicit **`intake_legacy_dispatch`** marker when dispatch is intake (see `triage.ts`) so Inngest/ops traces can filter intake turns without inferring from absence of CUT fields.

Rollback: remove or ignore the field; behavior unchanged.

---

## 5. What still blocks “full” intake replacement

1. **Product/contract:** Single event must define whether V3 owns extraction + CRM inserts + reply, or a **pipeline** (orchestrator after resolver).  
2. **Parity:** No B3-style shadow for intake today; need harness comparing **legacy intake output** vs any future orchestrator-led path.  
3. **Data model:** Duplicate thread story (triage thread vs “Initial Inquiry” thread from resolver) must stay coherent when migrating.  
4. **Persona:** Either orchestrator subsumes persona behavior or handoff remains explicit.  
5. **Safety:** New leads are high-risk; gates and observation must match or exceed CUT3-style evidence before live cutover.

---

## 6. Recommended next slices (ordered)

1. **Intake architecture decision** — document target end state: “orchestrator-first after records exist” vs “single mega-worker” vs “intake service + events.”  
2. **Resolver + orchestrator boundary** — if CRM creation stays in a small module, define a **single** place that creates `weddings`/`clients`/threads so orchestrator only handles **post-create** reply (narrower parity surface).  
3. **Optional shadow or replay** — **observation-only** path for a **subset** (e.g. intake after wedding exists) **only when** `wedding_id` is non-null and behavior matches a known-wedding path; **do not** claim parity for greenfield leads until (1)–(2) are settled.  
4. **Unfiled / unresolved matching** — **next major migration target** after live email intake; see **`docs/v3/UNFILED_UNRESOLVED_MATCHING_SLICE.md`** (stage gate vs matchmaker, observability). **Not** “web client intake.”

---

## 7. Shared intake bootstrap boundary (post–planning implementation)

**Location:** `supabase/functions/_shared/intake/`

| Module | Role |
|--------|------|
| `intakeBootstrapTypes.ts` | Stable types: `IntakeStructuredExtraction`, `IntakeLeadCreationInput`, `IntakeBootstrapBoundaryOutput`, etc. |
| `intakeExtraction.ts` | `runIntakeExtractionAndResearch(rawMessage)` — OpenAI + calendar tool loop (legacy behavior preserved). |
| `intakeBootstrapBoundary.ts` | `applyIntakeLeadCreation` → `createIntakeLeadRecords`; `applyIntakeOriginThreadLink` → `linkOriginThreadToIntakeWedding`; optional `runIntakeBootstrapBoundary` (full chain for tests / future wiring). |

Legacy `inngest/functions/intake.ts` calls these helpers; default after bootstrap is still **`ai/intent.persona`** unless a narrow live gate applies (below).

**Implemented (post-bootstrap parity slice):** When `INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1=1`, after bootstrap the intake worker emits **`ai/orchestrator.client.v1`** with `requestedExecutionMode: "draft_only"` (for the same proposal/verifier/outcome mapping as before) and correlation fields `intakeParityCorrelationId` + `intakeParityFanoutSource: "intake_post_bootstrap_parity"`. **`clientOrchestratorV1`** detects that fanout source and **does not** run `attemptOrchestratorDraft` or escalation artifact creation — **no** `pending_approval` draft rows and **no** escalation artifacts from this path. **`ai/intent.persona`** is still emitted unchanged and remains the **authoritative** live reply path. Logs: **`[orchestrator.intake.post_bootstrap.parity]`**; function return field **`intake_post_bootstrap_parity_observation`** (draft/escalation skip reason: `intake_post_bootstrap_parity_observation_only`). WhatsApp intake skips this send (orchestrator is email/web only). Rollback: unset the env var.

**Parity is skipped when live email cutover runs** (same turn) to avoid duplicate orchestrator sends.

**Implemented (narrow live post-bootstrap email slice — client intake target):** When `INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1=1` **and** `reply_channel === "email"` (explicit), after bootstrap the intake worker emits **`ai/orchestrator.client.v1`** with `intakeLiveCorrelationId` + `intakeLiveFanoutSource: "intake_post_bootstrap_live_email"`, **`draft_only`**, full draft/escalation path — **no** `ai/intent.persona` that turn. Logs: **`[orchestrator.intake.post_bootstrap.live_email]`**; return field **`intake_post_bootstrap_live_email_observation`**. WhatsApp and non-explicit reply channels keep legacy persona (+ optional parity). Rollback: unset the env var.

**Non-product / legacy hook (`reply_channel === "web"`):** The repo may still contain orchestration hooks keyed off **`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_WEB_V1`** and `intake_post_bootstrap_live_web` for **event-shape / parity** reasons. These are **not** “client web intake” and are **not** a planned migration slice — **dashboard web** is photographer ↔ Ana, not client lead intake. Prefer leaving the gate **off**; do not extend “web intake” as a roadmap item.

**Next (broader migration):** **Unfiled / unresolved matching** is the next major target after live email intake is stable — not web client intake. Separately: persona/orchestrator convergence, duplicate draft UX, and triage/tuning as needed.

---

## 8. Reference

- `docs/v3/V3_FULL_CUTOVER_PLAN.md` — activation order; client intake scope is **email**; dashboard web is not client intake.  
- `supabase/functions/inngest/functions/triage.ts` — intake dispatch and shadow skip.  
- `supabase/functions/inngest/functions/intake.ts` — legacy intake worker (uses shared bootstrap boundary).
