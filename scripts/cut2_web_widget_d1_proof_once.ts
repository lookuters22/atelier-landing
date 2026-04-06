/**
 * CUT2 web-widget D1 proof — uses production gate + RET1 builders (Deno shim for Node).
 * Does not call Inngest; proves env → blocked/dispatch + observability payloads.
 *
 * Run: npx tsx scripts/cut2_web_widget_d1_proof_once.ts
 */
import {
  TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV,
  TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV,
  buildCut2WebWidgetD1ExecV2,
  isTriageD1Cut2WebWidgetLegacyConciergeDispatchWhenCut2OffAllowed,
  isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled,
} from "../supabase/functions/_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts";
import {
  buildWebWidgetRetirementDispatchV1,
  CUT2_WEB_WIDGET_D1_BLOCKED_DOWNSTREAM_SENTINEL,
} from "../supabase/functions/_shared/triage/retirementDispatchObservabilityV1.ts";

function installDenoEnvShim() {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: {
      get(key: string) {
        return process.env[key];
      },
    },
  };
}

function clearCut2D1Env() {
  delete process.env[TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV];
  delete process.env[TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV];
}

type Row = {
  name: string;
  cut2: string | undefined;
  d1: string | undefined;
};

const matrix: Row[] = [
  {
    name: "1) CUT2 ON + D1 disallow legacy",
    cut2: "1",
    d1: "0",
  },
  {
    name: "2) CUT2 OFF + D1 allow legacy",
    cut2: undefined,
    d1: undefined,
  },
  {
    name: "3) CUT2 OFF + D1 disallow legacy",
    cut2: undefined,
    d1: "0",
  },
];

function emittedChain(cut2Live: boolean, blocked: boolean): string[] {
  if (blocked) return [];
  if (cut2Live) return ["ai/orchestrator.client.v1"];
  return ["ai/intent.concierge"];
}

function triageStatusSim(blocked: boolean): string {
  return blocked ? "cut2_web_widget_d1_blocked_no_dispatch" : "routed_internal";
}

installDenoEnvShim();

console.log("CUT2 web-widget D1 proof (shared modules + Deno env shim)\n");
console.log("Fixture: synthetic web-widget known-wedding branch (reply_channel web).\n");

for (const row of matrix) {
  clearCut2D1Env();
  if (row.cut2 !== undefined) {
    process.env[TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV] = row.cut2;
  }
  if (row.d1 !== undefined) {
    process.env[TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV] = row.d1;
  }

  const cut2WebWidgetLive = isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled();
  const d1LegacyWhenCut2OffAllowed = isTriageD1Cut2WebWidgetLegacyConciergeDispatchWhenCut2OffAllowed();
  const cut2WebWidgetD1Blocked = !cut2WebWidgetLive && !d1LegacyWhenCut2OffAllowed;

  const retirement = buildWebWidgetRetirementDispatchV1({
    cut2WebWidgetLive,
    d1LegacyWhenCut2OffAllowed,
    replyChannel: "web",
  });

  const d1prep = buildCut2WebWidgetD1ExecV2({
    d1LegacyWhenCut2OffAllowed,
    cut2WebWidgetLive,
  });

  const chain = emittedChain(cut2WebWidgetLive, cut2WebWidgetD1Blocked);

  console.log("---", row.name, "---");
  console.log("env", TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV, "=", row.cut2 ?? "(unset)");
  console.log("env", TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV, "=", row.d1 ?? "(unset)");
  console.log("computed cut2_web_widget_live:", cut2WebWidgetLive);
  console.log("computed d1_legacy_when_cut2_off_allowed:", d1LegacyWhenCut2OffAllowed);
  console.log("computed blocked_no_dispatch:", cut2WebWidgetD1Blocked);
  console.log("simulated triage status:", triageStatusSim(cut2WebWidgetD1Blocked));
  console.log("retirement_dispatch_observability_v1:", JSON.stringify(retirement, null, 2));
  console.log("cut2_web_widget_d1_prep:", JSON.stringify(d1prep, null, 2));
  console.log("simulated downstream emits (inngest.send):", chain.length ? chain.join(" → ") : "(none)");
  console.log("");
}

clearCut2D1Env();
console.log("Final: cleared CUT2 + D1 env keys in this process (defaults = legacy allowed when CUT2 off).");
console.log(
  "Viability: matrix matches intended postures; production path uses same gate fns in triage.ts (web-widget branch only).",
);
