/**
 * Observation-only: after legacy intake bootstrap, emit `ai/orchestrator.client.v1` for parity vs persona.
 * Default **off** (`1` / `true` enables). Does not replace live `ai/intent.persona` handoff.
 *
 * Env: INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1
 */
export const INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1_ENV =
  "INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1" as const;

export function isIntakeShadowOrchestratorPostBootstrapEnabled(): boolean {
  const v = Deno.env.get(INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1_ENV);
  return v === "1" || v === "true";
}
