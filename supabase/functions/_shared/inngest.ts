/**
 * Inngest client + event dictionary (Atelier OS).
 * Event names match docs/ARCHITECTURE.md Section 2.
 *
 * Set INNGEST_EVENT_KEY (and signing key for the serve endpoint) in Supabase secrets.
 *
 * ## Phase 7 Step 7A — event versioning (execute_v3.md)
 *
 * - Do not delete legacy event names during transition; old and new shapes coexist.
 * - When a contract diverges, add a **new** versioned name (e.g. `*.v1`) and/or a `schemaVersion` field in the payload.
 * - New workers subscribe to versioned events; legacy webhooks and workers keep using unversioned names until cutover.
 */
import { EventSchemas, Inngest } from "npm:inngest@3";

/** Versioned CRM stage event (Phase 7A); legacy `crm/stage.updated` remains the default fan-out for existing workers. */
export const CRM_STAGE_UPDATED_V1_EVENT = "crm/stage.updated.v1" as const;
/** Payload `schemaVersion` for `CRM_STAGE_UPDATED_V1_EVENT`; increment only when fields or semantics change. */
export const CRM_STAGE_UPDATED_V1_SCHEMA_VERSION = 1 as const;

/**
 * Phase 7 Step 7B — client orchestrator (email/web).
 *
 * **Live path from `triage`:** Default legacy `ai/intent.*`. **CUT2 (web widget known-wedding only):** optional live
 * dispatch when `TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1=1` with `requestedExecutionMode: "draft_only"`
 * (approval-style draft path). Otherwise QA/replay, **shadow** fanout, or explicit sends.
 *
 * **QA/replay:** Emit explicitly (e.g. `qa_runner`) without triage.
 *
 * **Phase 2 Slice C1 (shadow):** When `TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1=1`, `triage` may emit this event in parallel
 * for supported email/web non-intake traffic — observation only — except when CUT2 live is active for web-widget, CUT4
 * live for main-path concierge, CUT5 live for main-path project_management, CUT6 live for main-path logistics, CUT7
 * live for main-path commercial, or CUT8 live for main-path studio (shadow skipped that turn).
 *
 * **Phase 2 B3:** Optional `shadowCorrelationId` / `legacyTriageIntent` / `shadowFanoutSource` on shadow-origin
 * payloads from `triage` for readiness comparison logs (QA callers and CUT2 live emits omit).
 *
 * **Intake post-bootstrap parity (observation):** Optional `intakeParityCorrelationId` +
 * `intakeParityFanoutSource: "intake_post_bootstrap_parity"` from `intake` when
 * `INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1=1` — distinct from B3 shadow and CUT2–CUT8; worker skips draft +
 * escalation **DB writes** (proposals + verifier + logs only); does not replace persona.
 *
 * **Intake post-bootstrap live (email-only):** Optional `intakeLiveCorrelationId` +
 * `intakeLiveFanoutSource: "intake_post_bootstrap_live_email"` from `intake` when
 * `INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1=1` and `reply_channel === "email"` — **live** `draft_only`
 * path (drafts/escalation may apply); **no** persona handoff that turn. Mutually exclusive with parity send from intake.
 *
 * **Intake + web payload (non–client-intake roadmap):** Optional `intakeLiveWebCorrelationId` +
 * `intakeLiveWebFanoutSource: "intake_post_bootstrap_live_web"` when the web gate is on and `reply_channel === "web"`.
 * Dashboard web is photographer ↔ Ana — **not** a client intake lane; see intake migration doc §0.
 */
export const ORCHESTRATOR_CLIENT_V1_EVENT = "ai/orchestrator.client.v1" as const;
export const ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION = 1 as const;

/**
 * Phase 8 Step 8A — operator WhatsApp lane (`execute_v3.md`).
 * Inbound: photographer → operator orchestrator. Outbound: Ana → photographer (clarifications, escalations, high-signal).
 *
 * Step 8D — **do not** use generic `comms/whatsapp.*` for new ingress; use explicit client vs operator names below.
 */
export const WHATSAPP_OPERATOR_INBOUND_V1_EVENT = "operator/whatsapp.inbound.v1" as const;
export const WHATSAPP_OPERATOR_OUTBOUND_V1_EVENT = "operator/whatsapp.outbound.v1" as const;
export const WHATSAPP_OPERATOR_V1_SCHEMA_VERSION = 1 as const;

/** Client WhatsApp → `whatsappOrchestrator` (replaces ambiguous `comms/whatsapp.received.v2` for new emits). */
export const CLIENT_WHATSAPP_INBOUND_V1_EVENT = "client/whatsapp.inbound.v1" as const;
export const CLIENT_WHATSAPP_V1_SCHEMA_VERSION = 1 as const;

/**
 * Triage → `ai/intent.internal_concierge` only (legacy). Prefer this over `comms/whatsapp.received` for new emits.
 * Twilio operator lane uses `WHATSAPP_OPERATOR_INBOUND_V1_EVENT` instead.
 */
export const OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT = "operator/whatsapp.legacy.received" as const;

/**
 * Phase 8 Step 8E — after `escalation_requests` insert with `operator_delivery`, triage surfaces:
 * urgent_now → WhatsApp; batch_later → digest hold; dashboard_only → no push.
 */
export const OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT =
  "operator/escalation.pending_delivery.v1" as const;
export const OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION = 1 as const;

export type OperatorEscalationDeliveryPolicy = "urgent_now" | "batch_later" | "dashboard_only";

export type AtelierEvents = {
  "comms/email.received": {
    data: {
      raw_email: Record<string, unknown>;
    };
  };
  /** @deprecated Step 8D — prefer `OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT` for triage→internal concierge. */
  "comms/whatsapp.received": {
    data: {
      raw_message: unknown;
      photographer_id?: string;
    };
  };
  [OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT]: {
    data: {
      raw_message: unknown;
      photographer_id?: string;
    };
  };
  /** @deprecated Step 8D — prefer `CLIENT_WHATSAPP_INBOUND_V1_EVENT` for client WhatsApp orchestration. */
  "comms/whatsapp.received.v2": {
    data: {
      photographerId: string;
      weddingId: string | null;
      threadId: string | null;
      rawMessage: string;
    };
  };
  [CLIENT_WHATSAPP_INBOUND_V1_EVENT]: {
    data: {
      schemaVersion: typeof CLIENT_WHATSAPP_V1_SCHEMA_VERSION;
      photographerId: string;
      weddingId: string | null;
      threadId: string | null;
      rawMessage: string;
      lane: "client";
    };
  };
  "comms/web.received": {
    data: {
      raw_message: unknown;
      photographer_id?: string;
    };
  };
  "ai/draft.generate_requested": {
    data: {
      wedding_id: string;
    };
  };
  "approval/draft.submitted": {
    data: {
      draft_id: string;
    };
  };
  "approval/draft.approved": {
    data: {
      draft_id: string;
      /** Tenant id from verified JWT at the edge — outbound also enforces via `claim_draft_for_outbound`. */
      photographer_id: string;
      /** When set, replaces draft body atomically with the claim. */
      edited_body?: string | null;
    };
  };
  "ai/draft.rewrite_requested": {
    data: {
      draft_id: string;
      feedback: string;
    };
  };

  "ai/intent.intake": {
    data: {
      photographer_id: string;
      wedding_id?: string;
      thread_id?: string;
      raw_message: string;
      sender_email: string;
      reply_channel?: string;
    };
  };
  "ai/intent.commercial": {
    data: {
      wedding_id: string;
      photographer_id: string;
      raw_message: string;
      reply_channel?: string;
    };
  };
  "ai/intent.logistics": {
    data: {
      wedding_id: string;
      photographer_id: string;
      raw_message: string;
      reply_channel?: string;
    };
  };
  "ai/intent.project_management": {
    data: {
      wedding_id: string;
      photographer_id: string;
      raw_message: string;
      reply_channel?: string;
    };
  };
  "ai/intent.concierge": {
    data: {
      wedding_id: string;
      photographer_id: string;
      raw_message: string;
      reply_channel?: string;
    };
  };
  "ai/intent.studio": {
    data: {
      wedding_id: string;
      photographer_id: string;
      raw_message: string;
      reply_channel?: string;
    };
  };
  "ai/intent.persona": {
    data: {
      wedding_id: string;
      thread_id: string;
      photographer_id: string;
      raw_facts: string;
      reply_channel?: string;
      /** QA simulators only — correlates Edge `persona_metrics` logs to a turn. */
      qa_sim_turn?: number;
    };
  };
  "ai/intent.internal_concierge": {
    data: {
      photographer_id: string;
      from_number: string;
      raw_message: string;
    };
  };
  "calendar/event.booked": {
    data: {
      eventId: string;
      photographerId: string;
      weddingId: string;
      startTime: string;
    };
  };
  "crm/stage.updated": {
    data: {
      weddingId: string;
      photographerId: string;
      previousStage: string;
      newStage: string;
    };
  };
  "crm/stage.updated.v1": {
    data: {
      schemaVersion: typeof CRM_STAGE_UPDATED_V1_SCHEMA_VERSION;
      weddingId: string;
      photographerId: string;
      previousStage: string;
      newStage: string;
    };
  };
  [ORCHESTRATOR_CLIENT_V1_EVENT]: {
    data: {
      schemaVersion: typeof ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION;
      photographerId: string;
      weddingId: string | null;
      threadId: string | null;
      replyChannel: "email" | "web";
      rawMessage: string;
      requestedExecutionMode?: "auto" | "draft_only" | "ask_first" | "forbidden";
      /** Phase 2 B3 — set by `triage` shadow fanout only; correlates orchestrator run to legacy turn. */
      shadowCorrelationId?: string;
      legacyTriageIntent?: string;
      shadowFanoutSource?: "triage_main" | "triage_web_widget";
      /** V3 CUT3 — live CUT2 web-widget only; pairs with `cut2LiveFanoutSource`. */
      cut2LiveCorrelationId?: string;
      cut2LiveFanoutSource?: "triage_web_widget_live";
      /** V3 CUT4 — main-path concierge + known wedding; pairs with `cut4LiveFanoutSource`. */
      cut4LiveCorrelationId?: string;
      cut4LiveFanoutSource?: "triage_main_concierge_live";
      /** V3 CUT5 — main-path project_management + known wedding; pairs with `cut5LiveFanoutSource`. */
      cut5LiveCorrelationId?: string;
      cut5LiveFanoutSource?: "triage_main_project_management_live";
      /** V3 CUT6 — main-path logistics + known wedding; pairs with `cut6LiveFanoutSource`. */
      cut6LiveCorrelationId?: string;
      cut6LiveFanoutSource?: "triage_main_logistics_live";
      /** V3 CUT7 — main-path commercial + known wedding; pairs with `cut7LiveFanoutSource`. */
      cut7LiveCorrelationId?: string;
      cut7LiveFanoutSource?: "triage_main_commercial_live";
      /** V3 CUT8 — main-path studio + known wedding; pairs with `cut8LiveFanoutSource`. */
      cut8LiveCorrelationId?: string;
      cut8LiveFanoutSource?: "triage_main_studio_live";
      /** Intake post-bootstrap parity — observation only; pairs with `intakeParityFanoutSource`. */
      intakeParityCorrelationId?: string;
      intakeParityFanoutSource?: "intake_post_bootstrap_parity";
      /** Intake post-bootstrap live (email-only); pairs with `intakeLiveFanoutSource`. */
      intakeLiveCorrelationId?: string;
      intakeLiveFanoutSource?: "intake_post_bootstrap_live_email";
      /** Intake post-bootstrap live (web-only); pairs with `intakeLiveWebFanoutSource`. */
      intakeLiveWebCorrelationId?: string;
      intakeLiveWebFanoutSource?: "intake_post_bootstrap_live_web";
    };
  };
  /** Operator lane — photographer → Ana (Twilio webhook / primary operator ingress). */
  [WHATSAPP_OPERATOR_INBOUND_V1_EVENT]: {
    data: {
      schemaVersion: typeof WHATSAPP_OPERATOR_V1_SCHEMA_VERSION;
      /** Resolved tenant (`photographers.id`) for the operator studio. */
      photographerId: string;
      /** Normalized or verified operator WhatsApp sender id. */
      operatorFromNumber: string;
      rawMessage: string;
      lane: "operator";
    };
  };
  /** Operator lane — Ana → photographer (clarifications, escalations, notifications only). */
  [WHATSAPP_OPERATOR_OUTBOUND_V1_EVENT]: {
    data: {
      schemaVersion: typeof WHATSAPP_OPERATOR_V1_SCHEMA_VERSION;
      photographerId: string;
      kind: "clarification" | "escalation" | "notification";
      body: string;
      lane: "operator";
    };
  };
  [OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT]: {
    data: {
      schemaVersion: typeof OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION;
      photographerId: string;
      escalationId: string;
      operatorDelivery: OperatorEscalationDeliveryPolicy;
      questionBody: string;
      threadId: string | null;
    };
  };
};

export const inngest = new Inngest({
  id: "atelier-os",
  schemas: new EventSchemas().fromRecord<AtelierEvents>(),
});
