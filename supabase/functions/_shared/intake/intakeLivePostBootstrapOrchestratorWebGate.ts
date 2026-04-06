/**
 * Optional hook when `ai/intent.intake` carries `reply_channel === "web"` (dashboard web ingress shape).
 *
 * **Not a client-intake migration target:** in this product, **client intake is email**. Dashboard web chat is
 * photographer ↔ Ana (AI manager), not end-client lead capture — see `docs/v3/INTAKE_MIGRATION_POST_CUT8_SLICE.md` §0.
 * Prefer leaving this gate **off**; do not roadmap “web client intake.”
 *
 * Default **off** (`1` / `true` enables). Rollback: unset or falsy.
 *
 * Env: INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_WEB_V1
 */
export const INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_WEB_V1_ENV =
  "INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_WEB_V1" as const;

export function isIntakeLiveOrchestratorPostBootstrapWebEnabled(): boolean {
  const v = Deno.env.get(INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_WEB_V1_ENV);
  return v === "1" || v === "true";
}
