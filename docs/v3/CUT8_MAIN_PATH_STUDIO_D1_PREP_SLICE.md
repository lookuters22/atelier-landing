# CUT8 main-path studio — D1 prep + execution (narrow branch)

**Slice type:** **D1 execution wired** — **`studioFunction` stays registered** globally, **CUT2 / CUT4–CUT7 / other specialists unchanged**.

**Related:** [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md), [`CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`](CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md) (pattern reference), [`triageShadowOrchestratorClientV1Gate.ts`](../../supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts), [`triage.ts`](../../supabase/functions/inngest/functions/triage.ts).

---

## 1. Scope

| In scope | Out of scope |
|----------|----------------|
| Main triage path (`comms/email.received` / main-path `comms/web.received`, **not** web-widget fast path) | CUT2, CUT4–CUT7, intake, WhatsApp |
| `dispatch_intent === "studio"` + **`finalWeddingId` set** (typically **post-wedding** stage group) | Studio without resolved wedding, other intents |

**Web widget:** Known-wedding dashboard messages use the **CUT2** branch first and **do not** reach main-path CUT8 D1; this slice is for the main **`dispatch-event`** path (typically **email**).

---

## 2. Retirement target (explicit)

| Item | Value |
|------|--------|
| Legacy event (this branch) | `ai/intent.studio` when **CUT8** is **off** (unless D1 allows legacy) |
| Live replacement | `ai/orchestrator.client.v1` with **`draft_only`** when **CUT8** is **on** |

---

## 3. Env gates

| Env | Role |
|-----|------|
| `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1` | **On** → live orchestrator; **off** → legacy `ai/intent.studio` **if** D1 allows (see below). |
| `TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1` | **Read in `triage.ts`:** `0` / `false` / `off` / `no` → legacy **`ai/intent.studio` not** dispatched when CUT8 is off (**blocked**). **Unset** → allow legacy when CUT8 off (unchanged default). Unknown → **allow** (fail open). |

---

## 4. Rollback (explicit)

- **CUT8 on** → orchestrator live path (unchanged).
- **CUT8 off** + **unset D1** (or any value other than restrictive tokens) → legacy `ai/intent.studio` remains available (**rollback**).
- **CUT8 off** + **D1 restrictive** → no legacy dispatch; enable **`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1=1`** or unset/relax D1.

---

## 5. Return payload — `cut8_main_path_studio_d1_prep` (`schema_version: 2`)

On **`status: "routed"`** when **`dispatch_intent === "studio"`** and **`weddingId`** is set; on **`status: cut8_main_path_studio_d1_blocked_no_dispatch`** with execution snapshot (`d1_legacy_when_cut8_off_allowed: false`, etc.).

| Field | Meaning |
|-------|---------|
| `retirement_target` | `legacy_ai_intent.studio_when_cut8_off` |
| `cut8_live_gate_env` | CUT8 live gate name |
| `d1_legacy_dispatch_gate_env` | D1 gate name |
| `d1_legacy_when_cut8_off_allowed` | Parsed D1 allow/deny |
| `cut8_main_path_live` | Whether CUT8 live applied this turn |
| `blocked_no_dispatch` | `!cut8_main_path_live && !d1_legacy_when_cut8_off_allowed` |

Use with **`retirement_dispatch_observability_v1`** (RET1) for the same turn. Blocked turns: lane `cut8_main_path_studio_d1_blocked_no_dispatch`, sentinel `__cut8_main_path_studio_d1_no_dispatch_cut8_off__`.

---

## 6. Next retirement work

Main-path **CUT4–CUT8 D1** sequence in **`triage`** is **complete**. Further work: **RET2** / worker lifecycle, **intake** migration docs — not another CUT* gate in this series.

---

## 7. Revision

| Date | Note |
|------|------|
| 2026-04-06 | Initial CUT8 D1 prep: named env + `cut8_main_path_studio_d1_prep` v1; no routing read. |
| 2026-04-06 | D1 execution: gate read, block path, RET1 + `schema_version: 2` exec object. |
