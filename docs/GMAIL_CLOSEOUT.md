# Gmail closeout (April 2026)

This document records the **Gmail-focused slice** closeout: remaining gaps, **“Gmail done enough”** criteria, and what to do next app-wide.

## Bounded closeout improvement shipped

- **Server + UI run-health rollup** for Gmail repair workers (`computeGmailRepairWorkerRunHealth` → `run_health` on `gmail-repair-ops`, badge on `GmailRepairOpsPanel`).
- **Tests** in `supabase/functions/_shared/gmail/gmailRepairWorkerOps.test.ts` for run-health cases.

## Remaining Gmail-specific gap inventory

Classifications are **Gmail-only** (not general product backlog).

### Blockers (none assumed for “done enough”)

- None identified that would require another deep Gmail refactor. If any appear in prod (e.g. sustained `rpc_error` / `partial_failure` on repair workers with no recovery path), treat as **incident** and fix under normal ops, not as an open “Gmail vNext”.

### Worthwhile follow-ups

- **Telemetry dashboards / alerts**: Wire saved views or alerts on `a4_worker_op_latency_v1`, `gmail_materialize_fallback_substep_v1`, `gmail_import_materialize_attachment_substep_v1`, `gmail_inline_html_repair_batch_v1`, `gmail_import_candidate_artifact_inline_html_repair_batch_v1` (thresholds and ownership are ops-specific; code emits payloads).
- **Repair ops**: If `run_health` is often `unknown` in production, consider surfacing **why** (e.g. first deploy, never scheduled) without expanding scope.
- **Regression tests**: Spot-check additional cases for **materialize idempotency** and **inline HTML repair** if those areas change again; current coverage is bounded to shared helpers where tests exist.

### Optional polish

- Copy tweaks on `GmailRepairOpsPanel` (tooltips linking to log query examples).
- Deeper linking from panel rows to **exact** log filters (if log backend supports stable deep links).

## “Gmail done enough” — stop conditions

Work on **Gmail-focused slices** can stop when all of the following hold:

### Backlog state

- **Repair workers**: Backlog estimates trend to **zero** for both worker keys (`messages_inline_html`, `import_candidate_artifact`) when not intentionally paused, **or** remaining rows are understood (idempotent skips / legacy edge cases) and documented in run notes.
- **Import / approval**: No stuck **async group approval** states in production without a known workaround; chunked workers drain expected queues.

### Telemetry health

- No sustained anomaly on the Gmail events above (spikes investigated; no silent absence of events when workers should run).
- `gmail_materialize_fallback_substep_v1` and attachment substeps are **not** dominating latency or error budgets without explanation.

### Ops surface health

- `GmailRepairOpsPanel` (when enabled) shows **consistent** `run_health` with manual spot-checks against logs.
- Pause / run-once / backlog reads behave as documented; `GMAIL_REPAIR_OPS_ALLOWED_PHOTOGRAPHER_IDS` and `VITE_GMAIL_REPAIR_OPS_ENABLED` are set correctly in each environment.

### Remaining tolerated legacy compatibility

- **Pre-repair inline HTML** may still exist in cold storage until repair batches pass; operators accept **eventual consistency** for legacy messages.
- **Idempotent no-ops** (scanned > 0, migrated 0) may appear; warnings in ops + logs are the contract, not “zero scanned forever”.

## Can Gmail be considered effectively complete?

**Yes**, for **feature/arc completion**: async approvals, chunk/worker tuning, cold-path reductions, attachment idempotency, HTML/repair hardening, repair workers, and ops visibility are in place; this closeout adds a **single rollup signal** plus tests.

Ongoing **monitoring and incident response** are normal product ops, not an open “Gmail rebuild”.

## Suggested next app-wide slice (after Gmail)

Pick one aligned with your roadmap (examples):

- **V3 orchestration / RBAC / audience** hardening and proof harnesses (already parallel tracks in `docs/v3/`).
- **Operator WhatsApp** or **unified action model** if messaging surface is the next bottleneck.
- **Security hardening** slices if compliance is the priority.

Close Gmail as a **theme**; sequence the next slice by **business risk** (revenue, trust, or operator load), not by residual Gmail TODOs.
