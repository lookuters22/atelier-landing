/**
 * **Pre-ingress email/web retirement — Step 12D formalization (complete).**
 *
 * ### What is retired vs primary
 *
 * - **Post-ingest Gmail/thread** remains the **sole supported primary** ingress for email/classification:
 *   `processGmailDeltaSync` → `inbox/thread.requires_triage.v1` → `processInboxThreadRequiresTriage`.
 * - **Pre-ingress email/web** (`comms/email.received`, `comms/web.received`) is **retired** from the live Inngest contract:
 *   `traffic-cop-triage` was removed; `AtelierEvents` no longer lists those event names.
 * - **Pre-ingress web emitter:** `webhook-web` does not emit `comms/web.received` (410 `web_pre_ingress_retired`).
 * - **WhatsApp (operator legacy)** is **not** email/web pre-ingress: `legacy-whatsapp-ingress` still handles
 *   `comms/whatsapp.received` + `operator/whatsapp.legacy.received` → `ai/intent.internal_concierge` only.
 *
 * ### Runtime flag
 *
 * **`LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA`** is `false` now that pre-ingress email/web routing
 * and the shared event contract have been updated in the same change set as unregister work.
 *
 * Search: `LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA`, `LEGACY_PRE_INGRESS_ROUTING_RETIRED_STATE_SUMMARY`.
 */
export const LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA = false as const;

/**
 * Single-line, stable summary for logs/docs greps — **not** a runtime switch
 * (see `LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA`).
 */
export const LEGACY_PRE_INGRESS_ROUTING_RETIRED_STATE_SUMMARY =
  "pre_ingress_routing_retired_gmail_thread_path_primary" as const;

export type LegacyRoutingRetentionGate = typeof LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA;
