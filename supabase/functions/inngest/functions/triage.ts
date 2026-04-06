/**
 * Optimized Assembly Line — Master Routing for Atelier OS.
 *
 * Order: Deterministic Check → Stage Gate → Traffic Cop (Intent) → Conditional Matchmaker → Dispatch/Unfiled
 *
 * CRITICAL: The project_stage is fetched BEFORE the LLM runs.
 * Hardcoded guards prevent the LLM from routing to agents that are
 * invalid for the current lifecycle phase. This eliminates hallucinated routing.
 *
 * Every step uses Inngest step.run() for durable execution (.cursorrules §4).
 *
 * **Live path:** Legacy `ai/intent.*` remains production for email/web. **V3 CUT2 retry:** web widget known-wedding
 * may route live to `ai/orchestrator.client.v1` with `requestedExecutionMode: "draft_only"` when
 * `TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1=1` (default off). Otherwise `ai/intent.concierge` as today.
 *
 * **Phase 2 Slice C1 (shadow):** When `TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1=1`, supported email/web **non-intake**
 * traffic also emits `ai/orchestrator.client.v1` in a separate Inngest step — **observation only**; parallel to
 * legacy dispatch when CUT2 is off. When CUT2 is on for web-widget, shadow is **skipped** (no duplicate orchestrator).
 *
 * **Phase 2 reassessment:** Email/web returns include `orchestrator_client_v1_live_cutover`; web-widget adds
 * `web_widget_live_dispatch`.
 *
 * **Phase 2 B3:** Shadow sends include `shadowCorrelationId`, `legacyTriageIntent`, `shadowFanoutSource` so
 * `clientOrchestratorV1` can emit `[orchestrator.shadow.compare]` readiness logs vs the legacy route.
 *
 * **V3 CUT3:** Live CUT2 sends include `cut2LiveCorrelationId` + `cut2LiveFanoutSource` for
 * `[orchestrator.cut2.live.observe]` logs in `clientOrchestratorV1`; triage return echoes `cut2_live_correlation_id`.
 *
 * **V3 CUT4:** Main triage path (not web fast-path), **concierge** + **known wedding** only — live
 * `ai/orchestrator.client.v1` with `draft_only` when `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1=1`.
 * Shadow skipped when CUT4 live applies (same turn). Intake / other intents unchanged.
 *
 * **V3 CUT5:** Same main path, **`project_management`** + **known wedding** — live orchestrator when
 * `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1=1`. Shadow skipped when CUT5 live applies.
 *
 * **V3 CUT6:** Same main path, **`logistics`** + **known wedding** — live orchestrator when
 * `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1=1`. Shadow skipped when CUT6 live applies.
 * Does not apply to web-widget fast path (CUT2 branch) or intake/unfiled.
 *
 * **V3 CUT7:** Same main path, **`commercial`** + **known wedding** — live orchestrator when
 * `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1=1`. Shadow skipped when CUT7 live applies.
 *
 * **V3 CUT8:** Same main path, **`studio`** + **known wedding** (post-wedding stage group) — live orchestrator when
 * `TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1=1`. Shadow skipped when CUT8 live applies.
 *
 * **Intake migration (planning):** Legacy `ai/intent.intake` is not a CUT4-style specialist swap — see
 * `docs/v3/INTAKE_MIGRATION_POST_CUT8_SLICE.md`. **Client intake is email;** dashboard `reply_channel === "web"` here reflects
 * `comms/web.received` ingress shape, not a separate “client web intake” product lane. Returns may include `intake_legacy_dispatch` for observability only.
 *
 * **Unfiled / unresolved matching:** Main path returns `wedding_resolution_trace` and logs `[triage.routing_resolution]`.
 * Optional **bounded** matchmaker activation: `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1` — see
 * `docs/v3/UNFILED_UNRESOLVED_MATCHING_SLICE.md`. Does not apply to dashboard web (`comms/web.received`).
 * Optional **near-match approval escalation:** `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1` (requires the
 * bounded matchmaker gate) — confidence in [75, 90) with a candidate id → `escalation_requests` + dashboard signal; no auto-file, no intake.
 *
 * `ai/intent.intake` does not shadow-fanout. Operator WhatsApp → internal concierge only (unchanged).
 *
 * **RET1 observability:** return **`retirement_dispatch_observability_v1`** + **`[triage.retirement_dispatch_v1]`** log
 * (email + dashboard web paths; see `retirementDispatchObservabilityV1.ts` and `LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md` §5).
 *
 * **CUT2 D1 execution (web-widget known-wedding only):** **`TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1`**
 * — when `0`/`false`, legacy `ai/intent.concierge` is **not** sent if CUT2 is off (blocked; enable CUT2 or relax D1).
 * Return **`cut2_web_widget_d1_prep`** (`schema_version` 2) + RET1 observability.
 *
 * **CUT4 D1 execution (main-path concierge known-wedding only):** **`TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1`**
 * — when `0`/`false`, legacy `ai/intent.concierge` **not** sent if CUT4 is off (blocked). **`cut4_main_path_concierge_d1_prep`** v2.
 * Web-widget CUT2 unchanged.
 *
 * **CUT5 D1 execution (main-path project_management known-wedding only):** **`TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1`**
 * — when `0`/`false`, legacy **`ai/intent.project_management`** **not** sent if CUT5 is off (blocked). **`cut5_main_path_project_management_d1_prep`** v2.
 * CUT2, CUT4, other intents unchanged.
 *
 * **CUT6 D1 execution (main-path logistics known-wedding only):** **`TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1`**
 * — when `0`/`false`, legacy **`ai/intent.logistics`** **not** sent if CUT6 is off (blocked). **`cut6_main_path_logistics_d1_prep`** v2.
 * CUT2, CUT4, CUT5, CUT7–CUT8 unchanged.
 *
 * **CUT7 D1 execution (main-path commercial known-wedding only):** **`TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1`**
 * — when `0`/`false`, legacy **`ai/intent.commercial`** **not** sent if CUT7 is off (blocked). **`cut7_main_path_commercial_d1_prep`** v2.
 * CUT2, CUT4–CUT6, CUT8 unchanged.
 *
 * **CUT8 D1 execution (main-path studio known-wedding only):** **`TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1`**
 * — when `0`/`false`, legacy **`ai/intent.studio`** **not** sent if CUT8 is off (blocked). **`cut8_main_path_studio_d1_prep`** v2 on **`routed`**. CUT2, CUT4–CUT7 unchanged.
 */
import {
  inngest,
  OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT,
  ORCHESTRATOR_CLIENT_V1_EVENT,
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
  type AtelierEvents,
} from "../../_shared/inngest.ts";
import {
  getMainPathCommercialKnownWeddingOrchestratorLiveCutoverReadiness,
  getMainPathConciergeKnownWeddingOrchestratorLiveCutoverReadiness,
  getMainPathLogisticsKnownWeddingOrchestratorLiveCutoverReadiness,
  getMainPathProjectManagementKnownWeddingOrchestratorLiveCutoverReadiness,
  getMainPathStudioKnownWeddingOrchestratorLiveCutoverReadiness,
  getOrchestratorClientV1LiveCutoverReadiness,
  getWebWidgetKnownWeddingOrchestratorLiveCutoverReadiness,
  TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV,
  TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1_ENV,
  TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1_ENV,
  TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1_ENV,
  TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1_ENV,
  TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1_ENV,
  TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV,
  TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV,
  TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV,
  TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV,
  TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV,
  TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV,
  buildCut2WebWidgetD1ExecV2,
  buildCut4MainPathConciergeD1ExecV2,
  buildCut5MainPathProjectManagementD1ExecV2,
  buildCut6MainPathLogisticsD1ExecV2,
  buildCut7MainPathCommercialD1ExecV2,
  buildCut8MainPathStudioD1ExecV2,
  isTriageD1Cut2WebWidgetLegacyConciergeDispatchWhenCut2OffAllowed,
  isTriageD1Cut4MainPathConciergeLegacyConciergeDispatchWhenCut4OffAllowed,
  isTriageD1Cut5MainPathProjectManagementLegacyDispatchWhenCut5OffAllowed,
  isTriageD1Cut6MainPathLogisticsLegacyDispatchWhenCut6OffAllowed,
  isTriageD1Cut7MainPathCommercialLegacyDispatchWhenCut7OffAllowed,
  isTriageD1Cut8MainPathStudioLegacyDispatchWhenCut8OffAllowed,
  isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled,
  isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled,
  isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled,
  isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled,
  isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled,
  isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled,
  isTriageBoundedUnresolvedEmailMatchmakerEnabled,
  isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled,
  BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE,
  BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE,
  getTriageQaBoundedNearMatchSyntheticConfidenceScore,
  TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV,
  isTriageShadowOrchestratorClientV1Enabled,
} from "../../_shared/orchestrator/triageShadowOrchestratorClientV1Gate.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { runTriageAgent, type TriageIntent } from "../../_shared/agents/triage.ts";
import { runMatchmakerAgent, type MatchmakerResult } from "../../_shared/agents/matchmaker.ts";
import { insertBoundedUnresolvedMatchApprovalEscalation } from "../../_shared/triage/boundedUnresolvedMatchApprovalEscalation.ts";
import {
  buildMainPathRetirementDispatchV1,
  buildUnfiledEarlyExitRetirementDispatchV1,
  buildWebWidgetRetirementDispatchV1,
  logRetirementDispatchV1,
} from "../../_shared/triage/retirementDispatchObservabilityV1.ts";

// ── Stage-based routing rules ────────────────────────────────────

type StageGroup = "new_lead" | "pre_booking" | "active" | "post_wedding";

const STAGE_GROUP_MAP: Record<string, StageGroup> = {
  inquiry: "new_lead",
  consultation: "pre_booking",
  proposal_sent: "pre_booking",
  contract_out: "pre_booking",
  booked: "active",
  prep: "active",
  final_balance: "active",
  delivered: "post_wedding",
  archived: "post_wedding",
};

const ALLOWED_INTENTS: Record<StageGroup, ReadonlySet<TriageIntent>> = {
  new_lead: new Set(["intake"]),
  pre_booking: new Set(["intake", "commercial", "concierge"]),
  active: new Set(["concierge", "project_management", "logistics", "commercial"]),
  post_wedding: new Set(["studio", "concierge"]),
};

const FALLBACK_INTENT: Record<StageGroup, TriageIntent> = {
  new_lead: "intake",
  pre_booking: "concierge",
  active: "concierge",
  post_wedding: "studio",
};

function enforceStageGate(
  llmIntent: TriageIntent,
  stage: string | null,
  hasWedding: boolean,
): TriageIntent {
  if (!hasWedding || !stage) return "intake";

  const group = STAGE_GROUP_MAP[stage] ?? "new_lead";
  const allowed = ALLOWED_INTENTS[group];

  if (allowed.has(llmIntent)) return llmIntent;

  return FALLBACK_INTENT[group];
}

/** Matchmaker step output + explicit skip reason for observability (see UNFILED_UNRESOLVED_MATCHING_SLICE.md). */
type MatchmakerStepResult = {
  weddingId: string | null;
  match: MatchmakerResult | null;
  photographerId?: string | null;
  /** Set when OpenAI matchmaker auto-resolves a wedding (confidence ≥ 90). Used to re-apply the stage gate. */
  resolved_wedding_project_stage?: string | null;
  matchmaker_invoked: boolean;
  matchmaker_skip_reason: string;
  /** True when the bounded unresolved-email experimental path invoked the matchmaker. */
  bounded_unresolved_activation?: boolean;
  /** QA-only: `TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1` applied this score for proof runs. */
  qa_synthetic_near_match_confidence?: number | null;
};

function buildWeddingResolutionTrace(input: {
  identity: { weddingId: string | null; projectStage: string | null };
  llmIntent: TriageIntent;
  enforcedIntent: TriageIntent;
  dispatchIntent: TriageIntent;
  projectStageUsedForDispatch: string | null;
  matchResult: MatchmakerStepResult;
  finalWeddingId: string | null;
  boundedUnresolved: {
    gate_on: boolean;
    subset_eligible: boolean;
    activation: boolean;
    outcome:
      | "not_eligible"
      | "resolved_above_threshold"
      | "escalated_for_approval"
      | "declined_low_confidence"
      | "skipped_matchmaker_not_invoked";
  };
}): Record<string, unknown> {
  return {
    deterministic_wedding_id: !!input.identity.weddingId,
    project_stage_at_identity: input.identity.projectStage,
    project_stage_used_for_dispatch: input.projectStageUsedForDispatch,
    llm_intent: input.llmIntent,
    enforced_intent: input.enforcedIntent,
    dispatch_intent: input.dispatchIntent,
    matchmaker_invoked: input.matchResult.matchmaker_invoked,
    matchmaker_skip_reason: input.matchResult.matchmaker_skip_reason,
    bounded_unresolved_activation: input.matchResult.bounded_unresolved_activation ?? false,
    final_wedding_id: input.finalWeddingId,
    bounded_unresolved_email_matchmaker: input.boundedUnresolved,
    ...(input.matchResult.qa_synthetic_near_match_confidence != null
      ? {
          qa_synthetic_near_match_confidence_applied:
            input.matchResult.qa_synthetic_near_match_confidence,
        }
      : {}),
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function extractSenderAndBody(payload: Record<string, unknown>): {
  sender: string;
  body: string;
} {
  const sender =
    typeof payload.from === "string"
      ? payload.from
      : typeof payload.sender === "string"
        ? payload.sender
        : typeof payload.email === "string"
          ? payload.email
          : typeof payload.phone === "string"
            ? payload.phone
            : "";

  const body =
    typeof payload.body === "string"
      ? payload.body
      : typeof payload.text === "string"
        ? payload.text
        : typeof payload.message === "string"
          ? payload.message
          : JSON.stringify(payload);

  return { sender, body };
}

/**
 * Legacy specialist events for **email + dashboard-web** main path when env-gated orchestrator live paths are off.
 * `ai/intent.persona` is **not** emitted by triage (intake/specialists chain into persona). Near-match escalation
 * skips this map. Retirement sequencing: `docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`.
 */
const INTENT_EVENT_MAP: Record<TriageIntent, keyof AtelierEvents> = {
  intake: "ai/intent.intake",
  commercial: "ai/intent.commercial",
  logistics: "ai/intent.logistics",
  project_management: "ai/intent.project_management",
  concierge: "ai/intent.concierge",
  studio: "ai/intent.studio",
};

// ── Inngest function ─────────────────────────────────────────────

export const triageFunction = inngest.createFunction(
  { id: "traffic-cop-triage", name: "Traffic Cop — Optimized Assembly Line" },
  [
    { event: "comms/email.received" },
    { event: "comms/whatsapp.received" },
    { event: OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT },
    { event: "comms/web.received" },
  ],
  async ({ event, step }) => {
    // Step 8D: client vs operator WhatsApp use distinct event names (see `inngest.ts`).
    // Legacy `comms/whatsapp.received` + `operator/whatsapp.legacy.received` → Internal Concierge only.
    // Twilio operator lane → `operator/whatsapp.inbound.v1` (not triage).
    if (
      event.name === "comms/whatsapp.received" ||
      event.name === OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT
    ) {
      const raw = (event.data as Record<string, unknown>) ?? {};
      const payload = (raw.raw_message as Record<string, unknown>) ?? {};
      const fromNumber = typeof payload.from === "string" ? payload.from : "";
      const messageBody = typeof payload.body === "string" ? payload.body : JSON.stringify(payload);
      const photographerId = typeof raw.photographer_id === "string" ? raw.photographer_id : "";

      console.log(`[triage] WhatsApp received — bypassing email pipeline. From: ${fromNumber}, photographer: ${photographerId}`);

      await step.run("dispatch-internal-concierge", async () => {
        await inngest.send({
          name: "ai/intent.internal_concierge",
          data: {
            photographer_id: photographerId,
            from_number: fromNumber,
            raw_message: messageBody,
          },
        });
      });

      return {
        status: "routed_whatsapp_internal",
        photographer_id: photographerId,
        from_number: fromNumber,
      };
    }

    // ── Source detection (email / web only from this point) ────────
    const isWebWidget = event.name === "comms/web.received";

    const replyChannel: "email" | "whatsapp" | "web" =
      event.name === "comms/web.received" ? "web" : "email";

    const raw = (event.data as Record<string, unknown>) ?? {};
    const payload =
      "raw_email" in raw
        ? (raw.raw_email as Record<string, unknown>)
        : "raw_message" in raw
          ? (raw.raw_message as Record<string, unknown>) ?? {}
          : raw;

    const payloadPhotographerId =
      typeof raw.photographer_id === "string" ? raw.photographer_id : null;

    const { sender, body } = extractSenderAndBody(
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {},
    );

    // ── Step 1: Deterministic Identity + Stage ────────────────────
    const identity = await step.run("deterministic-identity", async () => {
      let weddingId: string | null = null;
      let photographerId: string | null = null;
      let projectStage: string | null = null;

      if (sender) {
        const { data: client } = await supabaseAdmin
          .from("clients")
          .select("wedding_id")
          .eq("email", sender)
          .limit(1)
          .maybeSingle();

        weddingId = (client?.wedding_id as string) ?? null;
      }

      if (weddingId) {
        const { data: wedding } = await supabaseAdmin
          .from("weddings")
          .select("photographer_id, stage")
          .eq("id", weddingId)
          .single();

        photographerId = (wedding?.photographer_id as string) ?? null;
        projectStage = (wedding?.stage as string) ?? null;
      }

      // Ingress always carries tenant on email/web; use it when DB join is stale or incomplete.
      if (!photographerId && payloadPhotographerId) {
        photographerId = payloadPhotographerId;
      }

      return { weddingId, photographerId, projectStage };
    });

    // ── Web widget fast-path (known wedding) — CUT2 live orchestrator vs legacy ai/intent.concierge (CUT2-only D1) ──
    // Main-path concierge (CUT4) is a separate branch below.
    if (isWebWidget && identity.weddingId) {
      const webCommand = await step.run("persist-internal-command", async () => {
        const { data: weddingRow, error: wErr } = await supabaseAdmin
          .from("weddings")
          .select("photographer_id")
          .eq("id", identity.weddingId!)
          .single();

        if (wErr || !weddingRow?.photographer_id) {
          throw new Error(`Web widget: wedding not found or missing photographer_id: ${wErr?.message}`);
        }

        const { data: thread, error: threadErr } = await supabaseAdmin
          .from("threads")
          .insert({
            wedding_id: identity.weddingId!,
            photographer_id: weddingRow.photographer_id as string,
            title: body.slice(0, 60),
            kind: "group",
          })
          .select("id")
          .single();

        if (threadErr || !thread) {
          throw new Error(`Failed to create thread: ${threadErr?.message}`);
        }

        const id = thread.id as string;

        const tenantPid = weddingRow.photographer_id as string;
        const { error: msgErr } = await supabaseAdmin.from("messages").insert({
          thread_id: id,
          photographer_id: tenantPid,
          direction: "in",
          sender: sender || "widget",
          body,
        });

        if (msgErr) throw new Error(`Failed to insert message: ${msgErr.message}`);
        return { threadId: id, photographerId: tenantPid };
      });

      const cut2WebWidgetLive = isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled();
      const d1LegacyWhenCut2OffAllowed =
        isTriageD1Cut2WebWidgetLegacyConciergeDispatchWhenCut2OffAllowed();
      const cut2WebWidgetD1Blocked = !cut2WebWidgetLive && !d1LegacyWhenCut2OffAllowed;
      const webWidgetReplyChannel = replyChannel === "web" ? "web" : "email";

      if (cut2WebWidgetD1Blocked) {
        const retirementDispatchObservabilityWeb = buildWebWidgetRetirementDispatchV1({
          cut2WebWidgetLive: false,
          d1LegacyWhenCut2OffAllowed: false,
          replyChannel: webWidgetReplyChannel,
        });
        logRetirementDispatchV1(retirementDispatchObservabilityWeb);

        const shadowOrchestratorWeb = await step.run(
          "shadow-orchestrator-client-v1-web-widget",
          async () => ({ status: "skipped_cut2_d1_blocked_no_dispatch" as const }),
        );

        return {
          status: "cut2_web_widget_d1_blocked_no_dispatch",
          reason_code: "CUT2_OFF_AND_D1_LEGACY_DISALLOWED",
          reason:
            `No AI dispatch: CUT2 is off and ${TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV} disallows legacy concierge. ` +
            `Enable ${TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV}=1 for orchestrator, or relax the D1 env.`,
          weddingId: identity.weddingId,
          intent: "concierge",
          reply_channel: replyChannel,
          threadId: webCommand.threadId,
          cut2_web_widget_d1_prep: buildCut2WebWidgetD1ExecV2({
            d1LegacyWhenCut2OffAllowed: false,
            cut2WebWidgetLive: false,
          }),
          retirement_dispatch_observability_v1: retirementDispatchObservabilityWeb,
          web_widget_live_dispatch: "__cut2_web_widget_d1_blocked_no_dispatch__",
          shadow_orchestrator: shadowOrchestratorWeb,
          orchestrator_client_v1_live_cutover:
            getWebWidgetKnownWeddingOrchestratorLiveCutoverReadiness(false),
        };
      }

      /** CUT3 — correlates triage turn → `clientOrchestratorV1` `[orchestrator.cut2.live.observe]` log. */
      const cut2LiveCorrelationId = cut2WebWidgetLive ? crypto.randomUUID() : null;

      await step.run(
        cut2WebWidgetLive ? "dispatch-web-orchestrator-client-v1-live-cut2-draft-only" : "dispatch-web-concierge",
        async () => {
          if (cut2WebWidgetLive && cut2LiveCorrelationId) {
            await inngest.send({
              name: ORCHESTRATOR_CLIENT_V1_EVENT,
              data: {
                schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
                photographerId: webCommand.photographerId,
                weddingId: identity.weddingId!,
                threadId: webCommand.threadId,
                replyChannel: "web",
                rawMessage: body,
                requestedExecutionMode: "draft_only",
                cut2LiveCorrelationId,
                cut2LiveFanoutSource: "triage_web_widget_live" as const,
              },
            });
          } else {
            await inngest.send({
              name: "ai/intent.concierge",
              data: {
                wedding_id: identity.weddingId!,
                photographer_id: webCommand.photographerId,
                raw_message: body,
                reply_channel: replyChannel,
              },
            });
          }
        },
      );

      const retirementDispatchObservabilityWeb = buildWebWidgetRetirementDispatchV1({
        cut2WebWidgetLive,
        d1LegacyWhenCut2OffAllowed,
        replyChannel: webWidgetReplyChannel,
      });
      logRetirementDispatchV1(retirementDispatchObservabilityWeb);

      const shadowOrchestratorWeb = await step.run(
        "shadow-orchestrator-client-v1-web-widget",
        async () => {
          if (cut2WebWidgetLive) {
            return { status: "skipped_live_cutover_active" as const };
          }
          if (!isTriageShadowOrchestratorClientV1Enabled()) {
            return { status: "disabled" as const };
          }
          try {
            await inngest.send({
              name: ORCHESTRATOR_CLIENT_V1_EVENT,
              data: {
                schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
                photographerId: webCommand.photographerId,
                weddingId: identity.weddingId!,
                threadId: webCommand.threadId,
                replyChannel: "web",
                rawMessage: body,
                requestedExecutionMode: "auto",
                shadowCorrelationId: crypto.randomUUID(),
                legacyTriageIntent: "concierge",
                shadowFanoutSource: "triage_web_widget",
              },
            });
            return { status: "sent" as const };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn("[triage] shadow orchestrator (web widget) failed (non-fatal):", msg);
            return { status: "failed" as const, error: msg };
          }
        },
      );

      return {
        status: "routed_internal",
        weddingId: identity.weddingId,
        intent: "concierge",
        reply_channel: replyChannel,
        threadId: webCommand.threadId,
        cut2_web_widget_d1_prep: buildCut2WebWidgetD1ExecV2({
          d1LegacyWhenCut2OffAllowed,
          cut2WebWidgetLive,
        }),
        retirement_dispatch_observability_v1: retirementDispatchObservabilityWeb,
        web_widget_live_dispatch: cut2WebWidgetLive
          ? ORCHESTRATOR_CLIENT_V1_EVENT
          : "ai/intent.concierge",
        ...(cut2LiveCorrelationId !== null
          ? { cut2_live_correlation_id: cut2LiveCorrelationId }
          : {}),
        shadow_orchestrator: shadowOrchestratorWeb,
        orchestrator_client_v1_live_cutover:
          getWebWidgetKnownWeddingOrchestratorLiveCutoverReadiness(cut2WebWidgetLive),
      };
    }

    // ── Step 2: Traffic Cop (Intent Classification) ──────────────
    const llmIntent = await step.run("classify-intent", async () => {
      return runTriageAgent(body);
    });

    // ── Step 2b: Stage Gate — override LLM if invalid for stage ──
    const stageGateIntent = enforceStageGate(
      llmIntent,
      identity.projectStage,
      !!identity.weddingId,
    );

    const boundedUnresolvedGateOn = isTriageBoundedUnresolvedEmailMatchmakerEnabled();
    const boundedUnresolvedSubsetEligible =
      event.name === "comms/email.received" &&
      boundedUnresolvedGateOn &&
      !identity.weddingId &&
      llmIntent !== "intake";

    // ── Step 3: Conditional Matchmaker ───────────────────────────
    const matchResult = await step.run("conditional-matchmaker", async (): Promise<MatchmakerStepResult> => {
      if (identity.weddingId) {
        return {
          weddingId: identity.weddingId,
          match: null,
          matchmaker_invoked: false,
          matchmaker_skip_reason: "deterministic_client_email_match",
        };
      }

      if (stageGateIntent === "intake" && !boundedUnresolvedSubsetEligible) {
        return {
          weddingId: null,
          match: null,
          matchmaker_invoked: false,
          matchmaker_skip_reason: "stage_gate_intake_without_deterministic_wedding",
        };
      }

      const tenantPhotographerId = identity.photographerId ?? payloadPhotographerId;
      if (!tenantPhotographerId) {
        return {
          weddingId: null,
          match: null,
          matchmaker_invoked: false,
          matchmaker_skip_reason: "missing_tenant_photographer_id",
        };
      }

      const { data: activeWeddings } = await supabaseAdmin
        .from("weddings")
        .select("id, couple_names, wedding_date, location, stage")
        .eq("photographer_id", tenantPhotographerId)
        .neq("stage", "archived")
        .neq("stage", "delivered");

      if (!activeWeddings || activeWeddings.length === 0) {
        return {
          weddingId: null,
          match: null,
          matchmaker_invoked: false,
          matchmaker_skip_reason: "no_active_weddings_for_tenant",
        };
      }

      let match = await runMatchmakerAgent(
        body,
        activeWeddings as Record<string, unknown>[],
      );

      let qaSyntheticNearMatchConfidence: number | null = null;
      const qaSyntheticScore = getTriageQaBoundedNearMatchSyntheticConfidenceScore();
      const sid =
        typeof match.suggested_wedding_id === "string" ? match.suggested_wedding_id.trim() : "";
      if (
        qaSyntheticScore !== null &&
        boundedUnresolvedSubsetEligible &&
        isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled() &&
        sid.length > 0
      ) {
        qaSyntheticNearMatchConfidence = qaSyntheticScore;
        match = {
          ...match,
          confidence_score: qaSyntheticScore,
          reasoning: `[qa:${TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV}=${qaSyntheticScore}] ${match.reasoning}`,
        };
        console.log(
          "[triage.qa_synthetic_near_match_confidence]",
          JSON.stringify({ score: qaSyntheticScore, suggested_wedding_id: sid }),
        );
      }

      const resolvedWeddingId =
        match.confidence_score >= BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE
          ? match.suggested_wedding_id
          : null;

      if (resolvedWeddingId) {
        const { data: wedding } = await supabaseAdmin
          .from("weddings")
          .select("photographer_id, stage")
          .eq("id", resolvedWeddingId)
          .single();

        return {
          weddingId: resolvedWeddingId,
          photographerId: (wedding?.photographer_id as string) ?? identity.photographerId,
          resolved_wedding_project_stage: (wedding?.stage as string) ?? null,
          match,
          matchmaker_invoked: true,
          matchmaker_skip_reason: "matchmaker_resolved_above_threshold",
          bounded_unresolved_activation: boundedUnresolvedSubsetEligible,
          qa_synthetic_near_match_confidence: qaSyntheticNearMatchConfidence,
        };
      }

      return {
        weddingId: null,
        match,
        matchmaker_invoked: true,
        matchmaker_skip_reason: "matchmaker_below_threshold_or_unresolved",
        bounded_unresolved_activation: boundedUnresolvedSubsetEligible,
        qa_synthetic_near_match_confidence: qaSyntheticNearMatchConfidence,
      };
    });

    const finalWeddingId = matchResult.weddingId ?? identity.weddingId;
    const finalPhotographerId =
      matchResult.photographerId ?? identity.photographerId ?? payloadPhotographerId;

    const matchCandidateId =
      typeof matchResult.match?.suggested_wedding_id === "string" &&
      matchResult.match.suggested_wedding_id.trim().length > 0
        ? matchResult.match.suggested_wedding_id.trim()
        : null;
    const matchConfidence =
      typeof matchResult.match?.confidence_score === "number"
        ? matchResult.match.confidence_score
        : 0;

    const approvalEscalationGateOn = isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled();
    const nearMatchForApproval =
      approvalEscalationGateOn &&
      boundedUnresolvedSubsetEligible &&
      matchResult.matchmaker_invoked &&
      !finalWeddingId &&
      matchCandidateId !== null &&
      matchConfidence >= BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE &&
      matchConfidence < BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE;

    const projectStageUsedForDispatch: string | null = identity.weddingId
      ? identity.projectStage
      : finalWeddingId
        ? (matchResult.resolved_wedding_project_stage ?? null)
        : null;

    const dispatchIntent = enforceStageGate(
      llmIntent,
      projectStageUsedForDispatch,
      !!finalWeddingId,
    );

    const boundedOutcome: {
      gate_on: boolean;
      subset_eligible: boolean;
      activation: boolean;
      outcome:
        | "not_eligible"
        | "resolved_above_threshold"
        | "escalated_for_approval"
        | "declined_low_confidence"
        | "skipped_matchmaker_not_invoked";
    } = (() => {
      if (!boundedUnresolvedSubsetEligible) {
        return {
          gate_on: boundedUnresolvedGateOn,
          subset_eligible: false,
          activation: false,
          outcome: "not_eligible" as const,
        };
      }
      if (!matchResult.matchmaker_invoked) {
        return {
          gate_on: true,
          subset_eligible: true,
          activation: false,
          outcome: "skipped_matchmaker_not_invoked" as const,
        };
      }
      if (matchResult.matchmaker_skip_reason === "matchmaker_resolved_above_threshold") {
        return {
          gate_on: true,
          subset_eligible: true,
          activation: true,
          outcome: "resolved_above_threshold" as const,
        };
      }
      if (nearMatchForApproval) {
        return {
          gate_on: true,
          subset_eligible: true,
          activation: true,
          outcome: "escalated_for_approval" as const,
        };
      }
      return {
        gate_on: true,
        subset_eligible: true,
        activation: true,
        outcome: "declined_low_confidence" as const,
      };
    })();

    const weddingResolutionTrace = buildWeddingResolutionTrace({
      identity,
      llmIntent,
      enforcedIntent: stageGateIntent,
      dispatchIntent,
      projectStageUsedForDispatch,
      matchResult,
      finalWeddingId,
      boundedUnresolved: boundedOutcome,
    });

    console.log(
      "[triage.routing_resolution]",
      JSON.stringify({
        reply_channel: replyChannel,
        sender_present: Boolean(sender),
        bounded_unresolved_email_matchmaker_v1: {
          env: boundedUnresolvedGateOn ? "on" : "off",
          approval_escalation_env: approvalEscalationGateOn ? "on" : "off",
          subset_eligible: boundedUnresolvedSubsetEligible,
          outcome: boundedOutcome.outcome,
          suggested_wedding_id: matchResult.match?.suggested_wedding_id ?? null,
          confidence_score: matchResult.match?.confidence_score ?? null,
          resolved_final_wedding_id: finalWeddingId,
          near_match_for_approval: nearMatchForApproval,
        },
        ...weddingResolutionTrace,
      }),
    );

    // ── Step 4: Database & Dispatch ──────────────────────────────
    const threadInfo = await step.run("persist-thread-and-message", async () => {
      const subject =
        typeof (payload as Record<string, unknown>).subject === "string"
          ? ((payload as Record<string, unknown>).subject as string)
          : body.slice(0, 60);

      const routingMetadata =
        !finalWeddingId && matchResult.match
          ? {
              suggested_wedding_id: matchResult.match.suggested_wedding_id,
              confidence_score: matchResult.match.confidence_score,
              reasoning: matchResult.match.reasoning,
              classified_intent: dispatchIntent,
              ...(nearMatchForApproval
                ? {
                    pending_photographer_wedding_approval: true as const,
                    routing_kind: "near_match_escalation_candidate" as const,
                  }
                : {}),
            }
          : null;

      if (!finalPhotographerId) {
        throw new Error("Cannot create thread: missing photographer_id on payload or resolved wedding.");
      }

      const { data: thread, error: threadErr } = await supabaseAdmin
        .from("threads")
        .insert({
          wedding_id: finalWeddingId ?? undefined,
          photographer_id: finalPhotographerId,
          title: subject,
          kind: "group",
          ai_routing_metadata: routingMetadata,
        })
        .select("id")
        .single();

      if (threadErr || !thread) {
        throw new Error(`Failed to create thread: ${threadErr?.message}`);
      }

      const threadId = thread.id as string;

      const { error: msgErr } = await supabaseAdmin.from("messages").insert({
        thread_id: threadId,
        photographer_id: finalPhotographerId,
        direction: "in",
        sender: sender || "unknown",
        body,
      });

      if (msgErr) {
        throw new Error(`Failed to insert message: ${msgErr.message}`);
      }

      return { threadId, routingMetadata };
    });

    const nearMatchEscalationId = await step.run(
      "insert-near-match-approval-escalation",
      async (): Promise<string | null> => {
        if (!nearMatchForApproval || !finalPhotographerId || !matchCandidateId) {
          return null;
        }
        return await insertBoundedUnresolvedMatchApprovalEscalation(supabaseAdmin, {
          photographerId: finalPhotographerId,
          threadId: threadInfo.threadId,
          candidateWeddingId: matchCandidateId,
          confidenceScore: matchConfidence,
          matchmakerReasoning: matchResult.match?.reasoning ?? "",
          llmIntent,
          senderEmail: sender || "",
        });
      },
    );

    if (nearMatchForApproval && !nearMatchEscalationId) {
      throw new Error("Near-match approval escalation was expected but escalation_requests insert returned no id.");
    }

    // ── Failsafe: Unfiled Inbox ──────────────────────────────────
    // With current `enforceStageGate`, no deterministic wedding forces `intake`, so this branch is
    // normally unreachable; kept as a safety valve if gate logic changes. See UNFILED_UNRESOLVED_MATCHING_SLICE.md.
    if (dispatchIntent !== "intake" && !finalWeddingId) {
      const retirementDispatchObservabilityUnfiled = buildUnfiledEarlyExitRetirementDispatchV1({
        reply_channel: replyChannel === "web" ? "web" : "email",
        dispatch_intent: dispatchIntent,
      });
      logRetirementDispatchV1(retirementDispatchObservabilityUnfiled);
      return {
        status: "unfiled",
        sender,
        intent: dispatchIntent,
        llmIntent,
        reply_channel: replyChannel,
        threadId: threadInfo.threadId,
        retirement_dispatch_observability_v1: retirementDispatchObservabilityUnfiled,
        matchSuggestion: threadInfo.routingMetadata,
        wedding_resolution_trace: {
          ...weddingResolutionTrace,
          triage_unfiled_early_exit: true,
        },
        orchestrator_client_v1_live_cutover: getOrchestratorClientV1LiveCutoverReadiness(),
      };
    }

    // ── Dispatch downstream event (live production path — legacy `ai/intent.*` or CUT4–CUT8 orchestrator) ──
    const dispatchResult = await step.run(
      "dispatch-event",
      async (): Promise<
        | { kind: "near_match_approval_escalation"; escalationId: string }
        | { kind: "intake" }
        | { kind: "cut4_d1_blocked_no_dispatch" }
        | { kind: "cut4_live"; cut4LiveCorrelationId: string }
        | { kind: "cut5_d1_blocked_no_dispatch" }
        | { kind: "cut5_live"; cut5LiveCorrelationId: string }
        | { kind: "cut6_d1_blocked_no_dispatch" }
        | { kind: "cut6_live"; cut6LiveCorrelationId: string }
        | { kind: "cut7_d1_blocked_no_dispatch" }
        | { kind: "cut7_live"; cut7LiveCorrelationId: string }
        | { kind: "cut8_d1_blocked_no_dispatch" }
        | { kind: "cut8_live"; cut8LiveCorrelationId: string }
        | { kind: "legacy"; legacyEvent: keyof AtelierEvents }
      > => {
        if (nearMatchForApproval && nearMatchEscalationId) {
          return { kind: "near_match_approval_escalation" as const, escalationId: nearMatchEscalationId };
        }

        const eventName = INTENT_EVENT_MAP[dispatchIntent];

        const cut4MainPathLive =
          isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled() &&
          dispatchIntent === "concierge" &&
          !!finalWeddingId;

        const cut5MainPathLive =
          isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled() &&
          dispatchIntent === "project_management" &&
          !!finalWeddingId;

        const cut6MainPathLive =
          isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled() &&
          dispatchIntent === "logistics" &&
          !!finalWeddingId;

        const cut7MainPathLive =
          isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled() &&
          dispatchIntent === "commercial" &&
          !!finalWeddingId;

        const cut8MainPathLive =
          isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled() &&
          dispatchIntent === "studio" &&
          !!finalWeddingId;

        if (eventName === "ai/intent.intake") {
          await inngest.send({
            name: "ai/intent.intake",
            data: {
              photographer_id: finalPhotographerId ?? "",
              wedding_id: finalWeddingId ?? undefined,
              thread_id: threadInfo.threadId,
              raw_message: body,
              sender_email: sender,
              reply_channel: replyChannel,
            },
          });
          return { kind: "intake" };
        }

        if (!finalPhotographerId) {
          throw new Error(
            "dispatch: missing photographer_id for legacy ai/intent.* (tenant-proof required).",
          );
        }

        if (cut4MainPathLive) {
          const cut4LiveCorrelationId = crypto.randomUUID();
          await inngest.send({
            name: ORCHESTRATOR_CLIENT_V1_EVENT,
            data: {
              schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
              photographerId: finalPhotographerId,
              weddingId: finalWeddingId!,
              threadId: threadInfo.threadId,
              replyChannel: replyChannel === "web" ? "web" : "email",
              rawMessage: body,
              requestedExecutionMode: "draft_only",
              cut4LiveCorrelationId,
              cut4LiveFanoutSource: "triage_main_concierge_live" as const,
            },
          });
          return { kind: "cut4_live", cut4LiveCorrelationId };
        }

        if (
          dispatchIntent === "concierge" &&
          !!finalWeddingId &&
          !cut4MainPathLive &&
          !isTriageD1Cut4MainPathConciergeLegacyConciergeDispatchWhenCut4OffAllowed()
        ) {
          return { kind: "cut4_d1_blocked_no_dispatch" as const };
        }

        if (cut5MainPathLive) {
          const cut5LiveCorrelationId = crypto.randomUUID();
          await inngest.send({
            name: ORCHESTRATOR_CLIENT_V1_EVENT,
            data: {
              schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
              photographerId: finalPhotographerId,
              weddingId: finalWeddingId!,
              threadId: threadInfo.threadId,
              replyChannel: replyChannel === "web" ? "web" : "email",
              rawMessage: body,
              requestedExecutionMode: "draft_only",
              cut5LiveCorrelationId,
              cut5LiveFanoutSource: "triage_main_project_management_live" as const,
            },
          });
          return { kind: "cut5_live", cut5LiveCorrelationId };
        }

        if (
          dispatchIntent === "project_management" &&
          !!finalWeddingId &&
          !cut5MainPathLive &&
          !isTriageD1Cut5MainPathProjectManagementLegacyDispatchWhenCut5OffAllowed()
        ) {
          return { kind: "cut5_d1_blocked_no_dispatch" as const };
        }

        if (cut6MainPathLive) {
          const cut6LiveCorrelationId = crypto.randomUUID();
          await inngest.send({
            name: ORCHESTRATOR_CLIENT_V1_EVENT,
            data: {
              schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
              photographerId: finalPhotographerId,
              weddingId: finalWeddingId!,
              threadId: threadInfo.threadId,
              replyChannel: replyChannel === "web" ? "web" : "email",
              rawMessage: body,
              requestedExecutionMode: "draft_only",
              cut6LiveCorrelationId,
              cut6LiveFanoutSource: "triage_main_logistics_live" as const,
            },
          });
          return { kind: "cut6_live", cut6LiveCorrelationId };
        }

        if (
          dispatchIntent === "logistics" &&
          !!finalWeddingId &&
          !cut6MainPathLive &&
          !isTriageD1Cut6MainPathLogisticsLegacyDispatchWhenCut6OffAllowed()
        ) {
          return { kind: "cut6_d1_blocked_no_dispatch" as const };
        }

        if (cut7MainPathLive) {
          const cut7LiveCorrelationId = crypto.randomUUID();
          await inngest.send({
            name: ORCHESTRATOR_CLIENT_V1_EVENT,
            data: {
              schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
              photographerId: finalPhotographerId,
              weddingId: finalWeddingId!,
              threadId: threadInfo.threadId,
              replyChannel: replyChannel === "web" ? "web" : "email",
              rawMessage: body,
              requestedExecutionMode: "draft_only",
              cut7LiveCorrelationId,
              cut7LiveFanoutSource: "triage_main_commercial_live" as const,
            },
          });
          return { kind: "cut7_live", cut7LiveCorrelationId };
        }

        if (
          dispatchIntent === "commercial" &&
          !!finalWeddingId &&
          !cut7MainPathLive &&
          !isTriageD1Cut7MainPathCommercialLegacyDispatchWhenCut7OffAllowed()
        ) {
          return { kind: "cut7_d1_blocked_no_dispatch" as const };
        }

        if (cut8MainPathLive) {
          const cut8LiveCorrelationId = crypto.randomUUID();
          await inngest.send({
            name: ORCHESTRATOR_CLIENT_V1_EVENT,
            data: {
              schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
              photographerId: finalPhotographerId,
              weddingId: finalWeddingId!,
              threadId: threadInfo.threadId,
              replyChannel: replyChannel === "web" ? "web" : "email",
              rawMessage: body,
              requestedExecutionMode: "draft_only",
              cut8LiveCorrelationId,
              cut8LiveFanoutSource: "triage_main_studio_live" as const,
            },
          });
          return { kind: "cut8_live", cut8LiveCorrelationId };
        }

        if (
          dispatchIntent === "studio" &&
          !!finalWeddingId &&
          !cut8MainPathLive &&
          !isTriageD1Cut8MainPathStudioLegacyDispatchWhenCut8OffAllowed()
        ) {
          return { kind: "cut8_d1_blocked_no_dispatch" as const };
        }

        await inngest.send({
          name: eventName,
          data: {
            wedding_id: finalWeddingId!,
            photographer_id: finalPhotographerId,
            raw_message: body,
            reply_channel: replyChannel,
          },
        });
        return { kind: "legacy", legacyEvent: eventName };
      },
    );

    if (dispatchResult.kind === "cut4_d1_blocked_no_dispatch") {
      const retirementGateFlagsBlocked = {
        cut4: isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
        cut5: isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
        cut6: isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
        cut7: isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
        cut8: isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
      };

      const retirementDispatchObservabilityBlocked = buildMainPathRetirementDispatchV1({
        reply_channel: replyChannel === "web" ? "web" : "email",
        dispatch_intent: dispatchIntent,
        final_wedding_id: finalWeddingId,
        dispatchResult: { kind: "cut4_d1_blocked_no_dispatch" },
        gates: retirementGateFlagsBlocked,
      });
      logRetirementDispatchV1(retirementDispatchObservabilityBlocked);

      const cut4MainPathLiveForExec =
        isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled() &&
        dispatchIntent === "concierge" &&
        !!finalWeddingId;

      const shadowOrchestratorBlocked = await step.run(
        "shadow-orchestrator-client-v1",
        async () => ({ status: "skipped_cut4_d1_blocked_no_dispatch" as const }),
      );

      return {
        status: "cut4_main_path_concierge_d1_blocked_no_dispatch",
        reason_code: "CUT4_OFF_AND_D1_LEGACY_DISALLOWED",
        reason:
          `No AI dispatch: CUT4 is off and ${TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1_ENV} disallows legacy concierge. ` +
          `Enable ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV}=1 for orchestrator, or relax the D1 env.`,
        weddingId: finalWeddingId,
        projectStage: identity.projectStage,
        llmIntent,
        enforcedIntent: stageGateIntent,
        dispatch_intent: dispatchIntent,
        cut4_main_path_concierge_d1_prep: buildCut4MainPathConciergeD1ExecV2({
          d1LegacyWhenCut4OffAllowed: false,
          cut4MainPathLive: cut4MainPathLiveForExec,
        }),
        retirement_dispatch_observability_v1: retirementDispatchObservabilityBlocked,
        wedding_resolution_trace: {
          ...weddingResolutionTrace,
          ...(nearMatchEscalationId
            ? { unresolved_match_approval_escalation_id: nearMatchEscalationId }
            : {}),
        },
        reply_channel: replyChannel,
        threadId: threadInfo.threadId,
        main_path_concierge_live_dispatch: "__cut4_main_path_concierge_d1_blocked_no_dispatch__",
        shadow_orchestrator: shadowOrchestratorBlocked,
        orchestrator_client_v1_live_cutover: getOrchestratorClientV1LiveCutoverReadiness(),
        orchestrator_client_v1_live_cutover_main_path_concierge:
          getMainPathConciergeKnownWeddingOrchestratorLiveCutoverReadiness(false),
        orchestrator_client_v1_live_cutover_main_path_project_management:
          getMainPathProjectManagementKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_logistics:
          getMainPathLogisticsKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_commercial:
          getMainPathCommercialKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_studio:
          getMainPathStudioKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
          ),
      };
    }

    if (dispatchResult.kind === "cut5_d1_blocked_no_dispatch") {
      const retirementGateFlagsCut5Blocked = {
        cut4: isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
        cut5: isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
        cut6: isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
        cut7: isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
        cut8: isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
      };

      const retirementDispatchObservabilityCut5Blocked = buildMainPathRetirementDispatchV1({
        reply_channel: replyChannel === "web" ? "web" : "email",
        dispatch_intent: dispatchIntent,
        final_wedding_id: finalWeddingId,
        dispatchResult: { kind: "cut5_d1_blocked_no_dispatch" },
        gates: retirementGateFlagsCut5Blocked,
      });
      logRetirementDispatchV1(retirementDispatchObservabilityCut5Blocked);

      const cut5MainPathLiveForExec =
        isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled() &&
        dispatchIntent === "project_management" &&
        !!finalWeddingId;

      const shadowOrchestratorCut5Blocked = await step.run(
        "shadow-orchestrator-client-v1",
        async () => ({ status: "skipped_cut5_d1_blocked_no_dispatch" as const }),
      );

      return {
        status: "cut5_main_path_project_management_d1_blocked_no_dispatch",
        reason_code: "CUT5_OFF_AND_D1_LEGACY_DISALLOWED",
        reason:
          `No AI dispatch: CUT5 is off and ${TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1_ENV} disallows legacy project_management. ` +
          `Enable ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV}=1 for orchestrator, or relax the D1 env.`,
        weddingId: finalWeddingId,
        projectStage: identity.projectStage,
        llmIntent,
        enforcedIntent: stageGateIntent,
        dispatch_intent: dispatchIntent,
        cut5_main_path_project_management_d1_prep: buildCut5MainPathProjectManagementD1ExecV2({
          d1LegacyWhenCut5OffAllowed: false,
          cut5MainPathLive: cut5MainPathLiveForExec,
        }),
        retirement_dispatch_observability_v1: retirementDispatchObservabilityCut5Blocked,
        wedding_resolution_trace: {
          ...weddingResolutionTrace,
          ...(nearMatchEscalationId
            ? { unresolved_match_approval_escalation_id: nearMatchEscalationId }
            : {}),
        },
        reply_channel: replyChannel,
        threadId: threadInfo.threadId,
        main_path_project_management_live_dispatch: "__cut5_main_path_project_management_d1_blocked_no_dispatch__",
        shadow_orchestrator: shadowOrchestratorCut5Blocked,
        orchestrator_client_v1_live_cutover: getOrchestratorClientV1LiveCutoverReadiness(),
        orchestrator_client_v1_live_cutover_main_path_concierge:
          getMainPathConciergeKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_project_management:
          getMainPathProjectManagementKnownWeddingOrchestratorLiveCutoverReadiness(false),
        orchestrator_client_v1_live_cutover_main_path_logistics:
          getMainPathLogisticsKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_commercial:
          getMainPathCommercialKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_studio:
          getMainPathStudioKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
          ),
      };
    }

    if (dispatchResult.kind === "cut6_d1_blocked_no_dispatch") {
      const retirementGateFlagsCut6Blocked = {
        cut4: isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
        cut5: isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
        cut6: isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
        cut7: isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
        cut8: isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
      };

      const retirementDispatchObservabilityCut6Blocked = buildMainPathRetirementDispatchV1({
        reply_channel: replyChannel === "web" ? "web" : "email",
        dispatch_intent: dispatchIntent,
        final_wedding_id: finalWeddingId,
        dispatchResult: { kind: "cut6_d1_blocked_no_dispatch" },
        gates: retirementGateFlagsCut6Blocked,
      });
      logRetirementDispatchV1(retirementDispatchObservabilityCut6Blocked);

      const cut6MainPathLiveForExec =
        isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled() &&
        dispatchIntent === "logistics" &&
        !!finalWeddingId;

      const shadowOrchestratorCut6Blocked = await step.run(
        "shadow-orchestrator-client-v1",
        async () => ({ status: "skipped_cut6_d1_blocked_no_dispatch" as const }),
      );

      return {
        status: "cut6_main_path_logistics_d1_blocked_no_dispatch",
        reason_code: "CUT6_OFF_AND_D1_LEGACY_DISALLOWED",
        reason:
          `No AI dispatch: CUT6 is off and ${TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1_ENV} disallows legacy logistics. ` +
          `Enable ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV}=1 for orchestrator, or relax the D1 env.`,
        weddingId: finalWeddingId,
        projectStage: identity.projectStage,
        llmIntent,
        enforcedIntent: stageGateIntent,
        dispatch_intent: dispatchIntent,
        cut6_main_path_logistics_d1_prep: buildCut6MainPathLogisticsD1ExecV2({
          d1LegacyWhenCut6OffAllowed: false,
          cut6MainPathLive: cut6MainPathLiveForExec,
        }),
        retirement_dispatch_observability_v1: retirementDispatchObservabilityCut6Blocked,
        wedding_resolution_trace: {
          ...weddingResolutionTrace,
          ...(nearMatchEscalationId
            ? { unresolved_match_approval_escalation_id: nearMatchEscalationId }
            : {}),
        },
        reply_channel: replyChannel,
        threadId: threadInfo.threadId,
        main_path_logistics_live_dispatch: "__cut6_main_path_logistics_d1_blocked_no_dispatch__",
        shadow_orchestrator: shadowOrchestratorCut6Blocked,
        orchestrator_client_v1_live_cutover: getOrchestratorClientV1LiveCutoverReadiness(),
        orchestrator_client_v1_live_cutover_main_path_concierge:
          getMainPathConciergeKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_project_management:
          getMainPathProjectManagementKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_logistics:
          getMainPathLogisticsKnownWeddingOrchestratorLiveCutoverReadiness(false),
        orchestrator_client_v1_live_cutover_main_path_commercial:
          getMainPathCommercialKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_studio:
          getMainPathStudioKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
          ),
      };
    }

    if (dispatchResult.kind === "cut7_d1_blocked_no_dispatch") {
      const retirementGateFlagsCut7Blocked = {
        cut4: isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
        cut5: isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
        cut6: isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
        cut7: isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
        cut8: isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
      };

      const retirementDispatchObservabilityCut7Blocked = buildMainPathRetirementDispatchV1({
        reply_channel: replyChannel === "web" ? "web" : "email",
        dispatch_intent: dispatchIntent,
        final_wedding_id: finalWeddingId,
        dispatchResult: { kind: "cut7_d1_blocked_no_dispatch" },
        gates: retirementGateFlagsCut7Blocked,
      });
      logRetirementDispatchV1(retirementDispatchObservabilityCut7Blocked);

      const cut7MainPathLiveForExec =
        isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled() &&
        dispatchIntent === "commercial" &&
        !!finalWeddingId;

      const shadowOrchestratorCut7Blocked = await step.run(
        "shadow-orchestrator-client-v1",
        async () => ({ status: "skipped_cut7_d1_blocked_no_dispatch" as const }),
      );

      return {
        status: "cut7_main_path_commercial_d1_blocked_no_dispatch",
        reason_code: "CUT7_OFF_AND_D1_LEGACY_DISALLOWED",
        reason:
          `No AI dispatch: CUT7 is off and ${TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1_ENV} disallows legacy commercial. ` +
          `Enable ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV}=1 for orchestrator, or relax the D1 env.`,
        weddingId: finalWeddingId,
        projectStage: identity.projectStage,
        llmIntent,
        enforcedIntent: stageGateIntent,
        dispatch_intent: dispatchIntent,
        cut7_main_path_commercial_d1_prep: buildCut7MainPathCommercialD1ExecV2({
          d1LegacyWhenCut7OffAllowed: false,
          cut7MainPathLive: cut7MainPathLiveForExec,
        }),
        retirement_dispatch_observability_v1: retirementDispatchObservabilityCut7Blocked,
        wedding_resolution_trace: {
          ...weddingResolutionTrace,
          ...(nearMatchEscalationId
            ? { unresolved_match_approval_escalation_id: nearMatchEscalationId }
            : {}),
        },
        reply_channel: replyChannel,
        threadId: threadInfo.threadId,
        main_path_commercial_live_dispatch: "__cut7_main_path_commercial_d1_blocked_no_dispatch__",
        shadow_orchestrator: shadowOrchestratorCut7Blocked,
        orchestrator_client_v1_live_cutover: getOrchestratorClientV1LiveCutoverReadiness(),
        orchestrator_client_v1_live_cutover_main_path_concierge:
          getMainPathConciergeKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_project_management:
          getMainPathProjectManagementKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_logistics:
          getMainPathLogisticsKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_commercial:
          getMainPathCommercialKnownWeddingOrchestratorLiveCutoverReadiness(false),
        orchestrator_client_v1_live_cutover_main_path_studio:
          getMainPathStudioKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
          ),
      };
    }

    if (dispatchResult.kind === "cut8_d1_blocked_no_dispatch") {
      const retirementGateFlagsCut8Blocked = {
        cut4: isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
        cut5: isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
        cut6: isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
        cut7: isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
        cut8: isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
      };

      const retirementDispatchObservabilityCut8Blocked = buildMainPathRetirementDispatchV1({
        reply_channel: replyChannel === "web" ? "web" : "email",
        dispatch_intent: dispatchIntent,
        final_wedding_id: finalWeddingId,
        dispatchResult: { kind: "cut8_d1_blocked_no_dispatch" },
        gates: retirementGateFlagsCut8Blocked,
      });
      logRetirementDispatchV1(retirementDispatchObservabilityCut8Blocked);

      const cut8MainPathLiveForExec =
        isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled() &&
        dispatchIntent === "studio" &&
        !!finalWeddingId;

      const shadowOrchestratorCut8Blocked = await step.run(
        "shadow-orchestrator-client-v1",
        async () => ({ status: "skipped_cut8_d1_blocked_no_dispatch" as const }),
      );

      return {
        status: "cut8_main_path_studio_d1_blocked_no_dispatch",
        reason_code: "CUT8_OFF_AND_D1_LEGACY_DISALLOWED",
        reason:
          `No AI dispatch: CUT8 is off and ${TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1_ENV} disallows legacy studio. ` +
          `Enable ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV}=1 for orchestrator, or relax the D1 env.`,
        weddingId: finalWeddingId,
        projectStage: identity.projectStage,
        llmIntent,
        enforcedIntent: stageGateIntent,
        dispatch_intent: dispatchIntent,
        cut8_main_path_studio_d1_prep: buildCut8MainPathStudioD1ExecV2({
          d1LegacyWhenCut8OffAllowed: false,
          cut8MainPathLive: cut8MainPathLiveForExec,
        }),
        retirement_dispatch_observability_v1: retirementDispatchObservabilityCut8Blocked,
        wedding_resolution_trace: {
          ...weddingResolutionTrace,
          ...(nearMatchEscalationId
            ? { unresolved_match_approval_escalation_id: nearMatchEscalationId }
            : {}),
        },
        reply_channel: replyChannel,
        threadId: threadInfo.threadId,
        main_path_studio_live_dispatch: "__cut8_main_path_studio_d1_blocked_no_dispatch__",
        shadow_orchestrator: shadowOrchestratorCut8Blocked,
        orchestrator_client_v1_live_cutover: getOrchestratorClientV1LiveCutoverReadiness(),
        orchestrator_client_v1_live_cutover_main_path_concierge:
          getMainPathConciergeKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_project_management:
          getMainPathProjectManagementKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_logistics:
          getMainPathLogisticsKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_commercial:
          getMainPathCommercialKnownWeddingOrchestratorLiveCutoverReadiness(
            isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
          ),
        orchestrator_client_v1_live_cutover_main_path_studio:
          getMainPathStudioKnownWeddingOrchestratorLiveCutoverReadiness(false),
      };
    }

    const retirementGateFlags = {
      cut4: isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
      cut5: isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
      cut6: isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
      cut7: isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
      cut8: isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
    };

    const retirementDispatchObservabilityMain = buildMainPathRetirementDispatchV1({
      reply_channel: replyChannel === "web" ? "web" : "email",
      dispatch_intent: dispatchIntent,
      final_wedding_id: finalWeddingId,
      dispatchResult:
        dispatchResult.kind === "legacy"
          ? { kind: "legacy", legacyEvent: dispatchResult.legacyEvent as string }
          : dispatchResult,
      gates: retirementGateFlags,
    });
    logRetirementDispatchV1(retirementDispatchObservabilityMain);

    // ── Shadow fanout (Phase 2 C1): parallel observation only; legacy dispatch above is authoritative ──
    const cut4MainPathConciergeKnownWeddingTurn =
      dispatchIntent === "concierge" && finalWeddingId != null;
    const cut5MainPathProjectManagementKnownWeddingTurn =
      dispatchIntent === "project_management" && finalWeddingId != null;
    const cut6MainPathLogisticsKnownWeddingTurn =
      dispatchIntent === "logistics" && finalWeddingId != null;
    const cut7MainPathCommercialKnownWeddingTurn =
      dispatchIntent === "commercial" && finalWeddingId != null;
    const cut8MainPathStudioKnownWeddingTurn =
      dispatchIntent === "studio" && finalWeddingId != null;

    const shadowOrchestrator = await step.run("shadow-orchestrator-client-v1", async () => {
      const cut4MainPathLive =
        isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled() &&
        dispatchIntent === "concierge" &&
        !!finalWeddingId;
      const cut5MainPathLive =
        isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled() &&
        dispatchIntent === "project_management" &&
        !!finalWeddingId;
      const cut6MainPathLive =
        isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled() &&
        dispatchIntent === "logistics" &&
        !!finalWeddingId;
      const cut7MainPathLive =
        isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled() &&
        dispatchIntent === "commercial" &&
        !!finalWeddingId;
      const cut8MainPathLive =
        isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled() &&
        dispatchIntent === "studio" &&
        !!finalWeddingId;
      if (cut4MainPathLive || cut5MainPathLive || cut6MainPathLive || cut7MainPathLive || cut8MainPathLive) {
        return { status: "skipped_live_cutover_active" as const };
      }
      if (!isTriageShadowOrchestratorClientV1Enabled()) {
        return { status: "disabled" as const };
      }
      if (dispatchIntent === "intake") {
        return { status: "skipped_intake" as const };
      }
      if (!finalPhotographerId || !threadInfo.threadId) {
        return { status: "skipped_missing_tenant_thread" as const };
      }
      try {
        await inngest.send({
          name: ORCHESTRATOR_CLIENT_V1_EVENT,
          data: {
            schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
            photographerId: finalPhotographerId,
            weddingId: finalWeddingId ?? null,
            threadId: threadInfo.threadId,
            replyChannel: replyChannel === "web" ? "web" : "email",
            rawMessage: body,
            requestedExecutionMode: "auto",
            shadowCorrelationId: crypto.randomUUID(),
            legacyTriageIntent: dispatchIntent,
            shadowFanoutSource: "triage_main",
          },
        });
        return { status: "sent" as const };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[triage] shadow orchestrator fanout failed (non-fatal):", msg);
        return { status: "failed" as const, error: msg };
      }
    });

    return {
      status: "routed",
      weddingId: finalWeddingId,
      projectStage: identity.projectStage,
      llmIntent,
      enforcedIntent: stageGateIntent,
      dispatch_intent: dispatchIntent,
      ...(cut4MainPathConciergeKnownWeddingTurn
        ? {
            cut4_main_path_concierge_d1_prep: buildCut4MainPathConciergeD1ExecV2({
              d1LegacyWhenCut4OffAllowed:
                isTriageD1Cut4MainPathConciergeLegacyConciergeDispatchWhenCut4OffAllowed(),
              cut4MainPathLive:
                isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled() &&
                dispatchIntent === "concierge" &&
                !!finalWeddingId,
            }),
          }
        : {}),
      ...(cut5MainPathProjectManagementKnownWeddingTurn
        ? {
            cut5_main_path_project_management_d1_prep: buildCut5MainPathProjectManagementD1ExecV2({
              d1LegacyWhenCut5OffAllowed:
                isTriageD1Cut5MainPathProjectManagementLegacyDispatchWhenCut5OffAllowed(),
              cut5MainPathLive:
                isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled() &&
                dispatchIntent === "project_management" &&
                !!finalWeddingId,
            }),
          }
        : {}),
      ...(cut6MainPathLogisticsKnownWeddingTurn
        ? {
            cut6_main_path_logistics_d1_prep: buildCut6MainPathLogisticsD1ExecV2({
              d1LegacyWhenCut6OffAllowed:
                isTriageD1Cut6MainPathLogisticsLegacyDispatchWhenCut6OffAllowed(),
              cut6MainPathLive:
                isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled() &&
                dispatchIntent === "logistics" &&
                !!finalWeddingId,
            }),
          }
        : {}),
      ...(cut7MainPathCommercialKnownWeddingTurn
        ? {
            cut7_main_path_commercial_d1_prep: buildCut7MainPathCommercialD1ExecV2({
              d1LegacyWhenCut7OffAllowed:
                isTriageD1Cut7MainPathCommercialLegacyDispatchWhenCut7OffAllowed(),
              cut7MainPathLive:
                isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled() &&
                dispatchIntent === "commercial" &&
                !!finalWeddingId,
            }),
          }
        : {}),
      ...(cut8MainPathStudioKnownWeddingTurn
        ? {
            cut8_main_path_studio_d1_prep: buildCut8MainPathStudioD1ExecV2({
              d1LegacyWhenCut8OffAllowed:
                isTriageD1Cut8MainPathStudioLegacyDispatchWhenCut8OffAllowed(),
              cut8MainPathLive:
                isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled() &&
                dispatchIntent === "studio" &&
                !!finalWeddingId,
            }),
          }
        : {}),
      retirement_dispatch_observability_v1: retirementDispatchObservabilityMain,
      wedding_resolution_trace: {
        ...weddingResolutionTrace,
        ...(nearMatchEscalationId
          ? { unresolved_match_approval_escalation_id: nearMatchEscalationId }
          : {}),
      },
      reply_channel: replyChannel,
      threadId: threadInfo.threadId,
      ...(dispatchResult.kind === "near_match_approval_escalation"
        ? { intake_skipped_for_near_match_escalation: true as const }
        : {}),
      ...(dispatchResult.kind === "cut4_live"
        ? {
            cut4_live_correlation_id: dispatchResult.cut4LiveCorrelationId,
            main_path_concierge_live_dispatch: ORCHESTRATOR_CLIENT_V1_EVENT,
          }
        : {}),
      ...(dispatchResult.kind === "cut5_live"
        ? {
            cut5_live_correlation_id: dispatchResult.cut5LiveCorrelationId,
            main_path_project_management_live_dispatch: ORCHESTRATOR_CLIENT_V1_EVENT,
          }
        : {}),
      ...(dispatchResult.kind === "cut6_live"
        ? {
            cut6_live_correlation_id: dispatchResult.cut6LiveCorrelationId,
            main_path_logistics_live_dispatch: ORCHESTRATOR_CLIENT_V1_EVENT,
          }
        : {}),
      ...(dispatchResult.kind === "cut7_live"
        ? {
            cut7_live_correlation_id: dispatchResult.cut7LiveCorrelationId,
            main_path_commercial_live_dispatch: ORCHESTRATOR_CLIENT_V1_EVENT,
          }
        : {}),
      ...(dispatchResult.kind === "cut8_live"
        ? {
            cut8_live_correlation_id: dispatchResult.cut8LiveCorrelationId,
            main_path_studio_live_dispatch: ORCHESTRATOR_CLIENT_V1_EVENT,
          }
        : {}),
      ...(dispatchResult.kind === "intake"
        ? { intake_legacy_dispatch: "ai/intent.intake" as const }
        : {}),
      shadow_orchestrator: shadowOrchestrator,
      orchestrator_client_v1_live_cutover: getOrchestratorClientV1LiveCutoverReadiness(),
      orchestrator_client_v1_live_cutover_main_path_concierge:
        getMainPathConciergeKnownWeddingOrchestratorLiveCutoverReadiness(
          isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(),
        ),
      orchestrator_client_v1_live_cutover_main_path_project_management:
        getMainPathProjectManagementKnownWeddingOrchestratorLiveCutoverReadiness(
          isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(),
        ),
      orchestrator_client_v1_live_cutover_main_path_logistics:
        getMainPathLogisticsKnownWeddingOrchestratorLiveCutoverReadiness(
          isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(),
        ),
      orchestrator_client_v1_live_cutover_main_path_commercial:
        getMainPathCommercialKnownWeddingOrchestratorLiveCutoverReadiness(
          isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(),
        ),
      orchestrator_client_v1_live_cutover_main_path_studio:
        getMainPathStudioKnownWeddingOrchestratorLiveCutoverReadiness(
          isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(),
        ),
    };
  },
);
