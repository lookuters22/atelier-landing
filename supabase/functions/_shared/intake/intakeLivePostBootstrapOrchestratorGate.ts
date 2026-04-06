/**
 * Narrow live cutover: after intake bootstrap, **`ai/orchestrator.client.v1`** is the reply draft path
 * (email + `draft_only` only) instead of **`ai/intent.persona`** for that turn.
 *
 * Subset: explicit **`reply_channel === "email"`** only — not web, not WhatsApp.
 * Default **off** (`1` / `true` enables). Rollback: unset or falsy.
 *
 * Env: INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1
 */
export const INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1_ENV =
  "INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1" as const;

export function isIntakeLiveOrchestratorPostBootstrapEmailEnabled(): boolean {
  const v = Deno.env.get(INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1_ENV);
  return v === "1" || v === "true";
}
