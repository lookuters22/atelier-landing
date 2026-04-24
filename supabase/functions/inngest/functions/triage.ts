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
 * **Deterministic inquiry dedup (default on):** `TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1` — tenant-bounded roster pass (contact graph +
 * conservative text signals, no LLM) before the conditional matchmaker; can auto-file or near-match escalate on **intake** cold leads.
 * Rollback: set to `0` / `false` / `off` / `no`.
 * Optional **bounded** LLM matchmaker: `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1` — see
 * `docs/v3/UNFILED_UNRESOLVED_MATCHING_SLICE.md`. Does not apply to dashboard web (`comms/web.received`).
 * **Near-match approval escalation:** `TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1` — for LLM path, requires the
 * bounded matchmaker gate; for **deterministic** near-matches, only this approval gate is required — confidence in [75, 90) with a
 * candidate id → `escalation_requests` + dashboard signal; no auto-file, no intake dispatch.
 *
 * **Pre-LLM non-client suppression (`comms/email.received` only):** `classifyInboundSuppression` runs before triage LLM + matchmaker.
 * When suppressed, persists thread + message with `promo_automated` / `suppression_classifier_v1` metadata and returns
 * `suppressed_non_client_email` — no `ai/intent.*` or orchestrator dispatch (parity with Gmail post-ingest suppression gate).
 *
 * **Deterministic billing / account ingress (after suppression, before LLM / dedup):** human invoice / payment / banking-style
 * mail that is not suppressible as promo/system is tagged `sender_role: billing_or_account_followup` and returns
 * `deterministic_billing_account_operator_review` — no inquiry dedup or `ai/intent.*`.
 *
 * **Deterministic vendor / partnership ingress (after billing, before LLM / dedup):** conservative human pitch / agency /
 * editorial outreach → `vendor_solicitation` or `partnership_or_collaboration`, return
 * `deterministic_vendor_partnership_operator_review`. Billing/account matcher takes precedence when both could apply.
 *
 * **Deterministic recruiter / job ingress (after vendor/partnership, before LLM / dedup):** human talent / staffing /
 * hiring outreach → `recruiter_or_job_outreach`, return `deterministic_recruiter_job_operator_review`. Billing and
 * vendor/partnership matchers take precedence when they match.
 *
 * **Gmail post-ingest parity:** `inbox/thread.requires_triage.v1` runs the same `evaluateDeterministicHumanNonClientIngress`
 * ordering after Layer-1/1b suppression and before the LLM (metadata-only update on the canonical thread).
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
  isTriageShadowOrchestratorClientV1Enabled,
} from "../../_shared/orchestrator/legacyOrchestratorCutoverGate.ts";
import { isTriageBoundedUnresolvedEmailMatchmakerEnabled } from "../../_shared/triage/triageRoutingFlags.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { runTriageAgent, type TriageIntent } from "../../_shared/agents/triage.ts";
import { applyUnlinkedWeddingLeadIntakeBoost } from "../../_shared/triage/unlinkedWeddingLeadIntakeBoost.ts";
import { insertBoundedUnresolvedMatchApprovalEscalation } from "../../_shared/triage/boundedUnresolvedMatchApprovalEscalation.ts";
import {
  buildAiRoutingMetadataForUnresolved,
  buildAiRoutingMetadataNonWeddingBusinessInquiry,
  deriveEmailIngressRouting,
  type MatchmakerStepResult,
  resolveDeterministicIdentity,
  runConditionalMatchmakerForEmail,
  enforceStageGate,
} from "../../_shared/triage/emailIngressClassification.ts";
import { routeNonWeddingBusinessInquiry } from "../../_shared/triage/nonWeddingBusinessInquiryRouter.ts";
import {
  orchestratorInboundSenderFields,
  runMainPathEmailDispatch,
  type MainPathEmailDispatchResult,
} from "../../_shared/triage/runMainPathEmailDispatch.ts";
import {
  buildMainPathRetirementDispatchV1,
  buildUnfiledEarlyExitRetirementDispatchV1,
  buildWebWidgetRetirementDispatchV1,
  logRetirementDispatchV1,
} from "../../_shared/triage/retirementDispatchObservabilityV1.ts";
import {
  deterministicIngressPersistErrorLabel,
  emailIngressSubjectLineFromPayload,
  evaluateDeterministicHumanNonClientIngress,
  persistDeterministicOperatorReviewIngressThread,
} from "../../_shared/triage/deterministicOperatorReviewIngress.ts";
import {
  evaluateRawEmailIngressSuppression,
  extractReplyToFromRawEmailPayload,
} from "../../_shared/triage/rawEmailIngressSuppressionGate.ts";
import { resolveIngressIdentitySenderEmail } from "../../_shared/triage/ingressSenderEmailNormalize.ts";
import {
  buildPreIngressSourceObservabilityRecord,
  logPreIngressSourceObservabilityRecord,
} from "../../_shared/triage/preIngressSourceObservability.ts";
import {
  buildLegacyRoutingRetirementReadinessRecord,
  logLegacyRoutingRetirementReadinessRecord,
} from "../../_shared/triage/legacyRoutingRetirementReadiness.ts";

// ── Stage gate + matchmaker: ../../_shared/triage/emailIngressClassification.ts ──

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

// Orchestrator sender fields: `runMainPathEmailDispatch.ts` (also used by shadow fan-out below).

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
    /**
     * Pre-ingress ingress (observability only; routing unchanged):
     * - **Web:** `comms/web.received` — still reachable in-repo (e.g. `webhook-web`).
     * - **Email:** `comms/email.received` — no in-repo emitter observed; branch remains for external/legacy producers.
     * Both events stay subscribed on this function; see `[triage.pre_ingress_source]` logs.
     */
    logLegacyRoutingRetirementReadinessRecord(
      buildLegacyRoutingRetirementReadinessRecord({
        triageRegistered: true,
        consumesCommsEmailReceived: true,
        consumesCommsWebReceived: true,
        webEmitterPresentInRepo: true,
        emailEmitterPresentInRepo: false,
      }),
    );
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

      logPreIngressSourceObservabilityRecord(
        buildPreIngressSourceObservabilityRecord({
          ingressEventName: event.name,
          replyChannel: "whatsapp",
          photographerIdPresent: Boolean(photographerId.trim()),
        }),
      );

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

    // ── Pre-ingress web vs email (WhatsApp returned above) ───────────
    // `comms/web.received` vs `comms/email.received` — shared pipeline below; observability classifies by `event.name` only.
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

    logPreIngressSourceObservabilityRecord(
      buildPreIngressSourceObservabilityRecord({
        ingressEventName: event.name,
        replyChannel: replyChannel === "web" ? "web" : "email",
        photographerIdPresent: Boolean(payloadPhotographerId?.trim()),
      }),
    );

    const { sender, body } = extractSenderAndBody(
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {},
    );

    const emailSubject =
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as Record<string, unknown>).subject === "string"
        ? ((payload as Record<string, unknown>).subject as string)
        : "";

    const headerSourceForReplyTo =
      "raw_email" in raw && raw.raw_email != null && typeof raw.raw_email === "object"
        ? (raw.raw_email as Record<string, unknown>)
        : typeof payload === "object" && payload !== null
          ? (payload as Record<string, unknown>)
          : null;
    const replyToForIdentity = extractReplyToFromRawEmailPayload(headerSourceForReplyTo);
    const senderEmailForIdentity = resolveIngressIdentitySenderEmail({
      fromOrSenderRaw: sender,
      replyToRaw: replyToForIdentity,
    });

    // ── Step 1: Deterministic Identity + Stage ────────────────────
    const identity = await step.run("deterministic-identity", async () =>
      resolveDeterministicIdentity(supabaseAdmin, {
        sender,
        replyToForIdentity,
        payloadPhotographerId,
      }),
    );

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

    // ── Step 1b: Non-client / non-inquiry suppression (`comms/email.received` only, before LLM) ──
    if (event.name === "comms/email.received" && payloadPhotographerId) {
      const nonClientSuppression = await step.run("raw-email-non-client-suppression", async () =>
        evaluateRawEmailIngressSuppression({
          rawEmail:
            typeof payload === "object" && payload !== null
              ? (payload as Record<string, unknown>)
              : null,
          senderRaw: sender,
          subject: emailSubject,
          body,
        }),
      );

      if (nonClientSuppression.suppressed) {
        const tenantId = identity.photographerId ?? payloadPhotographerId;
        const suppressedPersist = await step.run("persist-suppressed-non-client-email", async () => {
          const subjectLine =
            typeof (payload as Record<string, unknown>).subject === "string"
              ? ((payload as Record<string, unknown>).subject as string)
              : body.slice(0, 60);

          const routingMetadata: Record<string, unknown> = {
            routing_disposition: "promo_automated",
            heuristic_reasons: [...nonClientSuppression.reasons],
            routing_layer: "suppression_classifier_v1",
            suppression_verdict: nonClientSuppression.verdict,
            suppression_confidence: nonClientSuppression.confidence,
            suppression_ingress: "comms_email_received_pre_llm",
          };

          const { data: thread, error: threadErr } = await supabaseAdmin
            .from("threads")
            .insert({
              wedding_id: identity.weddingId ?? undefined,
              photographer_id: tenantId,
              title: subjectLine,
              kind: "group",
              ai_routing_metadata: routingMetadata,
            })
            .select("id")
            .single();

          if (threadErr || !thread) {
            throw new Error(`suppressed non-client email: thread insert failed: ${threadErr?.message}`);
          }

          const threadId = thread.id as string;

          const { error: msgErr } = await supabaseAdmin.from("messages").insert({
            thread_id: threadId,
            photographer_id: tenantId,
            direction: "in",
            sender: sender || "unknown",
            body,
          });
          if (msgErr) {
            throw new Error(`suppressed non-client email: message insert failed: ${msgErr.message}`);
          }

          return { threadId };
        });

        console.log(
          "[triage.suppressed_non_client_email]",
          JSON.stringify({
            photographer_id: tenantId,
            thread_id: suppressedPersist.threadId,
            verdict: nonClientSuppression.verdict,
            reasons: nonClientSuppression.reasons,
          }),
        );

        return {
          status: "suppressed_non_client_email",
          photographer_id: tenantId,
          wedding_id: identity.weddingId,
          thread_id: suppressedPersist.threadId,
          suppression_verdict: nonClientSuppression.verdict,
          suppression_reasons: nonClientSuppression.reasons,
          reply_channel: replyChannel,
        };
      }

      const humanNonClientIngress = await step.run("deterministic-human-non-client-ingress", async () =>
        evaluateDeterministicHumanNonClientIngress({
          subject: emailSubject,
          body,
        }),
      );

      if (humanNonClientIngress.match) {
        const tenantId = identity.photographerId ?? payloadPhotographerId;
        const ingressPersist = await step.run("persist-deterministic-human-non-client-ingress-thread", async () =>
          persistDeterministicOperatorReviewIngressThread(supabaseAdmin, {
            weddingId: identity.weddingId,
            tenantId,
            subjectLine: emailIngressSubjectLineFromPayload(payload as Record<string, unknown>, body),
            sender,
            body,
            routingMetadata: humanNonClientIngress.routingMetadata,
            errorLabel: deterministicIngressPersistErrorLabel(humanNonClientIngress.variant),
          }),
        );

        const logTag =
          humanNonClientIngress.variant === "billing"
            ? "[triage.deterministic_billing_account_ingress]"
            : humanNonClientIngress.variant === "vendor_partnership"
              ? "[triage.deterministic_vendor_partnership_ingress]"
              : "[triage.deterministic_recruiter_job_ingress]";
        console.log(
          logTag,
          JSON.stringify({
            photographer_id: tenantId,
            thread_id: ingressPersist.threadId,
            variant: humanNonClientIngress.variant,
            reason_codes: humanNonClientIngress.reason_codes,
            ...(humanNonClientIngress.variant === "vendor_partnership"
              ? { sender_role: humanNonClientIngress.sender_role }
              : {}),
          }),
        );

        if (humanNonClientIngress.variant === "billing") {
          return {
            status: humanNonClientIngress.triageReturnStatus,
            photographer_id: tenantId,
            wedding_id: identity.weddingId,
            thread_id: ingressPersist.threadId,
            deterministic_billing_reason_codes: humanNonClientIngress.reason_codes,
            reply_channel: replyChannel,
          };
        }
        if (humanNonClientIngress.variant === "vendor_partnership") {
          return {
            status: humanNonClientIngress.triageReturnStatus,
            photographer_id: tenantId,
            wedding_id: identity.weddingId,
            thread_id: ingressPersist.threadId,
            deterministic_vendor_partnership_sender_role: humanNonClientIngress.sender_role,
            deterministic_vendor_partnership_reason_codes: humanNonClientIngress.reason_codes,
            reply_channel: replyChannel,
          };
        }
        return {
          status: humanNonClientIngress.triageReturnStatus,
          photographer_id: tenantId,
          wedding_id: identity.weddingId,
          thread_id: ingressPersist.threadId,
          deterministic_recruiter_job_reason_codes: humanNonClientIngress.reason_codes,
          reply_channel: replyChannel,
        };
      }
    }

    // ── Step 2: Traffic Cop (Intent Classification) ──────────────
    const llmIntent = await step.run("classify-intent", async () => {
      const raw = await runTriageAgent(body);
      if (identity.weddingId) return raw;
      return applyUnlinkedWeddingLeadIntakeBoost(raw, body, emailSubject);
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
    const matchResult = await step.run("conditional-matchmaker", async (): Promise<MatchmakerStepResult> =>
      runConditionalMatchmakerForEmail(supabaseAdmin, {
        body,
        subject: emailSubject,
        senderEmail: senderEmailForIdentity,
        identity,
        stageGateIntent,
        boundedUnresolvedSubsetEligible,
        payloadPhotographerId,
      }),
    );

    const derived = deriveEmailIngressRouting({
      identity,
      llmIntent,
      stageGateIntent,
      matchResult,
      payloadPhotographerId,
      boundedUnresolvedSubsetEligible,
    });
    const {
      finalWeddingId,
      finalPhotographerId,
      matchCandidateId,
      matchConfidence,
      nearMatchForApproval,
      dispatchIntent,
      boundedUnresolved: boundedOutcome,
      weddingResolutionTrace,
      approvalEscalationGateOn,
    } = derived;

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

      const routingMetadata = buildAiRoutingMetadataForUnresolved({
        finalWeddingId,
        matchResult,
        dispatchIntent,
        nearMatchForApproval,
      });

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
          senderEmail: senderEmailForIdentity || sender || "",
        });
      },
    );

    if (nearMatchForApproval && !nearMatchEscalationId) {
      throw new Error("Near-match approval escalation was expected but escalation_requests insert returned no id.");
    }

    // ── Failsafe: Unfiled Inbox ──────────────────────────────────
    // With current `enforceStageGate`, no deterministic wedding forces `intake`, so this branch is
    // normally unreachable on the legacy main path; kept as a safety valve if gate logic changes.
    // When reached (e.g. gate is relaxed in future), delegate to the non-wedding business inquiry
    // policy router instead of silently returning unfiled. See UNFILED_UNRESOLVED_MATCHING_SLICE.md.
    if (dispatchIntent !== "intake" && !finalWeddingId) {
      const retirementDispatchObservabilityUnfiled = buildUnfiledEarlyExitRetirementDispatchV1({
        reply_channel: replyChannel === "web" ? "web" : "email",
        dispatch_intent: dispatchIntent,
      });
      logRetirementDispatchV1(retirementDispatchObservabilityUnfiled);

      const nonWeddingBusinessInquiryOutcome = await step.run(
        "route-non-wedding-business-inquiry",
        async () => {
          if (!finalPhotographerId || nearMatchForApproval) return null;
          return await routeNonWeddingBusinessInquiry(supabaseAdmin, {
            photographerId: finalPhotographerId,
            threadId: threadInfo.threadId,
            llmIntent,
            dispatchIntent,
            channel: replyChannel === "web" ? "web" : "email",
            senderEmail: senderEmailForIdentity || sender || "",
            body,
          });
        },
      );

      if (nonWeddingBusinessInquiryOutcome) {
        const updatedRoutingMetadata = buildAiRoutingMetadataNonWeddingBusinessInquiry({
          llmIntent,
          dispatchIntent,
          policyDecision: nonWeddingBusinessInquiryOutcome.decision,
          matchedPlaybookRuleId: nonWeddingBusinessInquiryOutcome.matchedPlaybookRuleId,
          matchedPlaybookActionKey: nonWeddingBusinessInquiryOutcome.matchedPlaybookActionKey,
          reasonCode: nonWeddingBusinessInquiryOutcome.reasonCode,
          draftId: nonWeddingBusinessInquiryOutcome.draftId,
          escalationId: nonWeddingBusinessInquiryOutcome.escalationId,
          decisionSource: nonWeddingBusinessInquiryOutcome.decisionSource,
          profileFit: nonWeddingBusinessInquiryOutcome.profileFit,
          profileFitReasonCodes: nonWeddingBusinessInquiryOutcome.profileFitReasonCodes,
        });

        await step.run("persist-non-wedding-business-inquiry-routing-metadata", async () => {
          const { error } = await supabaseAdmin
            .from("threads")
            .update({ ai_routing_metadata: updatedRoutingMetadata as Record<string, unknown> })
            .eq("id", threadInfo.threadId)
            .eq("photographer_id", finalPhotographerId);
          if (error) throw new Error(error.message);
        });

        return {
          status: "non_wedding_business_inquiry_routed",
          sender,
          intent: dispatchIntent,
          llmIntent,
          reply_channel: replyChannel,
          threadId: threadInfo.threadId,
          retirement_dispatch_observability_v1: retirementDispatchObservabilityUnfiled,
          matchSuggestion: updatedRoutingMetadata,
          non_wedding_business_inquiry: nonWeddingBusinessInquiryOutcome,
          wedding_resolution_trace: {
            ...weddingResolutionTrace,
            triage_unfiled_early_exit: true,
            non_wedding_business_inquiry_routed: true,
          },
          orchestrator_client_v1_live_cutover: getOrchestratorClientV1LiveCutoverReadiness(),
        };
      }

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
      async (): Promise<MainPathEmailDispatchResult> =>
        runMainPathEmailDispatch({
          nearMatchForApproval,
          nearMatchEscalationId,
          dispatchIntent,
          finalWeddingId,
          finalPhotographerId,
          threadId: threadInfo.threadId,
          body,
          sender,
          replyChannel,
          useExistingThreadIntakeEvent: false,
        }),
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
            ...orchestratorInboundSenderFields(sender),
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
