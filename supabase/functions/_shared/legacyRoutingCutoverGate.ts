/**
 * execute_v3 Phase 12 Step 12D — **legacy routing retention** until replay/stress exit criteria pass.
 *
 * **Current path:** Keep `triage` dispatching `ai/intent.*` only; keep all workers registered in
 * `supabase/functions/inngest/index.ts`; do **not** remove legacy handlers or switch production
 * fan-out to `ai/orchestrator.client.v1` based on this flag alone.
 *
 * **Architecture note (post orchestrator-decommission observability slices):** The active Gmail/post-ingest
 * classifier (`processInboxThreadRequiresTriage`) is separated from this gate, but **pre-ingress** retirement
 * (`comms/email.received` / `comms/web.received` → `triage.ts`) is explicitly **not** complete — see
 * `[triage.legacy_retirement_readiness]` logs and `legacyRoutingRetirementReadiness.ts`.
 *
 * **Cutover (later, explicit phase):** When Step 12C replay and stress tests are green in CI/ops,
 * change this gate and the routing implementation **in the same change set** — never flip the
 * flag without the corresponding triage/orchestrator wiring.
 *
 * Search the repo for `LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA` when planning removal.
 */
export const LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA = true as const;

export type LegacyRoutingRetentionGate =
  typeof LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA;
