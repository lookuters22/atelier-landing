# CUT5 main-path project_management — D1 prep + execution (narrow branch)

**Slice type:** **D1 execution implemented** — **`TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1`** is read in **`triage.ts`** dispatch; **`projectManagerFunction` stays registered** globally, **CUT2 / CUT4 / CUT6–CUT8 / other specialists unchanged**.

**Related:** [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md), [`CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`](CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md) (pattern reference), [`triageShadowOrchestratorClientV1Gate.ts`](../../supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts), [`triage.ts`](../../supabase/functions/inngest/functions/triage.ts).

---

## 1. Scope

| In scope | Out of scope |
|----------|----------------|
| Main triage path (`comms/email.received` / main-path `comms/web.received`; **not** web-widget fast path — see §1.1) | CUT2 web-widget fast path, CUT4, CUT6–CUT8, intake, WhatsApp |
| `dispatch_intent === "project_management"` + **`finalWeddingId` set** | PM without resolved wedding, other intents |

**§1.1 Web widget:** Known-wedding dashboard messages use the **CUT2** branch first (`isWebWidget && identity.weddingId`) and **do not** reach main-path CUT5/CUT5 D1. CUT5 D1 applies only when triage runs the main **`dispatch-event`** path (typically **email**; web only when the fast path does not apply).

---

## 2. Retirement target

| Item | Value |
|------|--------|
| Legacy event (this branch) | `ai/intent.project_management` when **CUT5** is **off** |
| Live replacement | `ai/orchestrator.client.v1` with **`draft_only`** when **CUT5** is **on** |

---

## 3. Env gates

| Env | Role |
|-----|------|
| `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1` | **On** → live orchestrator; **off** → legacy **allowed** only if D1 allows (see §3.1). |
| `TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1` | **Execution:** when **`0` / `false` / `off` / `no`**, triage **does not** send legacy **`ai/intent.project_management`** if CUT5 is **off**. **Unset / empty** → legacy **allowed** when CUT5 off (fail open). |

### 3.1 CUT5 main-path project_management — D1 vs CUT5 live

| CUT5 live gate | D1 legacy gate | Dispatch |
|----------------|----------------|----------|
| **On** | *(any)* | `ai/orchestrator.client.v1` (`draft_only`) |
| **Off** | allows legacy (unset / `1` / `true`) | `ai/intent.project_management` |
| **Off** | disallows (`0` / `false` / `off` / `no`) | **No** dispatch — `status: cut5_main_path_project_management_d1_blocked_no_dispatch` |

---

## 4. Rollback

- **Restore legacy PM when CUT5 is off:** unset **`TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1`** or set to a truthy allow value, **or** turn **`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1=1`** so orchestrator handles the branch.

---

## 5. Return payload — `cut5_main_path_project_management_d1_prep` (`schema_version: 2`)

On **`status: "routed"`** or blocked status when **`dispatch_intent === "project_management"`** and **`weddingId`** is set (main path).

| Field | Meaning |
|-------|---------|
| `schema_version` | **`2`** |
| `retirement_target` | `legacy_ai_intent.project_management_when_cut5_off` |
| `cut5_live_gate_env` | CUT5 live gate name |
| `d1_legacy_dispatch_gate_env` | D1 gate name |
| `d1_legacy_when_cut5_off_allowed` | From env read |
| `cut5_main_path_live` | Whether CUT5 live applied this turn |
| `blocked_no_dispatch` | True when CUT5 off and D1 disallows legacy |

Use with **`retirement_dispatch_observability_v1`** (RET1) for the same turn.

**Blocked turn:** `lane: cut5_main_path_project_management_d1_blocked_no_dispatch`, `branch_code: CUT5_D1_LEGACY_DISALLOWED_CUT5_OFF`, sentinel `__cut5_main_path_project_management_d1_no_dispatch_cut5_off__`.

---

## 6. Next narrow D1 candidate

**CUT6** — main-path **`logistics`** + known wedding — separate D1 env (do not reuse CUT5). See roadmap / [`RET1C_D1_CANDIDATE_SELECTION.md`](RET1C_D1_CANDIDATE_SELECTION.md).

---

## 7. Revision

| Date | Note |
|------|------|
| 2026-04-06 | Initial CUT5 D1 prep: named env + return field; no routing read. |
| 2026-04-06 | D1 execution: dispatch read, RET1 lane/sentinel, `schema_version: 2`, blocked early return. |
