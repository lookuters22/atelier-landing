/**
 * Inngest API endpoint for Supabase Edge Functions.
 * Register this URL in Inngest Cloud (GET/PUT/POST for sync + invoke).
 *
 * ## Hosted Supabase — required secrets (project → Edge Functions → Secrets)
 * - `INNGEST_SIGNING_KEY` — Inngest Cloud → signing key for this environment (validates sync + invokes).
 * - `INNGEST_EVENT_KEY` — Event API key (used by `gmail-enqueue-label-sync` and other emitters; must match app `atelier-os`).
 * - `INNGEST_ALLOW_IN_BAND_SYNC=1` — strongly recommended so Cloud sync registers the full function bundle (see #1929 below).
 * - **Gmail validation (temporary):** `GMAIL_IMPORT_CANDIDATE_MATERIALIZATION_LANE_DISABLED=1` — skips G2 prepare handler + backfill cron + label-sync prepare enqueue (`gmailMaterializationLanePause.ts`). Does not disable delta sync.
 * - **Gmail repair crons (A2):** `GMAIL_INLINE_HTML_REPAIR_DISABLED=1`, `GMAIL_IMPORT_CANDIDATE_ARTIFACT_HTML_REPAIR_DISABLED=1`, or set `gmail_repair_worker_state.paused=true` per worker (`gmailRepairWorkerOps.ts`).
 * - Optional: `INNGEST_SERVE_HOST` — set to `https://<project-ref>.supabase.co` if the sync URL is rewritten (edge-runtime) and functions are missing.
 *
 * ## Post-deploy verification (Inngest Cloud)
 * 1. Apps → Sync URL must be `https://<project-ref>.supabase.co/functions/v1/inngest` (PUT/GET for sync).
 * 2. After sync, Functions includes `sync-gmail-label-import-candidates` with trigger `import/gmail.label_sync.v1`.
 * 3. Send a test event or enqueue from Settings; Runs should show an execution for that function.
 *
 * **Supabase Edge:** set project secret `INNGEST_ALLOW_IN_BAND_SYNC=1` so Inngest Cloud sync picks up the
 * full `serve()` function list (avoids “event accepted, no functions triggered” for triggers like
 * `ai/orchestrator.client.v1`). See https://github.com/inngest/inngest/issues/1929#issuecomment-2474770494
 *
 * Temporary ops stabilization (2026-04-15): Gmail import-candidate materialization and legacy HTML repair workers
 * are intentionally unregistered from the live bundle so cron/sweeper runs stop consuming resources while the
 * visibility-first inbound path is validated. Re-register only after the old lane is no longer used for live mail.
 *
 * **Inngest Cloud UI vs deployed bundle:** The Edge `serve()` list is the source of truth. After deploy, run
 * `npm run inngest:verify-serve` — `function_count` must match the `functions` array length (see script constant).
 * If Inngest Cloud still shows removed workers, verify Dashboard **Sync URL** = this project's
 * `https://<ref>.supabase.co/functions/v1/inngest`, app **atelier-os**, **Production** env, and `INNGEST_ALLOW_IN_BAND_SYNC=1`.
 *
 * `clientOrchestratorV1Function` (`ai/orchestrator.client.v1`): QA/replay; optional **shadow** from Gmail/thread post-ingest
 * routing (`processInboxThreadRequiresTriage` / `runMainPathEmailDispatch`). **Pre-ingress `traffic-cop-triage` retired**
 * — the old web-widget **CUT2** orchestrator surface (envs, event correlation fields, live observation branch) is **removed**
 * from code (Slice 8); pre-ingress web is not a live producer. Historical: `docs/v3/CUT2_WEB_WIDGET_D1_PREP_SLICE.md`.
 * Optional **CUT4** live for main-path concierge + known wedding (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1`)
 * on **`inbox/thread.requires_triage.v1`**; **CUT4 D1:** `TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1`;
 * `cut4_main_path_concierge_d1_prep` v2 (`docs/v3/CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`).
 * **CUT5 D1:** `TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1`; `cut5_main_path_project_management_d1_prep` v2
 * (`docs/v3/CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`).
 * Optional **CUT5** live for main-path project_management + known wedding
 * (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1`); optional **CUT6** live for main-path
 * logistics + known wedding (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1`);
 * **CUT6 D1:** `TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1`; `cut6_main_path_logistics_d1_prep` v2 (`docs/v3/CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md`).
 * Optional **CUT7** live for main-path commercial + known wedding (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1`);
 * **CUT7 D1:** `TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1`; `cut7_main_path_commercial_d1_prep` v2 (`docs/v3/CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`).
 * Optional **CUT8** live for main-path studio + known wedding (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1`);
 * **CUT8 D1:** `TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1`; `cut8_main_path_studio_d1_prep` v2 (`docs/v3/CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`).
 * Optional **intake post-bootstrap parity** (`INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1`) — observation-only
 * `ai/orchestrator.client.v1` after lead bootstrap; legacy `ai/intent.persona` remains live.
 * Optional **intake post-bootstrap live email** (`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1` + explicit email
 * reply_channel) — `draft_only` orchestrator replaces persona that turn (no duplicate parity send).
 * Optional **intake + web reply_channel hook** (`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_WEB_V1`) — not a client-intake
 * migration target (dashboard web = photographer ↔ Ana). Client intake live path is email gate only.
 * All other live email/web remains legacy `ai/intent.*`.
 *
 * **Legacy email/web specialist workers** (post-ingest dispatch `INTENT_EVENT_MAP` in `postIngestThreadDispatch` +
 * `ai/intent.concierge` where applicable): `concierge`, `logistics`, `commercial`, `projectManager`, `studio`, `intake`
 * — remain registered until evidence proves post-ingest routing no longer dispatches their event for supported paths;
 * CUT4–CUT8 gates **off** = rollback to these workers. Inventory: `docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`.
 * **RET1 telemetry (historical):** planned `retirement_dispatch_observability_v1` + `[triage.retirement_dispatch_v1]` lived in
 * pre-ingress `triage.ts` work; **`retirementDispatchObservabilityV1.ts` was removed** (Slice 9) with **no replacement** in the current
 * runtime — see §5 in `docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md` for the archived spec only. **Do not** grep production for
 * that prefix as a current signal.
 *
 * **Phase 2 Slice D1 (retirement prep):** Producer/ingress audit — no workers removed; see
 * `docs/v3/PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md`. **RET2 unregister-readiness** (legacy `ai/intent.*` only):
 * `docs/v3/RET2_UNREGISTER_READINESS_AUDIT.md` — no unregister in that audit slice.
 * **RET2 pilot:** `docs/v3/RET2_PILOT_CANDIDATE_SELECTION.md` — runbook references historical RET1 rollup tooling where applicable. Unregister only after D2 execution
 * with proven-dead paths per worker.
 */
import { serve } from "npm:inngest@3/edge";
import { inngest } from "../_shared/inngest.ts";
import { LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA } from "../_shared/legacyRoutingCutoverGate.ts";
import { legacyWhatsappIngressFunction } from "./functions/legacyWhatsappIngress.ts";
import { intakeFunction } from "./functions/intake.ts";
import { outboundFunction } from "./functions/outbound.ts";
import { rewriteFunction } from "./functions/rewrite.ts";
import { conciergeFunction } from "./functions/concierge.ts";
import { logisticsFunction } from "./functions/logistics.ts";
import { commercialFunction } from "./functions/commercial.ts";
import { projectManagerFunction } from "./functions/projectManager.ts";
import { studioFunction } from "./functions/studio.ts";
import { personaFunction } from "./functions/persona.ts";
import { internalConciergeFunction } from "./functions/internalConcierge.ts";
import { whatsappOrchestratorFunction } from "./functions/whatsappOrchestrator.ts";
import { calendarRemindersFunction } from "./functions/calendarReminders.ts";
import { contractFollowupFunction } from "./functions/milestoneFollowups.ts";
import { prepPhaseFunction } from "./functions/prepPhaseFollowups.ts";
import { postWeddingFunction } from "./functions/postWeddingFlow.ts";
import { clientOrchestratorV1Function } from "./functions/clientOrchestratorV1.ts";
import { operatorOrchestratorFunction } from "./functions/operatorOrchestrator.ts";
import { operatorEscalationDeliveryFunction } from "./functions/operatorEscalationDelivery.ts";
import { v3ThreadWorkflowSweepFunction } from "./functions/v3ThreadWorkflowSweep.ts";
import { syncGmailLabelImportCandidates } from "./functions/syncGmailLabelImportCandidates.ts";
import { processGmailLabelGroupApproval } from "./functions/processGmailLabelGroupApproval.ts";
import { processGmailSingleImportCandidateApprove } from "./functions/processGmailSingleImportCandidateApprove.ts";
import { processEscalationResolutionQueued } from "./functions/processEscalationResolutionQueued.ts";
import { processGmailLabelsRefresh } from "./functions/processGmailLabelsRefresh.ts";
import { processGmailDeltaSync } from "./functions/processGmailDeltaSync.ts";
import { processInboxThreadRequiresTriage } from "./functions/processInboxThreadRequiresTriage.ts";
import { intakeExistingThreadFunction } from "./functions/processIntakeExistingThread.ts";
import { renewGmailWatch } from "./functions/renewGmailWatch.ts";
import { gmailDeltaSanitySweep } from "./functions/gmailDeltaSanitySweep.ts";
import { renewGmailWatchSweep } from "./functions/renewGmailWatchSweep.ts";

/** Step 12D anchor: gate module stays linked in the serve bundle. */
void LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA;

/**
 * Public URL path on Supabase: `/functions/v1/inngest` (function name `inngest`).
 * `serveHost` defaults from the incoming request; override with `INNGEST_SERVE_HOST` if Inngest Cloud shows a wrong host.
 */
const serveHost = Deno.env.get("INNGEST_SERVE_HOST")?.trim();

const handler = serve({
  client: inngest,
  servePath: "/functions/v1/inngest",
  ...(serveHost ? { serveHost } : {}),
  functions: [
    // Pre-ingress email/web (`traffic-cop-triage`) retired — see `legacyRoutingCutoverGate.ts`,
    // `LEGACY_PRE_INGRESS_ROUTING_RETIRED_STATE_SUMMARY`. WhatsApp legacy ingress only:
    legacyWhatsappIngressFunction,
    intakeFunction,
    intakeExistingThreadFunction,
    outboundFunction,
    rewriteFunction,
    conciergeFunction,
    logisticsFunction,
    commercialFunction,
    projectManagerFunction,
    studioFunction,
    personaFunction,
    internalConciergeFunction,
    whatsappOrchestratorFunction,
    calendarRemindersFunction,
    contractFollowupFunction,
    prepPhaseFunction,
    postWeddingFunction,
    clientOrchestratorV1Function,
    operatorOrchestratorFunction,
    operatorEscalationDeliveryFunction,
    v3ThreadWorkflowSweepFunction,
    syncGmailLabelImportCandidates,
    processGmailLabelGroupApproval,
    processGmailSingleImportCandidateApprove,
    processEscalationResolutionQueued,
    processGmailLabelsRefresh,
    processGmailDeltaSync,
    processInboxThreadRequiresTriage,
    renewGmailWatch,
    gmailDeltaSanitySweep,
    renewGmailWatchSweep,
  ],
});

Deno.serve(handler);
