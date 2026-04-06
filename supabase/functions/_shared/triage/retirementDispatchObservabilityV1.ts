/**
 * RET1 — structured observability for legacy `ai/intent.*` vs `ai/orchestrator.client.v1` dispatch from triage.
 * See `docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md` §5.
 */
export const RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION = 1 as const;

/** Single log line prefix; parse JSON payload after the prefix in Inngest/ops. */
export const RETIREMENT_DISPATCH_V1_LOG_PREFIX = "[triage.retirement_dispatch_v1]" as const;

export type RetirementDispatchLaneV1 =
  | "legacy_ai_intent"
  | "orchestrator_client_v1_live"
  | "near_match_escalation"
  | "unfiled_no_dispatch"
  /** CUT2 web-widget only: D1 forbids legacy when CUT2 off — no ai/intent.concierge and no orchestrator send. */
  | "cut2_web_widget_d1_blocked_no_dispatch"
  /** CUT4 main-path only: D1 forbids legacy when CUT4 off — no ai/intent.concierge and no orchestrator send. */
  | "cut4_main_path_concierge_d1_blocked_no_dispatch"
  /** CUT5 main-path only: D1 forbids legacy when CUT5 off — no ai/intent.project_management and no orchestrator send. */
  | "cut5_main_path_project_management_d1_blocked_no_dispatch"
  /** CUT6 main-path only: D1 forbids legacy when CUT6 off — no ai/intent.logistics and no orchestrator send. */
  | "cut6_main_path_logistics_d1_blocked_no_dispatch"
  /** CUT7 main-path only: D1 forbids legacy when CUT7 off — no ai/intent.commercial and no orchestrator send. */
  | "cut7_main_path_commercial_d1_blocked_no_dispatch"
  /** CUT8 main-path only: D1 forbids legacy when CUT8 off — no ai/intent.studio and no orchestrator send. */
  | "cut8_main_path_studio_d1_blocked_no_dispatch";

export type RetirementDispatchBranchCodeV1 =
  | "CUT2_WEB_WIDGET"
  | "CUT4_MAIN_CONCIERGE"
  | "CUT5_MAIN_PM"
  | "CUT6_MAIN_LOGISTICS"
  | "CUT7_MAIN_COMMERCIAL"
  | "CUT8_MAIN_STUDIO"
  | "LEGACY_INTENT_MAP"
  | "LEGACY_INTAKE"
  | "NEAR_MATCH_ESCALATION"
  | "UNFILED_EARLY_EXIT"
  | "CUT2_D1_LEGACY_DISALLOWED_CUT2_OFF"
  | "CUT4_D1_LEGACY_DISALLOWED_CUT4_OFF"
  | "CUT5_D1_LEGACY_DISALLOWED_CUT5_OFF"
  | "CUT6_D1_LEGACY_DISALLOWED_CUT6_OFF"
  | "CUT7_D1_LEGACY_DISALLOWED_CUT7_OFF"
  | "CUT8_D1_LEGACY_DISALLOWED_CUT8_OFF";

export type RetirementDispatchObservabilityV1 = {
  schema_version: typeof RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION;
  /** Email main path vs dashboard web widget fast path */
  path_family: "main_path_email_web" | "web_widget_known_wedding";
  reply_channel: "email" | "web";
  /** Triage dispatch intent (stage-gated) */
  dispatch_intent: string;
  /**
   * Authoritative primary downstream Inngest event for this turn (what triage chose for client routing).
   * `ai/orchestrator.client.v1` for live cutover; `ai/intent.*` for legacy; escalation/unfiled use sentinel strings.
   */
  downstream_inngest_event: string;
  lane: RetirementDispatchLaneV1;
  branch_code: RetirementDispatchBranchCodeV1;
  /**
   * True when this turn used **legacy** `ai/intent.*` specialist routing but a **known wedding** + intent
   * combination **could** have taken the corresponding **CUT*** live orchestrator path if that env gate were on.
   * (Intake and unfiled / escalation paths are not rollback to CUT4–CUT8.)
   */
  rollback_capable: boolean;
};

const ORCH = "ai/orchestrator.client.v1" as const;

/** Sentinel when D1 execution blocks: CUT2 off + legacy disallowed by env (see CUT2 D1 doc). */
export const CUT2_WEB_WIDGET_D1_BLOCKED_DOWNSTREAM_SENTINEL =
  "__cut2_web_widget_d1_no_dispatch_cut2_off__" as const;

/** Sentinel when CUT4 D1 execution blocks: CUT4 off + legacy disallowed (see CUT4 D1 doc). */
export const CUT4_MAIN_PATH_CONCIERGE_D1_BLOCKED_DOWNSTREAM_SENTINEL =
  "__cut4_main_path_concierge_d1_no_dispatch_cut4_off__" as const;

/** Sentinel when CUT5 D1 execution blocks (see CUT5 D1 doc). */
export const CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_BLOCKED_DOWNSTREAM_SENTINEL =
  "__cut5_main_path_project_management_d1_no_dispatch_cut5_off__" as const;

/** Sentinel when CUT6 D1 execution blocks (see CUT6 D1 doc). */
export const CUT6_MAIN_PATH_LOGISTICS_D1_BLOCKED_DOWNSTREAM_SENTINEL =
  "__cut6_main_path_logistics_d1_no_dispatch_cut6_off__" as const;

/** Sentinel when CUT7 D1 execution blocks (see CUT7 D1 doc). */
export const CUT7_MAIN_PATH_COMMERCIAL_D1_BLOCKED_DOWNSTREAM_SENTINEL =
  "__cut7_main_path_commercial_d1_no_dispatch_cut7_off__" as const;

/** Sentinel when CUT8 D1 execution blocks (see CUT8 D1 doc). */
export const CUT8_MAIN_PATH_STUDIO_D1_BLOCKED_DOWNSTREAM_SENTINEL =
  "__cut8_main_path_studio_d1_no_dispatch_cut8_off__" as const;

/** Web-widget known-wedding only; paired with `cut2_web_widget_d1_prep` on triage return (CUT2 D1 doc). */
export function buildWebWidgetRetirementDispatchV1(input: {
  cut2WebWidgetLive: boolean;
  /** When CUT2 is off, whether legacy `ai/intent.concierge` is still allowed (D1 gate). If false and CUT2 off → blocked. */
  d1LegacyWhenCut2OffAllowed: boolean;
  replyChannel: "email" | "web";
}): RetirementDispatchObservabilityV1 {
  if (!input.cut2WebWidgetLive && !input.d1LegacyWhenCut2OffAllowed) {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "web_widget_known_wedding",
      reply_channel: input.replyChannel,
      dispatch_intent: "concierge",
      downstream_inngest_event: CUT2_WEB_WIDGET_D1_BLOCKED_DOWNSTREAM_SENTINEL,
      lane: "cut2_web_widget_d1_blocked_no_dispatch",
      branch_code: "CUT2_D1_LEGACY_DISALLOWED_CUT2_OFF",
      rollback_capable: false,
    };
  }
  const legacy = !input.cut2WebWidgetLive;
  return {
    schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
    path_family: "web_widget_known_wedding",
    reply_channel: input.replyChannel,
    dispatch_intent: "concierge",
    downstream_inngest_event: input.cut2WebWidgetLive ? ORCH : "ai/intent.concierge",
    lane: input.cut2WebWidgetLive ? "orchestrator_client_v1_live" : "legacy_ai_intent",
    branch_code: input.cut2WebWidgetLive ? "CUT2_WEB_WIDGET" : "LEGACY_INTENT_MAP",
    rollback_capable: legacy,
  };
}

export function buildUnfiledEarlyExitRetirementDispatchV1(input: {
  replyChannel: "email" | "web";
  dispatch_intent: string;
}): RetirementDispatchObservabilityV1 {
  return {
    schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
    path_family: "main_path_email_web",
    reply_channel: input.replyChannel,
    dispatch_intent: input.dispatch_intent,
    downstream_inngest_event: "__none_unfiled_early_exit__",
    lane: "unfiled_no_dispatch",
    branch_code: "UNFILED_EARLY_EXIT",
    rollback_capable: false,
  };
}

/** Main-path email/web; paired with `cut4_*`–`cut8_*` `_d1_prep` on known-wedding CUT4–CUT8 branches (D1 docs). */
export function buildMainPathRetirementDispatchV1(input: {
  replyChannel: "email" | "web";
  dispatch_intent: string;
  final_wedding_id: string | null;
  dispatchResult:
    | { kind: "near_match_approval_escalation" }
    | { kind: "intake" }
    | { kind: "cut4_d1_blocked_no_dispatch" }
    | { kind: "cut4_live" }
    | { kind: "cut5_d1_blocked_no_dispatch" }
    | { kind: "cut5_live" }
    | { kind: "cut6_d1_blocked_no_dispatch" }
    | { kind: "cut6_live" }
    | { kind: "cut7_d1_blocked_no_dispatch" }
    | { kind: "cut7_live" }
    | { kind: "cut8_d1_blocked_no_dispatch" }
    | { kind: "cut8_live" }
    | { kind: "legacy"; legacyEvent: string };
  /** Whether each main-path live gate is enabled (env); used for rollback_capable on legacy specialist. */
  gates: {
    cut4: boolean;
    cut5: boolean;
    cut6: boolean;
    cut7: boolean;
    cut8: boolean;
  };
}): RetirementDispatchObservabilityV1 {
  const { dispatchResult, dispatch_intent, final_wedding_id, replyChannel, gates } = input;

  if (dispatchResult.kind === "near_match_approval_escalation") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: "__bounded_near_match_escalation_no_ai_intent_dispatch__",
      lane: "near_match_escalation",
      branch_code: "NEAR_MATCH_ESCALATION",
      rollback_capable: false,
    };
  }

  if (dispatchResult.kind === "intake") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: "ai/intent.intake",
      lane: "legacy_ai_intent",
      branch_code: "LEGACY_INTAKE",
      rollback_capable: false,
    };
  }

  if (dispatchResult.kind === "cut4_d1_blocked_no_dispatch") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: CUT4_MAIN_PATH_CONCIERGE_D1_BLOCKED_DOWNSTREAM_SENTINEL,
      lane: "cut4_main_path_concierge_d1_blocked_no_dispatch",
      branch_code: "CUT4_D1_LEGACY_DISALLOWED_CUT4_OFF",
      rollback_capable: false,
    };
  }

  if (dispatchResult.kind === "cut5_d1_blocked_no_dispatch") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_BLOCKED_DOWNSTREAM_SENTINEL,
      lane: "cut5_main_path_project_management_d1_blocked_no_dispatch",
      branch_code: "CUT5_D1_LEGACY_DISALLOWED_CUT5_OFF",
      rollback_capable: false,
    };
  }

  if (dispatchResult.kind === "cut6_d1_blocked_no_dispatch") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: CUT6_MAIN_PATH_LOGISTICS_D1_BLOCKED_DOWNSTREAM_SENTINEL,
      lane: "cut6_main_path_logistics_d1_blocked_no_dispatch",
      branch_code: "CUT6_D1_LEGACY_DISALLOWED_CUT6_OFF",
      rollback_capable: false,
    };
  }

  if (dispatchResult.kind === "cut7_d1_blocked_no_dispatch") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: CUT7_MAIN_PATH_COMMERCIAL_D1_BLOCKED_DOWNSTREAM_SENTINEL,
      lane: "cut7_main_path_commercial_d1_blocked_no_dispatch",
      branch_code: "CUT7_D1_LEGACY_DISALLOWED_CUT7_OFF",
      rollback_capable: false,
    };
  }

  if (dispatchResult.kind === "cut8_d1_blocked_no_dispatch") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: CUT8_MAIN_PATH_STUDIO_D1_BLOCKED_DOWNSTREAM_SENTINEL,
      lane: "cut8_main_path_studio_d1_blocked_no_dispatch",
      branch_code: "CUT8_D1_LEGACY_DISALLOWED_CUT8_OFF",
      rollback_capable: false,
    };
  }

  const hasWedding = Boolean(final_wedding_id);

  if (dispatchResult.kind === "cut4_live") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: ORCH,
      lane: "orchestrator_client_v1_live",
      branch_code: "CUT4_MAIN_CONCIERGE",
      rollback_capable: false,
    };
  }
  if (dispatchResult.kind === "cut5_live") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: ORCH,
      lane: "orchestrator_client_v1_live",
      branch_code: "CUT5_MAIN_PM",
      rollback_capable: false,
    };
  }
  if (dispatchResult.kind === "cut6_live") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: ORCH,
      lane: "orchestrator_client_v1_live",
      branch_code: "CUT6_MAIN_LOGISTICS",
      rollback_capable: false,
    };
  }
  if (dispatchResult.kind === "cut7_live") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: ORCH,
      lane: "orchestrator_client_v1_live",
      branch_code: "CUT7_MAIN_COMMERCIAL",
      rollback_capable: false,
    };
  }
  if (dispatchResult.kind === "cut8_live") {
    return {
      schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
      path_family: "main_path_email_web",
      reply_channel: replyChannel,
      dispatch_intent,
      downstream_inngest_event: ORCH,
      lane: "orchestrator_client_v1_live",
      branch_code: "CUT8_MAIN_STUDIO",
      rollback_capable: false,
    };
  }

  const legacyEvent = dispatchResult.legacyEvent;
  const rollback_capable =
    hasWedding &&
    legacyEvent !== "ai/intent.intake" &&
    ((dispatch_intent === "concierge" && !gates.cut4) ||
      (dispatch_intent === "project_management" && !gates.cut5) ||
      (dispatch_intent === "logistics" && !gates.cut6) ||
      (dispatch_intent === "commercial" && !gates.cut7) ||
      (dispatch_intent === "studio" && !gates.cut8));

  let branch_code: RetirementDispatchBranchCodeV1 = "LEGACY_INTENT_MAP";
  if (legacyEvent === "ai/intent.concierge") branch_code = "LEGACY_INTENT_MAP";
  else if (legacyEvent === "ai/intent.project_management") branch_code = "LEGACY_INTENT_MAP";
  else if (legacyEvent === "ai/intent.logistics") branch_code = "LEGACY_INTENT_MAP";
  else if (legacyEvent === "ai/intent.commercial") branch_code = "LEGACY_INTENT_MAP";
  else if (legacyEvent === "ai/intent.studio") branch_code = "LEGACY_INTENT_MAP";

  return {
    schema_version: RETIREMENT_DISPATCH_OBSERVABILITY_SCHEMA_VERSION,
    path_family: "main_path_email_web",
    reply_channel: replyChannel,
    dispatch_intent,
    downstream_inngest_event: legacyEvent,
    lane: "legacy_ai_intent",
    branch_code,
    rollback_capable,
  };
}

export function logRetirementDispatchV1(obs: RetirementDispatchObservabilityV1): void {
  console.log(RETIREMENT_DISPATCH_V1_LOG_PREFIX, JSON.stringify(obs));
}
