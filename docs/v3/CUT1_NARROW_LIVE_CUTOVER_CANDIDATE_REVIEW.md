# CUT1 — Narrow live V3 cutover candidate review

**Slice:** Planning / analysis only — **no routing changes**, no worker removal, no runtime implementation (per [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) CUT1).

**Baseline repo truth (this review):**

- Legacy **`ai/intent.*`** is still the **live** production path for email/web client traffic routed through `triage` (`supabase/functions/inngest/functions/triage.ts`).
- **`clientOrchestratorV1`** (`ai/orchestrator.client.v1`) is **QA / replay / optional shadow** only (`TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1`); it does **not** replace legacy dispatch in production.
- **No production live cutover** to the orchestrator is active: machine-readable hold is documented (`ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER`, reason `C2_HOLD_REASSESSMENT_POST_A4_NOT_READY` in `triageShadowOrchestratorClientV1Gate.ts`; see [POST_V3_CLEANUP_PHASE2_ROADMAP.md](POST_V3_CLEANUP_PHASE2_ROADMAP.md) §C2).
- An **earlier narrow web-widget live cutover was rolled back**; the roadmap records that orchestrator behavior was **not** yet a full live replacement for the legacy path.

---

## 1. Candidates considered

### A. Web widget — known-wedding fast path

**What it is in code:** `comms/web.received` where deterministic identity already resolves a `weddingId` (`isWebWidget && identity.weddingId`). `triage` then creates thread + message and dispatches **`ai/intent.concierge`** only — **no** LLM intent classification step on this branch (`triage.ts` “Web widget fast-path”).

**In-repo ingress:** `webhook-web` → `comms/web.received` ([PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md)).

| Dimension | Assessment |
|-----------|------------|
| **Why attractive** | **Smallest bounded surface:** single downstream intent (concierge), known wedding + tenant resolution, deterministic routing. Matches [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) “preferred candidate shape” (known-wedding, message-oriented, likely `send_message` / draft handoff). Easy to describe and gate in CUT2 (one `if` branch). |
| **Why risky** | This is the **same class of path** that **failed** a prior narrow cutover attempt (roadmap + plan). Risk of **no user-visible outcome** (draft / escalation) if orchestrator still “observes” more than it **replaces** legacy concierge + persona behavior. |
| **Orchestrator sufficient today?** | **Not proven for live replacement.** A1–A4 and shadow improve parity and proposal shaping, but **live** cutover requires acceptable **end-to-end** outcomes vs legacy for *this* branch ([V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) Gate 1). |
| **B3 / A4 good enough for “first cutover”?** | **A4** strengthens read-side context and proposal signals; **B3** (gold-set / regression vs legacy) is the **gating** evidence the roadmap says must precede C2 retry. **B3 is not treated as complete** in repo docs; **shadow logs must be reviewed** before CUT2, not assumed. |

---

### B. Main email/web — known-wedding, non-intake (triage LLM path)

**What it is in code:** `comms/email.received` or `comms/web.received` **without** the web fast-path early return — `triage` runs **intent classification**, **stage gate**, optional **matchmaker**, then dispatches one of **`ai/intent.concierge` | commercial | logistics | project_management | studio | intake** as enforced.

**In-repo ingress:** `comms/web.received` local producer exists; **`comms/email.received` has no in-repo `inngest.send`** ([PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md](PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md)) — production email ingress may be **external or unmapped**; operational risk for any email cutover.

| Dimension | Assessment |
|-----------|------------|
| **Why attractive** | Covers **most** production email/web volume; eventual CUT4 must address this class. |
| **Why risky** | **Larger blast radius** (multiple intents, stage enforcement, unfiled paths). Email ingress **ambiguous** in repo. **Wrong first cutover:** harder to debug and rollback than a single branch. |
| **Orchestrator sufficient today?** | **No** — orchestrator would need parity across **several** specialist semantics; not the minimal first step. |
| **B3 / A4** | A4 helps; B3 must be **per-intent** or stratified — **not** a single fast-path compare. **Poor fit as CUT2 first candidate.** |

---

### C. Intake (`ai/intent.intake`)

**What it is:** Stage-gated **new-lead** path; `triage` dispatches `ai/intent.intake` for appropriate stages; **no** shadow fanout to orchestrator for intake (`triage` shadow step skips `intent === "intake"`).

| Dimension | Assessment |
|-----------|------------|
| **Why attractive** | High business value funnel. |
| **Why risky** | [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) **non-goal:** intake need not move immediately; [POST_V3_CLEANUP_PHASE2_ROADMAP.md](POST_V3_CLEANUP_PHASE2_ROADMAP.md) §C4 says do not force intake into orchestrator. **Different product/risk profile** than client reply orchestration. |
| **Verdict** | **Reject / defer** for first live V3 client-orchestrator cutover. |

---

### D. Operator WhatsApp (`operator/whatsapp.inbound.v1` → `operatorOrchestrator`)

**What it is:** `webhook-whatsapp` emits **operator lane only**; **not** `triage` client email/web. Client orchestrator is **email/web**-scoped in the hybrid story.

| Dimension | Assessment |
|-----------|------------|
| **Why attractive** | N/A for **client** V3 cutover — wrong domain. |
| **Why risky** | Merges security model, Ana/operator tooling, and Twilio constraints; [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) explicitly **not** operator WhatsApp for first candidate. |
| **Verdict** | **Reject / defer** for CUT1’s **client** `ai/orchestrator.client.v1` cutover. (Operator lane remains separate.) |

---

## 2. Recommendation — exactly one first live cutover candidate

**Designated first candidate (for CUT2 when eligible):**  
**Web widget — known-wedding fast path** (branch: `isWebWidget && identity.weddingId` → `ai/intent.concierge` today).

**Eligibility today:** **Not ready.** The recommended **path** is the **narrowest** and best-aligned with the full-cutover plan’s “bounded client-reply” shape, but **CUT2 must not ship** until the evidence and gates below are met. This matches [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md): *“choose safety … until evidence improves”* and *do not choose by guesswork*.

---

## 3. Rejected / deferred (explicit)

| Candidate | Disposition | Reason |
|-----------|-------------|--------|
| Main email/web triage path (multi-intent) | **Defer** (after web path proves stable) | Higher complexity; email ingress not fully mapped in repo (D1). |
| Intake | **Reject** for first cutover | Explicitly out of scope for first client orchestrator activation per V3 + Phase 2. |
| Operator WhatsApp | **Reject** for this cutover line | Different ingress, worker, and product surface; not `clientOrchestratorV1`. |
| Unfiled / no wedding | **Defer** | Higher ambiguity; not “known-wedding bounded.” |
| `comms/email.received` as first CUT2 target | **Defer** | Producer not visible in repo; operational mapping required first. |

---

## 4. Minimum evidence required before CUT2 (for the chosen candidate)

All should be satisfied before an **env-gated** narrow live cutover ([V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) CUT2, Gate 1):

1. **B3 / shadow evidence:** For **web widget known-wedding** traffic with shadow enabled, `[orchestrator.shadow.compare]` (or equivalent) shows orchestrator outcomes **not materially weaker** than legacy for the same turns (draft / block / ask / escalation classes — not “silent no-op”).
2. **User-visible outcome:** Normal case produces an **acceptable** outcome class — e.g. **draft for approval** or **documented block/escalation** — consistent with [V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) activation criteria (no silent replacement of legacy behavior).
3. **Replay/QA:** B1/B2-style runs for this path pass stable assertions (draft when expected, no accidental auto-send).
4. **Rollback:** One env toggle returns **100%** legacy dispatch for this branch without deploy dependency if possible ([V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md) Rollback).
5. **D1 awareness:** No conflict with unmapped ingress for the **same** event family (`comms/web.received` is in-repo; confirm production matches).

---

## 5. Immediate disqualifiers (do not run CUT2 yet)

Proceeding would be **unsafe** if any of the following hold for the **candidate branch**:

- Orchestrator path shows **high rate of no draft / no escalation / no operator-visible artifact** for the **normal** concierge-like reply while legacy would yield a **draft or clear next step**.
- **Verifier / policy block** or **escalation** rates are **wildly misaligned** vs legacy on the gold set (B3).
- **Tenant-safety** or **approval/outbound** regressions appear in shadow or staging.
- **C2 hold** reasons in code are still the authoritative “no live cutover” state **without** a new reviewed decision record superseding them.

---

## 6. Honest status label

Until CUT2 succeeds in production and CUT4 broadens:

- **V3 implemented, hybrid runtime** ([V3_FULL_CUTOVER_PLAN.md](V3_FULL_CUTOVER_PLAN.md)).

**CUT1 outcome:** One **named** first candidate (**web widget known-wedding fast path**), explicitly **not eligible** for live routing until evidence gates pass; all other near-term candidates **rejected or deferred** with reasons above.
