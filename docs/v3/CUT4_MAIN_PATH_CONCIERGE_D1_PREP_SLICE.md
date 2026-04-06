# CUT4 main-path concierge — D1 prep + execution (narrow branch)

**Scope:** Main triage path (`comms/email.received` / `comms/web.received` **not** web-widget fast path) + **`dispatch_intent === "concierge"`** + filed **`wedding_id`**. **`conciergeFunction`** stays registered globally.

**Related:** [`LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`](LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md), [`CUT2_WEB_WIDGET_D1_PREP_SLICE.md`](CUT2_WEB_WIDGET_D1_PREP_SLICE.md) (parallel pattern), [`triageShadowOrchestratorClientV1Gate.ts`](../../supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts), [`triage.ts`](../../supabase/functions/inngest/functions/triage.ts).

---

## 1. Scope (explicit)

| In scope | Out of scope |
|----------|----------------|
| Main path concierge + known wedding | CUT2 web-widget path, CUT5–CUT8, intake, WhatsApp |
| Near-match / unfiled early exits | Those branches do not use this CUT4 D1 block |

---

## 2. Retirement target

| Item | Value |
|------|--------|
| Legacy event (this branch) | `ai/intent.concierge` when **CUT4** is **off** |
| Live replacement | `ai/orchestrator.client.v1` with **`draft_only`** when **CUT4** is **on** |

---

## 3. Env gates

| Env | Role |
|-----|------|
| `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1` | **On** → orchestrator (`draft_only`); **off** → legacy **only if** D1 allows legacy. |
| `TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1` | **Read for routing.** When **`0` / `false` / `off` / `no`**, legacy **`ai/intent.concierge` is not used** when CUT4 is off. **Unset / empty** → legacy allowed when CUT4 off (default). Unknown tokens → **allowed** (fail open). |

---

## 4. CUT4 D1 behavior when D1 disallows legacy

| CUT4 | Result |
|------|--------|
| **On** | Dispatch **`ai/orchestrator.client.v1`** (`draft_only`) — unchanged. |
| **Off** | **No** `ai/intent.concierge` and **no** orchestrator. `triage` returns **`status: cut4_main_path_concierge_d1_blocked_no_dispatch`**, RET1 lane **`cut4_main_path_concierge_d1_blocked_no_dispatch`**, sentinel **`__cut4_main_path_concierge_d1_no_dispatch_cut4_off__`**. |

---

## 5. Rollback

| Goal | Action |
|------|--------|
| Restore legacy when CUT4 off | Set D1 env unset or **`1` / `true`**, or remove secret. |
| Orchestrator-only for this branch | Keep D1 disallowing legacy **and** **`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1=1`**. |

---

## 6. Return payload — `cut4_main_path_concierge_d1_prep` (`schema_version: 2`)

| Field | Meaning |
|-------|---------|
| `d1_legacy_when_cut4_off_allowed` | Env read |
| `cut4_main_path_live` | CUT4 gate on for concierge + known wedding |
| `blocked_no_dispatch` | `!cut4_main_path_live && !d1_legacy_when_cut4_off_allowed` |

---

## 7. Next narrow D1 candidate

**CUT5** — main-path **`project_management`** + known wedding: add **`TRIAGE_D1_CUT5_...`** (do not reuse CUT4 env).

---

## 8. Revision

| Date | Note |
|------|------|
| 2026-04-06 | D1 prep: named env + `cut4_main_path_concierge_d1_prep` v1; no routing read. |
| 2026-04-06 | D1 execution: env read; blocked path; v2 prep; RET1 sentinel + lane. |
