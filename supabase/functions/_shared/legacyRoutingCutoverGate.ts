/**
 * **Canonical “do not remove pre-ingress routing yet” guard** — Step 12D + orchestrator decommission formalization.
 *
 * ### What is done vs retained
 *
 * - **Post-ingest Gmail/thread cleanup (decommission prep)** is complete in code: bounded flags, dispatch observability,
 *   `postIngestThreadDispatch`, legacy gate quarantine, intake post-bootstrap observability, pre-ingress source logs,
 *   and retirement readiness audit (`legacyRoutingRetirementReadiness.ts`, `[triage.legacy_retirement_readiness]`).
 * - **Pre-ingress web (execution Slice A):** `webhook-web` **no longer** emits `comms/web.received` (410 `web_pre_ingress_retired`).
 * - **Pre-ingress routing is intentionally retained** until product/ops explicitly retires it. Do **not** delete
 *   `triage.ts`, unregister `triageFunction`, or drop `comms/email.received` / `comms/web.received` support in a
 *   drive-by cleanup PR.
 *
 * ### Current retirement blockers (explicit, post Slice B)
 *
 * 1. **`triageFunction` remains registered** in `supabase/functions/inngest/index.ts` (not accidental).
 * 2. ~~In-repo web emitter~~ **Retired** — `webhook-web` does not emit `comms/web.received`.
 * 3. **Email pre-ingress — last unresolved pre-ingress question:** no in-repo emitter observed for `comms/email.received`;
 *    **external producers are not ruled out** — the consumer on `triage` stays until that is proven. **Do not** run a
 *    final deletion/unregister PR until this producer question is resolved (plus WhatsApp ingress and coordinated cutover).
 *
 * ### Runtime flag
 *
 * **`LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA`** stays `true` until Step 12C replay/stress exit criteria
 * **and** the pre-ingress blockers above are resolved in an explicit change set together with routing/unregister work.
 *
 * Search: `LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA`, `LEGACY_PRE_INGRESS_ROUTING_RETENTION_STATUS_SUMMARY`.
 */
export const LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA = true as const;

/**
 * Single-line, stable summary for logs/docs greps — **not** a runtime switch (see `LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA`).
 * After web pre-ingress retirement: **primary remaining pre-ingress blocker** is external `comms/email.received` proof + unregister.
 */
export const LEGACY_PRE_INGRESS_ROUTING_RETENTION_STATUS_SUMMARY =
  "pre_ingress_retained_email_external_producer_unresolved_pending_unregister" as const;

export type LegacyRoutingRetentionGate =
  typeof LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA;
