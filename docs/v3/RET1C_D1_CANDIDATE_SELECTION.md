# RET1c — Real evidence capture and first D1 candidate selection

> **Historical / superseded (Slice 9):** RET1 **`[triage.retirement_dispatch_v1]`** telemetry was **never wired** to post-ingest routing; the implementation file was **removed** without replacement. Treat this doc as **planning archive** and **do not** expect current production to emit the marker. Rollup script + fixtures remain usable only on **old** log exports, if any.

**Slice type:** Evidence and planning only — **no worker unregistration, no routing changes.**

**Related:** [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) §5 (historical spec), [`POST_V3_CLEANUP_PHASE2_ROADMAP.md`](POST_V3_CLEANUP_PHASE2_ROADMAP.md) workstream D, [`scripts/ret1_dispatch_metrics_rollup.mjs`](../../scripts/ret1_dispatch_metrics_rollup.mjs).

---

## 1. Real log evidence in this repository (baseline for this slice)

| Item | Status |
|------|--------|
| Production / staging Edge log export containing `[triage.retirement_dispatch_v1]` | **Not applicable** to current runtime (telemetry removed — Slice 9); **not present** in workspace at RET1c authoring time |
| Synthetic sample usable for script smoke tests | [`scripts/fixtures/ret1_sample_export.log`](../../scripts/fixtures/ret1_sample_export.log) |

**Conclusion:** RET1 rollup numbers below are **not** from production. Section 2 is the procedure to produce a real window; section 4 is a **fill-in template** after you run the rollup on that export.

---

## 2. Procedure — produce a real log window

1. **Pick a window** (e.g. last 7 or 14 days) that matches how you evaluate “supported production” behavior (avoid one-off incidents unless labeled).

2. **Collect logs (archived / pre-retirement only):** RET1 markers were designed for the **removed** pre-ingress `triage` worker. If you have **historical** exports, search message text **`triage.retirement_dispatch_v1`**. **Current** post-ingest workers **do not** emit this prefix.

3. **Save as plain text** (one line per log line is fine; extra metadata columns are OK if each line still contains the marker + JSON).

   Suggested local path (do not commit secrets or PII-heavy raw logs unless policy allows):

   `reports/ret1-export-<env>-<YYYYMMDD>.log`

4. **Run the RET1b rollup** from the repo root:

   ```bash
   node scripts/ret1_dispatch_metrics_rollup.mjs reports/ret1-export-prod-20260406.log
   ```

   **Windows PowerShell:**

   ```powershell
   Get-Content .\reports\ret1-export-prod-20260406.log | node .\scripts\ret1_dispatch_metrics_rollup.mjs
   ```

5. **Optional — stratify in your tool** before rolling up: filter JSON where `path_family` = `web_widget_known_wedding` or `main_path_email_web` if you are validating one candidate at a time. The rollup script does not filter; use `grep`, Datadog, or saved queries first if needed.

6. **Record** the tables you care for D1 (see §4) in this doc or in your runbook.

---

## 3. What to extract for D1 readiness (maps to rollup output)

| Question | Rollup / manual |
|----------|-----------------|
| Which legacy `ai/intent.*` events still fire from triage? | Table **legacy downstream (ai/intent.* only)** + **downstream_inngest_event** |
| Orchestrator live volume by cutover branch | **Orchestrator live traffic by branch_code** (from hints) + table **branch_code** where `lane` implies live orchestrator |
| Rollback-only (gate-off) legacy | **rollback_capable** true vs false |
| Narrow path for first D1 | Filter exported lines by **`path_family`**, **`branch_code`**, **`dispatch_intent`** in JSON before or after rollup |

---

## 4. Production rollup results — template (fill after real export)

Paste or summarize from a real `node scripts/ret1_dispatch_metrics_rollup.mjs …` run.

| Metric | Value (TBD) |
|--------|-------------|
| Window / environment | |
| Total RET1 records parsed | |
| Legacy `ai/intent.*` counts by event | (from **legacy downstream** table) |
| `orchestrator_client_v1_live` vs `legacy_ai_intent` (lanes) | |
| Orchestrator live counts by `branch_code` | (hint: **Orchestrator live traffic by branch_code**) |
| `rollback_capable` true / false | |
| Closest-to-retirement heuristic | (script **Readiness hints**) |

**Event likely closest to retirement (after real data):** prefer the legacy specialist event with **low sustained count**, **high `rollback_capable` share** among legacy rows for that intent/path, and **orchestrator live already present** for the matching CUT branch in the same window.

---

## 5. First recommended D1 candidate (evidence-informed default)

**Candidate:** **Dashboard web — known-wedding widget — legacy `ai/intent.concierge` (CUT2 off path only).**

**Scoped RET1 fields:**

- `path_family`: `web_widget_known_wedding`
- `dispatch_intent`: `concierge`
- When legacy fires: `downstream_inngest_event`: `ai/intent.concierge`, `lane`: `legacy_ai_intent`, `branch_code`: `LEGACY_INTENT_MAP` (CUT2 **off**)
- When orchestrator live: `branch_code`: `CUT2_WEB_WIDGET`, `lane`: `orchestrator_client_v1_live`

**Historical:** `buildWebWidgetRetirementDispatchV1` lived in removed `retirementDispatchObservabilityV1.ts` (pre–Slice 9); the shape is summarized in [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) §5.

### Why this is the safest first D1 path (even before production counts)

1. **Smallest surface area:** One widget path, known wedding already resolved — not the full email main path.
2. **Single gate:** `TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1` (CUT2) toggles legacy vs orchestrator for this branch; rollback story is “flip CUT2 off.”
3. **Observability alignment:** RET1 already tags this path distinctly (`path_family` + CUT2 vs `LEGACY_INTENT_MAP` for the widget branch).
4. **Defer heavier paths:** Main-path concierge (CUT4), logistics (CUT6), etc. affect more traffic and channels; prove D1-style retirement on the narrow branch first.

**Not in scope for this same candidate:** main-path `ai/intent.concierge` (CUT4), other specialists (CUT5–CUT8), intake, WhatsApp.

---

## 6. CUT2 D1 status (post–RET1c)

**CUT2 execution D1** is implemented — see [`CUT2_WEB_WIDGET_D1_PREP_SLICE.md`](CUT2_WEB_WIDGET_D1_PREP_SLICE.md): **`TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1`** is read for the web-widget known-wedding branch; **`cut2_web_widget_d1_prep`** is **`schema_version: 2`**. Further work for this branch is ops tuning (env + evidence), not more triage wiring.

**CUT4 D1 execution** — [`CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`](CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md). **CUT5 D1 execution** — [`CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`](CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md). **CUT6 D1 execution** — [`CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md`](CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md). **CUT7 D1 execution** — [`CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`](CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md). **CUT8 D1 execution** — [`CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`](CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md) (`TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1`, `cut8_main_path_studio_d1_prep` v2). **Next:** **RET2 unregister-readiness** — [`RET2_UNREGISTER_READINESS_AUDIT.md`](RET2_UNREGISTER_READINESS_AUDIT.md) (audit only; actual unregister deferred).

---

## 7. Revision history

| Date | Note |
|------|------|
| 2026-04-06 | Initial RET1c slice: no production export in repo; procedure + single CUT2 web-widget concierge candidate |
| 2026-04-06 | CUT6 D1 prep doc + named env; next execution candidate = CUT6 logistics |
| 2026-04-06 | CUT6 D1 execution; next candidate = CUT7 commercial |
| 2026-04-06 | CUT7 D1 prep doc + named env; next execution candidate = CUT7 commercial |
| 2026-04-06 | CUT7 D1 execution; next candidate = CUT8 studio |
| 2026-04-06 | CUT8 D1 prep doc + named env; next execution candidate = CUT8 studio |
| 2026-04-06 | CUT8 D1 execution; next = RET2 / roadmap (not another CUT* in this series) |
| 2026-04-06 | RET2 unregister-readiness audit doc (`RET2_UNREGISTER_READINESS_AUDIT.md`); actual unregister still deferred |
