# External producer and ingress map (operational readiness)

> **Historical context (superseded for email/web pre-ingress):** **`comms/email.received`** and **`comms/web.received`** were **removed from the live `AtelierEvents` contract** and **`traffic-cop-triage` deleted**. Primary email ingress is **`inbox/thread.requires_triage.v1`**. The sections below remain as a **D1-era producer audit snapshot**; treat **`triageFunction` / `triage.ts` subscriber rows as obsolete** for email/web.

**Slice type:** Analysis / documentation only — **no runtime code changes**. Complements [PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md) (D1) and supports preconditions in [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) (“ambiguous external producers are mapped”).

**Baseline truth (repo):** Legacy `ai/intent.*` is live for email/web; `clientOrchestratorV1` is QA/shadow only. CUT2 live routing was rolled back twice — **do not** treat this document as permission to cut over or retire workers; it records **evidence gaps** so future work is not guess-based.

**Method:** Inventory `inngest.send({ name: … })` and Edge function entrypoints under `supabase/functions/`, plus `supabase/config.toml` `[functions.*]` registrations. Anything **not** emitted from this repo is **unknown upstream** until confirmed in Inngest Cloud, another service, or runbooks.

---

## 1. Ambiguous events (D1 list + detail)

### 1.1 `comms/email.received`

| Field | Detail |
|--------|--------|
| **In-repo producer** | **None found** — no `inngest.send` with this name in the repository; no `[functions.*]` Edge function in `supabase/config.toml` dedicated to email ingress (only `inngest`, `webhook-web`, `webhook-approval`, `webhook-whatsapp`). |
| **External / unknown** | **Yes — producer is unknown from this repo.** Plausible upstream: SendGrid/Mailgun/Postmark (or similar) → Inngest or Supabase function **not** present in this workspace, another repo, or manual dashboard sends. **Not invented here.** |
| **Subscriber(s)** | ~~`triageFunction`~~ **None (retired)** — was `triage.ts`; pre-ingress email path removed. |
| **Downstream** | Was: `ai/intent.*` specialists → persona, etc. **Current:** post-ingest classifier + same dispatch graph. |
| **Classification** | **Retired from supported live contract** — do not add new producers. External emits, if any, are **orphaned** relative to this repo’s served bundle. |
| **Evidence needed** | Inngest Cloud: which integration emits `comms/email.received`; staging vs prod; frequency; whether any traffic migrated to another event name. |

---

### 1.2 `comms/whatsapp.received`

| Field | Detail |
|--------|--------|
| **In-repo producer** | **None found.** |
| **External / unknown** | **Yes.** [ARCHITECTURE.md](ARCHITECTURE.md) references this event; [POST_V3_CLEANUP_AUDIT.md](../../POST_V3_CLEANUP_AUDIT.md) notes legacy handoff to internal concierge via triage. Likely historical Twilio/client bridge or dashboard — **not confirmed in repo.** |
| **Subscriber(s)** | **`legacy-whatsapp-ingress`** — same internal-concierge path (with `operator/whatsapp.legacy.received`). |
| **Downstream** | `internalConciergeFunction` → `ai/intent.internal_concierge` (not the same as `webhook-whatsapp` operator lane). |
| **Classification** | **Ambiguous / possibly live-critical** if any production client WhatsApp still targets this event. [inngest.ts](../../supabase/functions/_shared/inngest.ts) marks generic `comms/whatsapp.*` as deprecated in favor of explicit event names — does **not** prove zero traffic. |
| **Evidence needed** | Inngest: emitters for this event; Twilio/console configs; whether traffic moved to `client/whatsapp.inbound.v1` or `comms/whatsapp.received.v2`. |

---

### 1.3 `operator/whatsapp.legacy.received`

| Field | Detail |
|--------|--------|
| **In-repo producer** | **None found** (`OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT` in [inngest.ts](../../supabase/functions/_shared/inngest.ts)). |
| **External / unknown** | **Yes** — constant exists for triage subscription; no local `inngest.send` located. |
| **Subscriber(s)** | **`legacy-whatsapp-ingress`** — same internal-concierge bypass path as legacy `comms/whatsapp.received`. |
| **Downstream** | `ai/intent.internal_concierge`. |
| **Classification** | **Ambiguous** — may be a renamed or parallel ingress for operator-adjacent legacy flows. |
| **Evidence needed** | Inngest event catalog; whether this is emitted in prod or reserved for migration. |

---

### 1.4 `comms/whatsapp.received.v2`

| Field | Detail |
|--------|--------|
| **In-repo producer** | **None found.** |
| **External / unknown** | **Yes.** [inngest.ts](../../supabase/functions/_shared/inngest.ts) deprecates in favor of `client/whatsapp.inbound.v1`. |
| **Subscriber(s)** | `whatsappOrchestratorFunction` ([whatsappOrchestrator.ts](../../supabase/functions/inngest/functions/whatsappOrchestrator.ts)) — **not** triage. |
| **Classification** | **Ambiguous** — could be legacy mobile/app path or never-wired scaffold ([internal planning note](../updated%20dcs/gemini/CODING%20EXECUTION%20MASTERPLAN.md) references scaffolding — **historical doc, not proof**). `qa_runner` **intentionally does not** send this event. |
| **Evidence needed** | Inngest metrics for this event name; any external app config pointing here. |

---

### 1.5 `client/whatsapp.inbound.v1`

| Field | Detail |
|--------|--------|
| **In-repo producer** | **None found** (`CLIENT_WHATSAPP_INBOUND_V1_EVENT`). |
| **External / unknown** | **Yes** — canonical name per comments; **no** Edge function in this repo emits it. |
| **Subscriber(s)** | `whatsappOrchestratorFunction` (same as `.v2`). |
| **Classification** | **Ambiguous** — may be the **intended** future client WhatsApp path; zero repo sends means **cannot** retire `whatsappOrchestrator` or assume traffic. |
| **Evidence needed** | Production/mobile Twilio or app integration checklist; whether emits use this event yet. |

---

## 2. Contrast: in-repo–mapped ingress (not ambiguous)

These are **not** the focus of this map but clarify boundaries:

| Event | In-repo producer | Subscriber |
|-------|------------------|------------|
| `comms/web.received` | ~~`webhook-web`~~ **Retired emit** (410 `web_pre_ingress_retired`) | ~~`triageFunction`~~ **removed** |
| `inbox/thread.requires_triage.v1` | `processGmailDeltaSync` (and harnesses) | `processInboxThreadRequiresTriage` |
| `operator/whatsapp.inbound.v1` | `webhook-whatsapp/index.ts` | `operatorOrchestratorFunction` (**operator lane**, distinct from client WhatsApp events above) |
| `ai/orchestrator.client.v1` (shadow) | Post-ingest dispatch when shadow env enabled | `clientOrchestratorV1Function` |

---

## 3. What must be confirmed **outside the repo** before future D2/D3 retirement

Per [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) Gate 3 / [D1 §5](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md):

1. **Inngest Cloud (per environment):** Full list of apps/sources that emit each ambiguous event; last-seen timestamps; volume.
2. **Email:** Which provider webhook (if any) targets Supabase/Inngest for `comms/email.received`, or whether email is handled outside this project.
3. **WhatsApp (client):** Twilio Console / Meta — which callback URLs and which event names are configured for customer-facing WhatsApp vs operator lane (`webhook-whatsapp` is **operator-only** in code comments).
4. **Other deploys:** Whether duplicate Supabase projects or branches emit the same event names.
5. **Runbooks:** On-call expectations if an event is retired — **no** worker unregister until (1)–(4) show zero production dependency.

---

## 4. What must be confirmed **outside the repo** before future live cutover confidence

Per [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) Rollout Gates / [CUT1](CUT1_NARROW_LIVE_CUTOVER_CANDIDATE_REVIEW.md):

1. **Traffic shape:** What fraction of real client volume arrives via **mapped** paths (`comms/web.received`) vs **unmapped** (`comms/email.received`, WhatsApp variants) — cutover plans must not assume web-only.
2. **B3 / shadow evidence:** Logs and gold-set comparisons **in production-like conditions**, not only repo QA.
3. **Orchestrator outcomes:** Draft / approval / escalation rates vs legacy for the **same** ingress class — CUT2 was rolled back when `auto` did not replace concierge outcomes.
4. **Rollback:** Env and Inngest replay behavior documented; no reliance on unmapped ingress for critical alerts.

---

## 5. Likely upstream systems (repo clues only — **not** assertions)

| Event | Clue (non-definitive) |
|-------|------------------------|
| `comms/email.received` | Architecture docs describe inbound email → triage; typical pattern is **email provider → HTTP → Inngest**. No provider named in repo config. |
| `comms/whatsapp.received` / legacy operator variants | **Twilio**-style naming appears in `webhook-whatsapp` (operator lane uses Twilio); **client** legacy events may share provider history — **not** proven same pipeline. |
| `comms/whatsapp.received.v2` / `client/whatsapp.inbound.v1` | Comments suggest **mobile/app** or **future canonical** client lane; **no** producer in repo. |

---

## 6. Summary table

| Bucket | Items |
|--------|--------|
| **Safe to keep (do not retire on repo evidence alone)** | **`internalConciergeFunction`**, **`whatsappOrchestratorFunction`**, **`legacy-whatsapp-ingress`**, **`processInboxThreadRequiresTriage`**. Unmapped ingress does **not** imply dead code for channels still in the contract. |
| **Needs external confirmation** | **`comms/email.received`**, **`comms/whatsapp.received`**, **`operator/whatsapp.legacy.received`**, **`comms/whatsapp.received.v2`**, **`client/whatsapp.inbound.v1`** — see §1. |
| **Likely retirement candidate later** | **None identified from repository alone** (matches [D1 §3.2](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md)). Revisit only after Inngest + provider evidence shows zero live emits and a replacement path exists. |

---

## 7. Cross-references

- [PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md) — method, producer table, retirement classification.
- [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) — operational preconditions, rollout gates, RET1–RET3 ordering.
- [POST_V3_CLEANUP_PHASE2_ROADMAP.md](POST_V3_CLEANUP_PHASE2_ROADMAP.md) — parity / shadow / cutover sequencing.
- [CUT1_NARROW_LIVE_CUTOVER_CANDIDATE_REVIEW.md](CUT1_NARROW_LIVE_CUTOVER_CANDIDATE_REVIEW.md) — first candidate path and evidence gates.

**Document status:** Unknowns are **explicit**; **no** external truth is stated as confirmed unless backed by a cited system outside this file’s scope.
