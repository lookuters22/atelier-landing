# CUT6 main-path logistics — D1 prep + execution (narrow branch)

**Slice type:** **D1 execution implemented** — **`TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1`** is read in **`triage.ts`** dispatch; **`logisticsFunction` stays registered** globally, **CUT2 / CUT4 / CUT5 / CUT7–CUT8 / other specialists unchanged**.

**Related:** [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md), [`CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`](CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md) (pattern reference), [`triageShadowOrchestratorClientV1Gate.ts`](../../supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts), [`triage.ts`](../../supabase/functions/inngest/functions/triage.ts).

---

## 1. Scope

| In scope | Out of scope |
|----------|----------------|
| Main triage path (`comms/email.received` / main-path `comms/web.received`, **not** web-widget fast path) | CUT2, CUT4, CUT5, CUT7–CUT8, intake, WhatsApp |
| `dispatch_intent === "logistics"` + **`finalWeddingId` set** | Logistics without resolved wedding, other intents |

**Web widget:** Known-wedding dashboard messages use the **CUT2** branch first and **do not** reach main-path CUT6 D1; this slice applies only to the main **`dispatch-event`** path (typically **email**).

---

## 2. Retirement target

| Item | Value |
|------|--------|
| Legacy event (this branch) | `ai/intent.logistics` when **CUT6** is **off** |
| Live replacement | `ai/orchestrator.client.v1` with **`draft_only`** when **CUT6** is **on** |

---

## 3. Env gates

| Env | Role |
|-----|------|
| `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1` | **On** → live orchestrator; **off** → legacy **allowed** only if D1 allows (see §3.1). |
| `TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1` | **Execution:** when **`0` / `false` / `off` / `no`**, triage **does not** send legacy **`ai/intent.logistics`** if CUT6 is **off**. **Unset / empty** → legacy **allowed** when CUT6 off (fail open). |

### 3.1 CUT6 main-path logistics — D1 vs CUT6 live

| CUT6 live gate | D1 legacy gate | Dispatch |
|----------------|----------------|----------|
| **On** | *(any)* | `ai/orchestrator.client.v1` (`draft_only`) |
| **Off** | allows legacy (unset / `1` / `true`) | `ai/intent.logistics` |
| **Off** | disallows (`0` / `false` / `off` / `no`) | **No** dispatch — `status: cut6_main_path_logistics_d1_blocked_no_dispatch` |

---

## 4. Rollback

- **Restore legacy logistics when CUT6 is off:** unset **`TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1`** or set to a truthy allow value, **or** turn **`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1=1`** so orchestrator handles the branch.

---

## 5. Return payload — `cut6_main_path_logistics_d1_prep` (`schema_version: 2`)

On **`status: "routed"`** or blocked status when **`dispatch_intent === "logistics"`** and **`weddingId`** is set (main path).

| Field | Meaning |
|-------|---------|
| `schema_version` | **`2`** |
| `retirement_target` | `legacy_ai_intent.logistics_when_cut6_off` |
| `cut6_live_gate_env` | CUT6 live gate name |
| `d1_legacy_dispatch_gate_env` | D1 gate name |
| `d1_legacy_when_cut6_off_allowed` | From env read |
| `cut6_main_path_live` | Whether CUT6 live applied this turn |
| `blocked_no_dispatch` | True when CUT6 off and D1 disallows legacy |

Use with **`retirement_dispatch_observability_v1`** (RET1) for the same turn.

**Blocked turn:** `lane: cut6_main_path_logistics_d1_blocked_no_dispatch`, `branch_code: CUT6_D1_LEGACY_DISALLOWED_CUT6_OFF`, sentinel `__cut6_main_path_logistics_d1_no_dispatch_cut6_off__`.

---

## 6. Next narrow D1 candidate

**CUT7** — main-path **`commercial`** + known wedding — separate D1 env (do not reuse CUT6). See [`RET1C_D1_CANDIDATE_SELECTION.md`](RET1C_D1_CANDIDATE_SELECTION.md).

---

## 7. Revision

| Date | Note |
|------|------|
| 2026-04-06 | Initial CUT6 D1 prep: named env + return field; no routing read. |
| 2026-04-06 | D1 execution: dispatch read, RET1 lane/sentinel, `schema_version: 2`, blocked early return. |
