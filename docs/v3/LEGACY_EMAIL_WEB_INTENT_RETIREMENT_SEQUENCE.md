# Legacy email / dashboard-web `ai/intent.*` — retirement sequencing (RET0 inventory)

> **Historical / planning context:** This document was written for the **pre-ingress `triage.ts` (`traffic-cop-triage`)** era. **Email/web pre-ingress is retired**; live email classification is **`processInboxThreadRequiresTriage`** + shared dispatch. Keep this file for **RET sequencing and env-gated orchestrator behavior**, but read **`triage` / `comms/email.received` / `comms/web.received`** references as **retired ingress**, not current triggers.

## Purpose

This document is the **narrow, email + dashboard-web–scoped** inventory for **legacy specialist dispatch** (historically **`triage`-driven**; now **post-ingest–driven** for the same `ai/intent.*` edges). It supports **RET1–RET3** in [`V3_FULL_CUTOVER_PLAN.md`](V3_FULL_CUTOVER_PLAN.md) without removing workers or changing routing.

**In scope (historical framing):** Retired `comms/email.received` and `comms/web.received` paths that lived in removed `triage.ts` (including the web-widget known-wedding fast path). **Current live scope:** same specialist/orchestrator questions via **`postIngestThreadDispatch`** / **`runMainPathEmailDispatch`**.

**Out of scope (this slice):** WhatsApp branches (`comms/whatsapp.*`, `operator/whatsapp.legacy.*`), `whatsappOrchestrator`, operator lanes, bounded unresolved matchmaker / near-match escalation (see [`UNFILED_UNRESOLVED_MATCHING_SLICE.md`](UNFILED_UNRESOLVED_MATCHING_SLICE.md)).

**Runtime posture reference (post-proof defaults):** live intake email post-bootstrap gate may be ON; bounded unresolved + QA synthetic gates OFF unless explicitly enabled.

---

## 1. What `triage` can still emit (email + web)

### 1.1 Main assembly line (`INTENT_EVENT_MAP` in `triage.ts`)

After identity, stage gate, matchmaker (where applicable), and persistence, the **default live** downstream event for each `dispatch_intent` is:

| `dispatch_intent` | Inngest event | Registered worker |
|-------------------|---------------|-------------------|
| `intake` | `ai/intent.intake` | `intakeFunction` |
| `commercial` | `ai/intent.commercial` | `commercialFunction` |
| `logistics` | `ai/intent.logistics` | `logisticsFunction` |
| `project_management` | `ai/intent.project_management` | `projectManagerFunction` |
| `concierge` | `ai/intent.concierge` | `conciergeFunction` |
| `studio` | `ai/intent.studio` | `studioFunction` |

**Notes:**

- **`ai/intent.persona` is not in this map.** Triage does not send it. Intake and specialist workers emit `ai/intent.persona` downstream (see [`INTAKE_MIGRATION_POST_CUT8_SLICE.md`](INTAKE_MIGRATION_POST_CUT8_SLICE.md)). Persona remains **live** for those chains until a later migration retires it.
- **Near-match approval:** when `bounded_unresolved_email_matchmaker.outcome === "escalated_for_approval"`, triage **does not** dispatch `ai/intent.intake` or specialist `ai/intent.*` for that turn; it records escalation + operator delivery instead.

### 1.2 Env-gated live orchestrator (same turn may skip legacy `ai/intent.*`)

When **`finalWeddingId`** is set and the matching **CUT*** gate is **ON**, triage sends **`ai/orchestrator.client.v1`** (`draft_only`) **instead of** the corresponding legacy event for that intent:

| Intent (known wedding) | Env gate (main path email/web) | Replaces legacy event |
|--------------------------|--------------------------------|------------------------|
| `concierge` | `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1` | `ai/intent.concierge` |
| `project_management` | `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1` | `ai/intent.project_management` |
| `logistics` | `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1` | `ai/intent.logistics` |
| `commercial` | `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1` | `ai/intent.commercial` |
| `studio` | `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1` | `ai/intent.studio` |

When the gate is **OFF**, **legacy `ai/intent.*` remains the live path** for that intent — this is the **rollback** posture — **unless** a **D1** env disallows legacy for that narrow branch (CUT4 concierge: §1.2a; CUT5 project_management: §1.2b; CUT6 logistics: §1.2c; CUT7 commercial: §1.2d; CUT8 studio: §1.2e). **CUT8 studio** D1 execution: [`CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`](CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md).

### 1.2a CUT4 main-path concierge — D1 vs CUT4 live

| CUT4 live gate | D1 legacy gate | Dispatch |
|----------------|----------------|----------|
| **On** | *(any)* | `ai/orchestrator.client.v1` (`draft_only`) |
| **Off** | allows legacy (unset / `1` / `true`) | `ai/intent.concierge` |
| **Off** | disallows (`0` / `false` / `off` / `no`) | **No** dispatch — `status: cut4_main_path_concierge_d1_blocked_no_dispatch` |

Full detail: [`CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`](CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md) (distinct from CUT2 web-widget D1).

### 1.2b CUT5 main-path project_management — D1 vs CUT5 live

| CUT5 live gate | D1 legacy gate | Dispatch |
|----------------|----------------|----------|
| **On** | *(any)* | `ai/orchestrator.client.v1` (`draft_only`) |
| **Off** | allows legacy (unset / `1` / `true`) | `ai/intent.project_management` |
| **Off** | disallows (`0` / `false` / `off` / `no`) | **No** dispatch — `status: cut5_main_path_project_management_d1_blocked_no_dispatch` |

Full detail: [`CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`](CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md). Distinct from CUT4; does **not** apply to web-widget fast path (CUT2).

### 1.2c CUT6 main-path logistics — D1 vs CUT6 live

| CUT6 live gate | D1 legacy gate | Dispatch |
|----------------|----------------|----------|
| **On** | *(any)* | `ai/orchestrator.client.v1` (`draft_only`) |
| **Off** | allows legacy (unset / `1` / `true`) | `ai/intent.logistics` |
| **Off** | disallows (`0` / `false` / `off` / `no`) | **No** dispatch — `status: cut6_main_path_logistics_d1_blocked_no_dispatch` |

Full detail: [`CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md`](CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md). Distinct from CUT5; does **not** apply to web-widget fast path (CUT2); **`logisticsFunction`** remains registered.

### 1.2d CUT7 main-path commercial — D1 vs CUT7 live

| CUT7 live gate | D1 legacy gate | Dispatch |
|----------------|----------------|----------|
| **On** | *(any)* | `ai/orchestrator.client.v1` (`draft_only`) |
| **Off** | allows legacy (unset / `1` / `true`) | `ai/intent.commercial` |
| **Off** | disallows (`0` / `false` / `off` / `no`) | **No** dispatch — `status: cut7_main_path_commercial_d1_blocked_no_dispatch` |

Full detail: [`CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`](CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md). Distinct from CUT6; does **not** apply to web-widget fast path (CUT2); **`commercialFunction`** remains registered.

### 1.2e CUT8 main-path studio — D1 vs CUT8 live

| CUT8 live gate | D1 legacy gate | Dispatch |
|----------------|----------------|----------|
| **On** | *(any)* | `ai/orchestrator.client.v1` (`draft_only`) |
| **Off** | allows legacy (unset / `1` / `true`) | `ai/intent.studio` |
| **Off** | disallows (`0` / `false` / `off` / `no`) | **No** dispatch — `status: cut8_main_path_studio_d1_blocked_no_dispatch` |

Return field **`cut8_main_path_studio_d1_prep`** (`schema_version: 2`) on **`routed`** for **`studio` + known `wedding_id`**. See [`CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`](CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md). Distinct from CUT7; **`studioFunction`** remains registered.

### 1.3 Web widget fast path (`comms/web.received` + deterministic `wedding_id`)

| Condition | Dispatch |
|-----------|----------|
| `TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1` **ON** | `ai/orchestrator.client.v1` (CUT2, `draft_only`) — **no** `ai/intent.concierge` that turn |
| CUT2 **OFF** and `TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1` allows legacy (unset / `1` / `true`) | **`ai/intent.concierge`** (legacy for this branch only) |
| CUT2 **OFF** and D1 env **disallows** legacy (`0` / `false` / `off` / `no`) | **No** concierge/orchestrator dispatch — `triage` returns `status: cut2_web_widget_d1_blocked_no_dispatch` (enable CUT2 or relax D1) |

Shadow orchestrator may still run in parallel when CUT2 is off, legacy is allowed, and shadow env is on (observation only). Skipped when CUT2 live or when D1 blocks (no dispatch).

### 1.4 Intake post-bootstrap live email (not a `triage` map entry)

**`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1`** is handled **inside `intake.ts`** after bootstrap: it can emit **`ai/orchestrator.client.v1`** instead of **`ai/intent.persona`** for that turn when `reply_channel === "email"`. This does **not** remove the **`intake`** worker; it changes **post-bootstrap** handoff. See [`INTAKE_MIGRATION_POST_CUT8_SLICE.md`](INTAKE_MIGRATION_POST_CUT8_SLICE.md).

---

## 2. Classification

### 2.1 Still required for **current live supported** email/web behavior

| Piece | Why |
|-------|-----|
| **`ai/intent.intake` → `intake`** | Cold-lead / intake-shaped main path; post-bootstrap live orchestrator is an **optional** branch inside intake, not a triage removal of intake. |
| **Each specialist `ai/intent.*` above** | **Default** when the corresponding **CUT4–CUT8** (or CUT2 web widget) gate is **off** — i.e. **normal production** today for known-wedding non-intake traffic. |
| **`ai/intent.concierge` (web widget)** | **Live** for dashboard web known-wedding widget when **CUT2** is off. |

### 2.2 Required **only** as **fallback / rollback** (gates may be off)

| Piece | Role |
|-------|------|
| **Specialist `ai/intent.*`** | When **CUT4–CUT8** (or **CUT2**) is **disabled**, orchestrator must **not** be the sole path; legacy remains. |
| **Shadow-only orchestrator** | Not a replacement for legacy send; observation (`C1`). |

### 2.3 **Realistic retirement candidates** (later — **RET1+**, not now)

Per [`V3_FULL_CUTOVER_PLAN.md`](V3_FULL_CUTOVER_PLAN.md): a worker is a candidate only after:

- triage **no longer** needs to emit its event for **supported** production paths, **and**
- `ai/orchestrator.client.v1` (or successor) is **proven** for that slice, **and**
- ingress / replay / ops sign-off.

| Candidate (directional) | Preconditions |
|-------------------------|---------------|
| **`ai/intent.concierge`** (main path) | CUT4 committed + evidence; same for web-widget **`ai/intent.concierge`** vs CUT2. |
| **Other specialists** | Matching CUT5–CUT8 committed + parity. |
| **`ai/intent.intake` → intake worker** | Separate intake migration; orchestrator does not yet replace lead creation + persona handoff (see intake migration doc). |

**Do not unregister** from `inngest/index.ts` until **D2** criteria in [`POST_V3_CLEANUP_PHASE2_ROADMAP.md`](POST_V3_CLEANUP_PHASE2_ROADMAP.md) are met.

---

## 3. First safe readiness step (this slice)

**Delivered:** this inventory + cross-links + comments on `INTENT_EVENT_MAP` and `inngest/index.ts` so **live vs gated-orchestrator vs rollback** is explicit in-repo without deleting code.

**Not done:** worker removal, routing changes, or WhatsApp/dashboard changes.

---

## 4. Next retirement-oriented slice (after RET1 observability)

1. **RET1b:** roll up **`[triage.retirement_dispatch_v1]`** logs (§5.5).
2. **RET1c:** real export procedure + first D1 candidate — [`RET1C_D1_CANDIDATE_SELECTION.md`](RET1C_D1_CANDIDATE_SELECTION.md) (§5.6).
3. **Continue Phase 2** parity work (**A4**, **B3**) until cutover gates can stay **on** by policy.
4. **D1 / D2** only after evidence shows **legacy** dispatches → **~0** for the intended window.

See also: [`PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md`](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md) (full Inngest roster + producers). **RET2 unregister-readiness:** [`RET2_UNREGISTER_READINESS_AUDIT.md`](RET2_UNREGISTER_READINESS_AUDIT.md).

---

## 5. RET1 — dispatch observability (implemented)

**Purpose:** Evidence for **when legacy workers are still hit** vs **orchestrator live**, without changing routing.

### 5.1 Inngest function return payload

Successful `triage` returns for **email + dashboard web** (including web-widget fast path and unfiled early exit) include:

- **`retirement_dispatch_observability_v1`** — object, `schema_version: 1`

| Field | Meaning |
|-------|---------|
| `path_family` | `main_path_email_web` \| `web_widget_known_wedding` |
| `reply_channel` | `email` \| `web` |
| `dispatch_intent` | Stage-gated dispatch intent |
| `downstream_inngest_event` | Primary event triage chose for that turn: `ai/intent.*`, `ai/orchestrator.client.v1`, or sentinel strings for escalation/unfiled (see below) |
| `lane` | `legacy_ai_intent` \| `orchestrator_client_v1_live` \| `near_match_escalation` \| `unfiled_no_dispatch` \| `cut2_web_widget_d1_blocked_no_dispatch` \| `cut4_main_path_concierge_d1_blocked_no_dispatch` \| `cut5_main_path_project_management_d1_blocked_no_dispatch` \| `cut6_main_path_logistics_d1_blocked_no_dispatch` \| `cut7_main_path_commercial_d1_blocked_no_dispatch` \| `cut8_main_path_studio_d1_blocked_no_dispatch` |
| `branch_code` | `CUT2_WEB_WIDGET`, `CUT4_MAIN_CONCIERGE`, … `LEGACY_INTENT_MAP`, `LEGACY_INTAKE`, `NEAR_MATCH_ESCALATION`, `UNFILED_EARLY_EXIT`, `CUT2_D1_LEGACY_DISALLOWED_CUT2_OFF`, `CUT4_D1_LEGACY_DISALLOWED_CUT4_OFF`, `CUT5_D1_LEGACY_DISALLOWED_CUT5_OFF`, `CUT6_D1_LEGACY_DISALLOWED_CUT6_OFF`, `CUT7_D1_LEGACY_DISALLOWED_CUT7_OFF`, `CUT8_D1_LEGACY_DISALLOWED_CUT8_OFF` |
| `rollback_capable` | **True** only when legacy specialist `ai/intent.*` ran for a **known wedding** while the **matching CUT** env gate was **off** (could have been orchestrator if gate were on). Intake / escalation / unfiled → **false**. |

**Sentinel `downstream_inngest_event` values (no legacy/orchestrator worker dispatch):**

- `__bounded_near_match_escalation_no_ai_intent_dispatch__` — near-match approval path
- `__none_unfiled_early_exit__` — unfiled early exit
- `__cut2_web_widget_d1_no_dispatch_cut2_off__` — CUT2 web-widget branch: D1 forbids legacy and CUT2 is off ([`CUT2_WEB_WIDGET_D1_PREP_SLICE.md`](CUT2_WEB_WIDGET_D1_PREP_SLICE.md))
- `__cut4_main_path_concierge_d1_no_dispatch_cut4_off__` — CUT4 main-path concierge: D1 forbids legacy and CUT4 is off ([`CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`](CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md))
- `__cut5_main_path_project_management_d1_no_dispatch_cut5_off__` — CUT5 main-path project_management: D1 forbids legacy and CUT5 is off ([`CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`](CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md))
- `__cut6_main_path_logistics_d1_no_dispatch_cut6_off__` — CUT6 main-path logistics: D1 forbids legacy and CUT6 is off ([`CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md`](CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md))
- `__cut7_main_path_commercial_d1_no_dispatch_cut7_off__` — CUT7 main-path commercial: D1 forbids legacy and CUT7 is off ([`CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`](CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md))
- `__cut8_main_path_studio_d1_no_dispatch_cut8_off__` — CUT8 main-path studio: D1 forbids legacy and CUT8 is off ([`CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`](CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md))

### 5.2 Structured log line

Every turn that sets `retirement_dispatch_observability_v1` also emits:

```text
[triage.retirement_dispatch_v1] {"schema_version":1,...}
```

**Aggregate in log pipelines:** filter by prefix `triage.retirement_dispatch_v1`, parse JSON, group by `lane`, `branch_code`, `dispatch_intent`, `downstream_inngest_event`, `rollback_capable`.

### 5.3 How to use this for retirement decisions

- **Legacy still required:** sustained volume where `lane === "legacy_ai_intent"` (or `LEGACY_INTAKE`) for supported traffic.
- **Orchestrator live winning:** `lane === "orchestrator_client_v1_live"` for the same intent + path — compare counts vs legacy before turning gates **default-on**.
- **Rollback-only posture:** `rollback_capable === true` means that turn **would** have used orchestrator if the env gate were on — useful to confirm gates are the only barrier.
- **Do not unregister** a worker until **legacy** counts for its event → **~0** for the intended production window **and** ops sign-off (see **D1** in roadmap).

### 5.5 RET1b — metrics rollup script (readiness)

**Script:** [`scripts/ret1_dispatch_metrics_rollup.mjs`](../../scripts/ret1_dispatch_metrics_rollup.mjs)

**How to get input:** Export recent Edge / Inngest logs that include `[triage.retirement_dispatch_v1]` (same JSON as `retirement_dispatch_observability_v1`). Save as a `.log` or `.txt` file, or pipe stdin.

```bash
node scripts/ret1_dispatch_metrics_rollup.mjs path/to/export.log
# Windows PowerShell:
Get-Content path\to\export.log | node scripts/ret1_dispatch_metrics_rollup.mjs
```

**Output:** tables for `lane`, `branch_code`, `downstream_inngest_event`, `dispatch_intent`, legacy `ai/intent.*` breakdown, `rollback_capable` true/false counts, heuristic **readiness hints**, and a **JSON summary** for dashboards or `jq`.

**Sample:** [`scripts/fixtures/ret1_sample_export.log`](../../scripts/fixtures/ret1_sample_export.log)

**Dashboard / query recipe (manual):** In any log platform, filter message contains `triage.retirement_dispatch_v1`, extract JSON after the prefix, aggregate with your tool’s JSON grouping — same dimensions as the script.

### 5.6 RET1c — real evidence + first D1 candidate (planning only)

**Doc:** [`RET1C_D1_CANDIDATE_SELECTION.md`](RET1C_D1_CANDIDATE_SELECTION.md) — how to capture a production log window, run the RET1b rollup, fill a results template, and the **first recommended D1 candidate** (CUT2 web-widget `ai/intent.concierge` path). **No routing changes** in this slice.

### 5.7 CUT2 web-widget — D1 execution (narrow branch)

**Doc:** [`CUT2_WEB_WIDGET_D1_PREP_SLICE.md`](CUT2_WEB_WIDGET_D1_PREP_SLICE.md)

**Implemented:** **`TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1`** gates legacy **`ai/intent.concierge`** on the web-widget known-wedding branch when CUT2 is off. **`cut2_web_widget_d1_prep`** is **`schema_version: 2`**. Main-path concierge (CUT4) unchanged; **`conciergeFunction`** remains registered.

### 5.8 CUT4 main-path concierge — D1 execution (narrow branch)

**Doc:** [`CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`](CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md)

**Implemented:** **`TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1`**; **`cut4_main_path_concierge_d1_prep`** **`schema_version: 2`**; blocked **`status: cut4_main_path_concierge_d1_blocked_no_dispatch`** when CUT4 off + D1 disallows legacy. CUT2 and CUT5–CUT8 unchanged.

### 5.9 CUT5 main-path project_management — D1 execution (narrow branch)

**Doc:** [`CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`](CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md)

**Implemented:** **`TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1`** gates legacy **`ai/intent.project_management`** on main-path **`project_management` + known `wedding_id`** when CUT5 is off. **`cut5_main_path_project_management_d1_prep`** is **`schema_version: 2`**; blocked **`status: cut5_main_path_project_management_d1_blocked_no_dispatch`** when CUT5 off + D1 disallows legacy. CUT2, CUT4, CUT6–CUT8 unchanged; **`projectManagerFunction`** remains registered.

### 5.10 CUT6 main-path logistics — D1 execution (narrow branch)

**Doc:** [`CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md`](CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md)

**Implemented:** **`TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1`** gates legacy **`ai/intent.logistics`** on main-path **`logistics` + known `wedding_id`** when CUT6 is off. **`cut6_main_path_logistics_d1_prep`** is **`schema_version: 2`**; blocked **`status: cut6_main_path_logistics_d1_blocked_no_dispatch`** when CUT6 off + D1 disallows legacy. CUT2, CUT4, CUT5, CUT7–CUT8 unchanged; **`logisticsFunction`** remains registered.

### 5.11 CUT7 main-path commercial — D1 execution (narrow branch)

**Doc:** [`CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`](CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md)

**Implemented:** **`TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1`** gates legacy **`ai/intent.commercial`** on main-path **`commercial` + known `wedding_id`** when CUT7 is off. **`cut7_main_path_commercial_d1_prep`** is **`schema_version: 2`**; blocked **`status: cut7_main_path_commercial_d1_blocked_no_dispatch`** when CUT7 off + D1 disallows legacy. CUT2, CUT4–CUT6, CUT8 unchanged; **`commercialFunction`** remains registered.

### 5.12 CUT8 main-path studio — D1 execution (narrow branch)

**Doc:** [`CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`](CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md)

**Implemented:** **`TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1`** gates legacy **`ai/intent.studio`** on main-path **`studio` + known `wedding_id`** when CUT8 is off. **`cut8_main_path_studio_d1_prep`** is **`schema_version: 2`**; blocked **`status: cut8_main_path_studio_d1_blocked_no_dispatch`** when CUT8 off + D1 disallows legacy. CUT2, CUT4–CUT7 unchanged; **`studioFunction`** remains registered.

### 5.13 Next RET step (after evidence collection)

- Main-path **CUT4–CUT8** specialist **D1** sequence in **`triage`** is **complete**.
- **RET2 / D2 (unregister):** only after **D1** criteria — triage no longer emits the worker’s event for **all** supported paths that still needed it — **not** a single-branch pilot.

### 5.14 RET2 — unregister-readiness audit (planning only)

**Doc:** [`RET2_UNREGISTER_READINESS_AUDIT.md`](RET2_UNREGISTER_READINESS_AUDIT.md) — inventory of legacy **`ai/intent.*`** registrations, producers, per-worker **not ready** status, and evidence gaps before any actual unregister. **No code removal** in that slice.

### 5.15 RET2 — pilot candidate selection (production evidence or runbook)

**Doc:** [`RET2_PILOT_CANDIDATE_SELECTION.md`](RET2_PILOT_CANDIDATE_SELECTION.md) — if a real RET1 export exists: run rollup, apply **one** pilot rule; if not: runbook + deterministic selection (prefer **studio / commercial / project_management** over **concierge / logistics** for first pilot due to **persona** chain). **No unregister** in that slice.
