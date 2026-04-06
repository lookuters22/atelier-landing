# RET2 — Pilot unregister candidate selection (production evidence)

**Slice type:** Evidence review + **runbook** — **no worker unregistration**, **no routing changes**.

**Baseline:** [`RET2_UNREGISTER_READINESS_AUDIT.md`](RET2_UNREGISTER_READINESS_AUDIT.md) (inventory + not-ready default). Rollup tool: [`scripts/ret1_dispatch_metrics_rollup.mjs`](../../scripts/ret1_dispatch_metrics_rollup.mjs).

---

## 1. Production evidence in this workspace

| Artifact | Role |
|----------|------|
| **`scripts/fixtures/ret1_sample_export.log`** | **Synthetic** sample (header comment in file) for script smoke tests — **not** production traffic. **Do not** use it to name a production pilot. |
| **`reports/ret1-export-*.log`** (suggested path) | Production exports: use [`reports/README.md`](../../reports/README.md). **Still none committed** — see **§1.1** below. |

**Conclusion (initial):** **No real production RET1 export** was available in the workspace for this slice. **No named pilot worker** is selected from evidence here. Sections **3–4** give the **runbook** and **decision rule** to select **exactly one** pilot after a real export exists.

### 1.1 Evidence capture attempt (automated workspace — 2026-04-06)

- **Supabase CLI:** not available in this environment; production log API/dashboard not reachable from the agent.
- **Workspace search:** no `reports/ret1-export-prod-*.log` (or any `*.log` under `reports/`) present before this update.
- **Rollup on production:** **not run** — no input file.
- **Pilot candidate from real data:** **none** — preconditions in §4.1 cannot be verified without an export.

**Additional evidence needed:** A **7–14 day** production (or clearly labeled staging) text export of lines containing `[triage.retirement_dispatch_v1]`, saved as `reports/ret1-export-prod-YYYYMMDD.log`, then rollup applied locally. Re-evaluate §4.1–§4.3; prefer **“no candidate yet”** if any legacy specialist counts remain **> 0** for `studio` / `commercial` / `project_management` or orchestrator replacement rows are absent.

---

## 2. Runbook — produce evidence

1. **Window:** e.g. 7–14 days of production (or staging if that is your only observable environment — label clearly).
2. **Source:** Supabase Edge / Inngest logs where `triage` runs; filter messages containing **`[triage.retirement_dispatch_v1]`** (same JSON as `retirement_dispatch_observability_v1` per [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) §5).
3. **Save:** one plain-text file, one log line per record acceptable; e.g. `reports/ret1-export-prod-YYYYMMDD.log` (add `reports/` to `.gitignore` locally if needed — do not commit PII-heavy raw logs).
4. **Rollup:**

   ```bash
   node scripts/ret1_dispatch_metrics_rollup.mjs reports/ret1-export-prod-20260406.log
   ```

   **PowerShell:**

   ```powershell
   Get-Content .\reports\ret1-export-prod-20260406.log | node .\scripts\ret1_dispatch_metrics_rollup.mjs
   ```

5. **Record** for the decision: table **legacy downstream (ai/intent.* only)**, **orchestrator live traffic by branch_code**, **lane** totals, and your **declared env posture** for the window (CUT2 / CUT4–CUT8 default-on vs rollback).

---

## 3. Scope boundaries (explicit)

| Area | Pilot selection |
|------|-----------------|
| **Email + dashboard web triage** | In scope — RET1 rows from `triage` for `path_family` `main_path_email_web` / `web_widget_known_wedding`. |
| **`ai/intent.intake` → `intakeFunction`** | **Out of scope** for a **first** specialist pilot — separate intake migration; do not pick as RET2 pilot unless a dedicated intake retirement slice approves it. |
| **`ai/intent.persona` → `personaFunction`** | **Out of scope** — not emitted by triage; downstream of intake/concierge/logistics (and QA). **Never** first pilot for “specialist CUT” story alone. |
| **`ai/intent.internal_concierge`** | **Out of scope** — WhatsApp / operator bypass in `triage`; not the RET0 email/web `INTENT_EVENT_MAP` specialist list. Do not conflate with dashboard web widget. |

---

## 4. Decision rule — exactly **one** pilot specialist worker

Apply **after** rollup on a **real** export (not the synthetic fixture).

**Goal:** Safest **narrow** first step: one legacy specialist worker whose mistaken unregister would **not** immediately break **persona** chains from that worker and whose **legacy** triage volume is **gone** under agreed policy.

### 4.1 Preconditions (all must be true or pilot is **not** selected)

1. **Zero ambiguity:** Confirm no **out-of-band** `inngest.send` for the candidate event in production (manual replays, old scripts). In-repo, only `triage` sends specialist `ai/intent.*` except persona chain — re-validate for your deploy.
2. **Legacy volume:** In the rollup, **`legacy downstream (ai/intent.* only)`** count for the candidate **`downstream_inngest_event`** is **zero** for the window (or ops-approved explicit threshold, documented).
3. **Replacement path:** For the same window, **orchestrator live** rows exist for the matching **`branch_code`** (e.g. `CUT8_MAIN_STUDIO`) **or** policy explicitly commits to **default-on** CUT for that intent so rollback is not required for that tenant class.
4. **Rollback:** Ops acknowledges that unregistering **removes** rollback for that event — **frozen** until re-register or env change.

### 4.2 Persona blast-radius (ordering for *eligible* specialists only)

In-repo, **`concierge.ts`** and **`logistics.ts`** emit **`ai/intent.persona`** after their work. **`commercial.ts`**, **`projectManager.ts`**, **`studio.ts`** do **not** send persona in this repository.

Therefore, **first pilot** should **not** be **`conciergeFunction`** or **`logisticsFunction`** unless no `commercial` / `project_management` / `studio` candidate meets §4.1 — **concierge/logistics are higher blast-radius** for a first unregister experiment.

### 4.3 Deterministic selection (single pilot)

Among **`ai/intent.commercial`**, **`ai/intent.project_management`**, **`ai/intent.studio`**:

1. Keep only events that satisfy **§4.1**.
2. If **more than one** remains, pick **one** using this **fixed order** (narrower product surface first): **`studio`** → **`commercial`** → **`project_management`** (rationale: post-wedding studio is stage-narrow; tie-break is explicit, not volume-chasing).
3. If **none** of the three qualify, **do not** force a pilot — extend the window or adjust gates/policy; **do not** default to concierge without persona migration plan.

**Output of this rule:** At most **one** worker (`studioFunction` **or** `commercialFunction` **or** `projectManagerFunction`) for RET2 execution, or **none**.

---

## 5. Why this is the safest first RET2 execution target (when one exists)

- **Narrow chain:** No **persona** handoff from commercial / PM / studio workers in-repo → fewer cascading failures than concierge or logistics.
- **Triage-only producer** for those intents (in-repo) → evidence from RET1 aligns with “can we drop the listener.”
- **Single pilot** → one rollback story, one monitoring dashboard, one runbook.

---

## 6. Next slice — RET2 pilot **execution** (not this document)

1. **Name** the pilot from **§4** using a **production** rollup + ops sign-off.
2. **Staging:** Unregister **only** that worker import + `functions[]` entry in a **non-prod** Inngest sync; verify no expected events fire.
3. **Production:** Time-boxed unregister; alarms on dropped events / dead-letter; **rollback = re-register** + redeploy.
4. **Do not** remove **`personaFunction`**, **`intakeFunction`**, or WhatsApp workers in the same slice.

---

## 7. Revision

| Date | Note |
|------|------|
| 2026-04-06 | Initial slice: no production export in workspace; runbook + deterministic pilot rule; no named candidate. |
| 2026-04-06 | Evidence capture: `reports/` + README; production export still unavailable from agent; no pilot; need real log window. |
