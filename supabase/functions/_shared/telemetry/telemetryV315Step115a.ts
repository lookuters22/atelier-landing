/**
 * execute_v3 Phase 11.5 Steps 11.5A–11.5B — structured telemetry for **`blocks_by_verifier`**.
 *
 * Step 11.5B: photographer, thread, wedding when known, risk class when applicable, plus `source_event`
 * for the worker/Inngest entrypoint — **not** `playbook_rules.action_key` (use DB or separate fields for that).
 */

export type VerifierBlockTelemetryAttribution = {
  thread_id?: string | null;
  wedding_id?: string | null;
  /**
   * Worker / Inngest event that invoked the verifier (e.g. `ai/orchestrator.client.v1`).
   * Not a playbook `action_key`.
   */
  source_event?: string | null;
  /** When applicable — audience / broadcast risk tier for this verification. */
  risk_class?: string | null;
};

export type BlocksByVerifierTelemetry = VerifierBlockTelemetryAttribution & {
  metric: "blocks_by_verifier";
  rule_id: string;
  photographer_id: string;
  broadcast_risk: string;
  requested_execution_mode: string;
};

/** Stable envelope so queries can filter `v315_telemetry` without matching unrelated JSON logs. */
export function logBlocksByVerifier(ev: BlocksByVerifierTelemetry): void {
  console.log(
    JSON.stringify({
      v315_telemetry: true,
      ...ev,
    }),
  );
}
