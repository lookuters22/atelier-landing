# CUT2 web-widget — D1 prep + execution (narrow branch)

**Scope:** `comms/web.received` + deterministic `wedding_id` (web-widget fast path) **only**. **`conciergeFunction`** stays registered for main path and other producers.

**Related:** [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md) §1.3 / §5.7, [`RET1C_D1_CANDIDATE_SELECTION.md`](RET1C_D1_CANDIDATE_SELECTION.md), [`triageShadowOrchestratorClientV1Gate.ts`](../../supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts), [`triage.ts`](../../supabase/functions/inngest/functions/triage.ts).

---

## 1. Retirement target

| Item | Value |
|------|--------|
| Legacy event (this branch) | `ai/intent.concierge` when **CUT2** is **off** |
| Live replacement | `ai/orchestrator.client.v1` with **`draft_only`** when **CUT2** is **on** |

---

## 2. Env gates

| Env | Role |
|-----|------|
| `TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1` | **On** → live orchestrator (`draft_only`); **off** → legacy **only if** D1 allows legacy (see below). |
| `TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1` | **Read for routing.** When **`0` / `false` / `off` / `no`**, legacy **`ai/intent.concierge` is not used** when CUT2 is off. **When unset / empty / other truthy-style values** → legacy **allowed** when CUT2 is off (backward compatible default; unknown tokens fail **open** to avoid surprise outages). |

---

## 3. CUT2 D1 behavior when D1 “disallows legacy” (`0` / `false` / `off` / `no`)

| CUT2 | Result |
|------|--------|
| **On** | Dispatch **`ai/orchestrator.client.v1`** (`draft_only`) — unchanged. |
| **Off** | **No** `ai/intent.concierge` and **no** orchestrator. `triage` completes with **`status: cut2_web_widget_d1_blocked_no_dispatch`**, `reason_code: CUT2_OFF_AND_D1_LEGACY_DISALLOWED`, RET1 lane **`cut2_web_widget_d1_blocked_no_dispatch`**, sentinel **`__cut2_web_widget_d1_no_dispatch_cut2_off__`**. Thread/message persist already ran. |

---

## 4. Rollback (explicit)

| Goal | Action |
|------|--------|
| Restore legacy when CUT2 off | Set **`TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1`** unset, or **`1` / `true`**, or remove the secret — legacy **`ai/intent.concierge`** again when CUT2 is off. |
| Prefer orchestrator-only for this branch | Keep D1 disallowing legacy **and** keep **`TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1=1`**. |

---

## 5. Return payload — `cut2_web_widget_d1_prep` (`schema_version: 2`)

| Field | Meaning |
|-------|---------|
| `d1_legacy_when_cut2_off_allowed` | Env read (see §2). |
| `cut2_web_widget_live` | CUT2 gate on. |
| `blocked_no_dispatch` | `!cut2_web_widget_live && !d1_legacy_when_cut2_off_allowed`. |

---

## 6. Legacy concierge for web-widget known-wedding after D1

- **When D1 disallows legacy:** no **`ai/intent.concierge`** from triage for this branch if CUT2 is off (blocked path). If CUT2 is on, orchestrator only — **no** legacy that turn.
- **When D1 allows legacy (default):** same as pre-execution: CUT2 off → legacy concierge **still dispatched** for this branch.

---

## 7. Next narrow D1 candidate

**Main-path concierge (CUT4)** — `path_family: main_path_email_web`, gate `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1`; add a **separate** D1 legacy gate when ready (do not reuse CUT2 env for CUT4).

---

## 8. Revision history

| Date | Note |
|------|------|
| 2026-04-06 | D1 prep: named env + `cut2_web_widget_d1_prep` schema v1 (no routing read). |
| 2026-04-06 | D1 execution: env read; blocked path; schema v2; RET1 sentinel + lane. |
