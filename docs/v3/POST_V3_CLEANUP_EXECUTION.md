# POST-V3 CLEANUP EXECUTION

## Purpose

This document turns `POST_V3_CLEANUP_AUDIT.md` into a safe execution order.

Do **not** try to fix the whole audit in one run.

Why:

- several findings are **runtime compatibility** bugs
- several others are **security hardening** tasks
- several others are **strangler cleanup / cutover** tasks
- deleting or rewiring legacy workers too early can break live flows

The right approach is:

1. fix active correctness and security bugs first
2. harden remaining legacy paths that are still live
3. only then retire old routing and workers

## Orchestrator decommission prep — dual paths (formalized)

After the orchestrator decommission prep slices (`docs/v3/ORCHESTRATOR_DECOMMISSION_SLICE_ROADMAP.md`) **and the final pre-ingress retirement PR**, the codebase has **one supported primary email/classification ingress** plus an **explicit WhatsApp legacy lane**:

| Path | Role | Notes |
|------|------|--------|
| **Post-ingest Gmail/thread** | **Sole supported primary** for email | `processGmailDeltaSync` → `inbox/thread.requires_triage.v1` → `processInboxThreadRequiresTriage`. |
| **Pre-ingress email/web** | **Retired** | `traffic-cop-triage` removed; `comms/email.received` and `comms/web.received` dropped from `AtelierEvents`. |
| **Operator WhatsApp legacy** | **Retained (narrow)** | `legacy-whatsapp-ingress` in `inngest/functions/legacyWhatsappIngress.ts` — `comms/whatsapp.received` + `operator/whatsapp.legacy.received` → `ai/intent.internal_concierge` only. **Not** email/web pre-ingress. |

**In-repo web pre-ingress:** **Retired.** `supabase/functions/webhook-web/index.ts` **does not** emit `comms/web.received`; callers receive **410 Gone** with `web_pre_ingress_retired`.

**Email pre-ingress:** **Retired** from the live Inngest contract (no served subscriber for `comms/email.received`).

**Retirement state** (machine-greppable): `LEGACY_PRE_INGRESS_ROUTING_RETIRED_STATE_SUMMARY` (`pre_ingress_routing_retired_gmail_thread_path_primary`), `LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA === false`, `legacyRoutingCutoverGate.ts`.

## Global Rules For Vibecoder

Apply these rules on every cleanup slice:

- Do not remove legacy workers just because they are legacy.
- Do not unregister anything from `supabase/functions/inngest/index.ts` unless the slice explicitly says cutover/removal.
- Do not change event names, webhook contracts, or UI flows unless the slice explicitly calls for it.
- If a worker is still live, prefer **hardening** it before deleting it.
- If a flow is production or user-facing today, preserve behavior unless the slice explicitly replaces it.
- Use tenant-safe service-role queries everywhere:
  - direct-owner tables: append `.eq("photographer_id", tenantId)`
  - indirect-owner tables: prove ownership via parent chain or explicit join
- Any client-facing outbound execution must not bypass:
  - verifier gating
  - decision mode / approval policy
  - existing approval/outbound pipeline
- Any sleeper worker that wakes after `step.sleep()` or `step.sleepUntil()` must re-query wedding pause flags immediately before drafting or sending.
- Stop after each slice. Do not continue into the next cleanup item automatically.

## Recommended Execution Order

### Slice 1 — Sleeper Safety First

Fix first because these are concrete runtime risks and easy to validate.

Targets:

- `supabase/functions/inngest/functions/calendarReminders.ts`
- `supabase/functions/inngest/functions/postWeddingFlow.ts`

Required outcomes:

- add post-wake re-query of:
  - `compassion_pause`
  - `strategic_pause`
  - `agency_cc_lock`
  - stage when applicable
- stop drafting when paused / moved / missing
- ensure `drafts.insert(...)` includes `photographer_id`

Do **not** remove the workers in this slice.

### Slice 2 — Tenant Isolation Hardening On Live Legacy Paths

Fix the known service-role leaks before worrying about cleanup/removal.

Priority targets:

- `supabase/functions/inngest/functions/internalConcierge.ts`
- `supabase/functions/inngest/functions/commercial.ts`
- `supabase/functions/inngest/functions/logistics.ts`
- `supabase/functions/inngest/functions/concierge.ts`
- `supabase/functions/inngest/functions/persona.ts`

Required outcomes:

- every service-role query is tenant-scoped
- `internalConcierge`:
  - `query_clients` must become tenant-safe
  - `query_pending_drafts` must become tenant-safe
- legacy workers that fetch by `wedding_id` should also append tenant proof where possible

Do **not** redesign the workers yet.
This slice is only about tenant isolation.

### Slice 3 — Architectural Bypass Hardening

After tenant safety, close the most dangerous bypasses.

Priority targets:

- `src/hooks/useSendMessage.ts`
- `supabase/functions/inngest/functions/persona.ts`
- `supabase/functions/inngest/functions/commercial.ts`
- `supabase/functions/inngest/functions/logistics.ts`

Required outcomes:

- no direct client-facing message send path should bypass backend policy
- no direct persona WhatsApp send without verifier / approval gating
- no raw CRM mutation if the strict tool path is meant to own it

Important:

- if a bypass cannot be safely replaced in one small slice, disable the unsafe path or convert it to draft-only behavior first
- do not attempt final cutover here

### Slice 4 — Legacy Routing Strangler Cleanup

Only do this after Slices 1–3 are complete and verified.

Targets:

- `supabase/functions/inngest/index.ts`
- `supabase/functions/inngest/functions/legacyWhatsappIngress.ts` (operator WhatsApp legacy only; pre-ingress email/web triage removed)
- legacy `ai/intent.*` workers
- legacy WhatsApp bridge paths

Required outcomes:

- cut traffic from legacy routing to V3 orchestrator / approved target paths
- remove or unregister workers only after their replacement path is proven

This is the highest-risk slice.
Do not combine it with security hardening.

## Safe Prompt Template

Use this template for each cleanup slice:

```text
Implement one narrow POST-V3 cleanup slice only. Do not continue into other audit findings.

Current baseline:
- Follow docs/v3/POST_V3_CLEANUP_AUDIT.md
- Follow docs/v3/POST_V3_CLEANUP_EXECUTION.md
- Preserve existing behavior unless this slice explicitly replaces it
- Do not remove legacy workers or routes unless this slice explicitly says to

Read first:
- the specific files named in this slice
- docs/v3/ARCHITECTURE.md
- docs/v3/DATABASE_SCHEMA.md
- POST_V3_CLEANUP_AUDIT.md
- docs/v3/POST_V3_CLEANUP_EXECUTION.md

Rules:
- make the minimum change needed
- keep tenant isolation explicit
- do not invent new architecture
- do not silently broaden scope
- stop after this slice

Deliver:
- exact files changed
- exact issue fixed
- anything still intentionally left for a later cleanup slice
```

## Recommended First Prompt

Use this first:

```text
Implement Slice 1 from docs/v3/POST_V3_CLEANUP_EXECUTION.md only.

Targets:
- supabase/functions/inngest/functions/calendarReminders.ts
- supabase/functions/inngest/functions/postWeddingFlow.ts

Fix only these issues:
1. After every sleep boundary, re-query the wedding row and stop on:
   - compassion_pause
   - strategic_pause
   - agency_cc_lock
   - missing wedding
   - invalid stage drift where applicable
2. Ensure every drafts insert in these files includes photographer_id.

Important rules:
- Do not remove these workers.
- Do not refactor unrelated logic.
- Do not change copy generation beyond the required safety gates.
- Keep this a worker-hardening slice only.
- Stop after this slice.
```

## What Not To Do

Do not ask for:

- “fix the whole audit”
- “delete all old workers”
- “cut over everything to V3 now”
- “rewrite all legacy routing”

Those prompts are too broad and are likely to cause regressions or hallucinated cleanup.

## Exit Condition

You are ready for final strangler cleanup only when:

- sleeper workers are pause-safe
- legacy service-role queries are tenant-safe
- unsafe bypasses are removed or gated
- replay / QA confirms the V3 replacement paths are stable
