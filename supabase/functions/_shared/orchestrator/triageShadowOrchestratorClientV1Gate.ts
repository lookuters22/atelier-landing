/**
 * Phase 2 Slice C1 — opt-in shadow fanout from `triage` to `ai/orchestrator.client.v1`.
 *
 * **Runtime truth:** Shadow events are observation-only (parallel Inngest send) when legacy is still the parallel
 * live path.
 *
 * **V3 CUT2 retry (web widget known-wedding only):** When `TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1=1`,
 * that branch dispatches **live** to `ai/orchestrator.client.v1` with `requestedExecutionMode: "draft_only"`
 * (approval-style draft path — not `auto`, which previously risked a no-op). Legacy `ai/intent.concierge` is
 * skipped for that branch only when CUT2 is on. When CUT2 is off, `TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1`
 * may forbid legacy (blocked return — no dispatch). Default **off**; rollback = unset env. Shadow is **skipped** when live CUT2 runs
 * to avoid duplicate orchestrator sends.
 *
 * Enable shadow deliberately: `TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1=1` (or `true`).
 */
export const TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1_ENV = "TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1" as const;

/**
 * CUT2 — web widget known-wedding fast path live orchestrator. Default **off** (`1` / `true` to enable).
 * Uses **draft_only** execution mode (not auto).
 */
export const TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV =
  "TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1" as const;

/**
 * **D1 execution (CUT2 web-widget only):** When **`0` / `false` / `off` / `no`**, triage **does not** dispatch
 * legacy `ai/intent.concierge` on the web-widget known-wedding branch when **CUT2 is off** — that branch has **no** live
 * AI route until CUT2 is enabled (or this env is relaxed). **Default when unset:** legacy **allowed** when CUT2 off
 * (backward compatible).
 *
 * Distinct from `TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1`, which chooses orchestrator vs legacy when D1 allows legacy.
 */
export const TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV =
  "TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1" as const;

export type Cut2WebWidgetD1ExecV2 = {
  schema_version: 2;
  narrow_branch: "web_widget_known_wedding";
  retirement_target: "legacy_ai_intent.concierge_when_cut2_off";
  cut2_live_gate_env: typeof TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV;
  d1_legacy_dispatch_gate_env: typeof TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV;
  /** Env read: legacy `ai/intent.concierge` permitted when CUT2 is off (default true if unset). */
  d1_legacy_when_cut2_off_allowed: boolean;
  cut2_web_widget_live: boolean;
  /** True when D1 forbids legacy and CUT2 is off — triage dispatches neither orchestrator nor concierge. */
  blocked_no_dispatch: boolean;
};

/**
 * `1` / `true` / unset (empty) → legacy allowed when CUT2 off.
 * `0` / `false` / `off` / `no` → legacy **not** allowed when CUT2 off (orchestrator-only policy for that branch).
 * Unknown values → **allowed** (fail open) to avoid surprise outages on typos.
 */
export function isTriageD1Cut2WebWidgetLegacyConciergeDispatchWhenCut2OffAllowed(): boolean {
  const v = Deno.env.get(TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV);
  if (v === undefined || v === "") return true;
  const s = v.trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return true;
}

export function buildCut2WebWidgetD1ExecV2(input: {
  d1LegacyWhenCut2OffAllowed: boolean;
  cut2WebWidgetLive: boolean;
}): Cut2WebWidgetD1ExecV2 {
  const blocked_no_dispatch = !input.cut2WebWidgetLive && !input.d1LegacyWhenCut2OffAllowed;
  return {
    schema_version: 2,
    narrow_branch: "web_widget_known_wedding",
    retirement_target: "legacy_ai_intent.concierge_when_cut2_off",
    cut2_live_gate_env: TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV,
    d1_legacy_dispatch_gate_env: TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1_ENV,
    d1_legacy_when_cut2_off_allowed: input.d1LegacyWhenCut2OffAllowed,
    cut2_web_widget_live: input.cut2WebWidgetLive,
    blocked_no_dispatch,
  };
}

/**
 * CUT4 — main triage path (LLM + stage gate), **concierge** intent only, **known wedding** (`wedding_id` filed).
 * Email or web not taking the web-widget fast-path. Default **off** (`1` / `true` to enable). **draft_only** live
 * dispatch to `ai/orchestrator.client.v1`; legacy `ai/intent.concierge` skipped when on. Rollback = unset env.
 */
export const TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV =
  "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1" as const;

/**
 * **D1 execution (CUT4 main-path concierge known-wedding only):** When **`0` / `false` / `off` / `no`**, triage **does not**
 * dispatch legacy `ai/intent.concierge` when **CUT4** is off on this branch — **no** live AI route until CUT4 is enabled or D1
 * is relaxed. **Default when unset:** legacy **allowed** when CUT4 off (backward compatible). Unknown values → **allowed**.
 *
 * **Scope:** main triage path (not web-widget fast path) + `dispatch_intent === "concierge"` + filed `wedding_id`.
 * Distinct from **`TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1`**.
 */
export const TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1_ENV =
  "TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1" as const;

export type Cut4MainPathConciergeD1ExecV2 = {
  schema_version: 2;
  narrow_branch: "main_path_concierge_known_wedding";
  retirement_target: "legacy_ai_intent.concierge_when_cut4_off";
  cut4_live_gate_env: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV;
  d1_legacy_dispatch_gate_env: typeof TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1_ENV;
  d1_legacy_when_cut4_off_allowed: boolean;
  /** True when CUT4 live orchestrator applies for concierge + known wedding on main path. */
  cut4_main_path_live: boolean;
  /** True when D1 forbids legacy and CUT4 is off — no orchestrator and no legacy concierge. */
  blocked_no_dispatch: boolean;
};

/**
 * `1` / `true` / unset (empty) → legacy allowed when CUT4 off (for this branch).
 * `0` / `false` / `off` / `no` → legacy **not** allowed when CUT4 off.
 */
export function isTriageD1Cut4MainPathConciergeLegacyConciergeDispatchWhenCut4OffAllowed(): boolean {
  const v = Deno.env.get(TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1_ENV);
  if (v === undefined || v === "") return true;
  const s = v.trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return true;
}

export function buildCut4MainPathConciergeD1ExecV2(input: {
  d1LegacyWhenCut4OffAllowed: boolean;
  cut4MainPathLive: boolean;
}): Cut4MainPathConciergeD1ExecV2 {
  const blocked_no_dispatch = !input.cut4MainPathLive && !input.d1LegacyWhenCut4OffAllowed;
  return {
    schema_version: 2,
    narrow_branch: "main_path_concierge_known_wedding",
    retirement_target: "legacy_ai_intent.concierge_when_cut4_off",
    cut4_live_gate_env: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV,
    d1_legacy_dispatch_gate_env: TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1_ENV,
    d1_legacy_when_cut4_off_allowed: input.d1LegacyWhenCut4OffAllowed,
    cut4_main_path_live: input.cut4MainPathLive,
    blocked_no_dispatch,
  };
}

/**
 * CUT5 — main triage path, **`project_management`** intent only, **known wedding**. Email/web only.
 * Default **off**. **draft_only** live orchestrator; legacy `ai/intent.project_management` skipped when on.
 */
export const TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV =
  "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1" as const;

/**
 * **D1 execution (CUT5 main-path project_management known-wedding only):** When **`0` / `false` / `off` / `no`**, triage
 * **does not** dispatch legacy **`ai/intent.project_management`** when **CUT5** is off. **Default when unset:** legacy
 * **allowed** when CUT5 off. Unknown values → **allowed** (fail open).
 *
 * **Scope:** main triage path + `dispatch_intent === "project_management"` + filed `wedding_id`. Distinct from CUT4.
 */
export const TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1_ENV =
  "TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1" as const;

export type Cut5MainPathProjectManagementD1ExecV2 = {
  schema_version: 2;
  narrow_branch: "main_path_project_management_known_wedding";
  retirement_target: "legacy_ai_intent.project_management_when_cut5_off";
  cut5_live_gate_env: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV;
  d1_legacy_dispatch_gate_env: typeof TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1_ENV;
  d1_legacy_when_cut5_off_allowed: boolean;
  cut5_main_path_live: boolean;
  blocked_no_dispatch: boolean;
};

export function isTriageD1Cut5MainPathProjectManagementLegacyDispatchWhenCut5OffAllowed(): boolean {
  const v = Deno.env.get(TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1_ENV);
  if (v === undefined || v === "") return true;
  const s = v.trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return true;
}

export function buildCut5MainPathProjectManagementD1ExecV2(input: {
  d1LegacyWhenCut5OffAllowed: boolean;
  cut5MainPathLive: boolean;
}): Cut5MainPathProjectManagementD1ExecV2 {
  const blocked_no_dispatch = !input.cut5MainPathLive && !input.d1LegacyWhenCut5OffAllowed;
  return {
    schema_version: 2,
    narrow_branch: "main_path_project_management_known_wedding",
    retirement_target: "legacy_ai_intent.project_management_when_cut5_off",
    cut5_live_gate_env: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV,
    d1_legacy_dispatch_gate_env: TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1_ENV,
    d1_legacy_when_cut5_off_allowed: input.d1LegacyWhenCut5OffAllowed,
    cut5_main_path_live: input.cut5MainPathLive,
    blocked_no_dispatch,
  };
}

/**
 * CUT6 — main triage path, **`logistics`** intent only, **known wedding**. Email/web only.
 * Default **off**. **draft_only** live orchestrator; legacy `ai/intent.logistics` skipped when on.
 */
export const TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV =
  "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1" as const;

/**
 * **D1 execution (CUT6 main-path logistics known-wedding only):** When **`0` / `false` / `off` / `no`**, triage
 * **does not** dispatch legacy **`ai/intent.logistics`** when **CUT6** is off. **Default when unset:** legacy
 * **allowed** when CUT6 off. Unknown values → **allowed** (fail open).
 *
 * **Scope:** main triage path + `dispatch_intent === "logistics"` + filed `wedding_id`. Distinct from CUT5.
 */
export const TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1_ENV =
  "TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1" as const;

export type Cut6MainPathLogisticsD1ExecV2 = {
  schema_version: 2;
  narrow_branch: "main_path_logistics_known_wedding";
  retirement_target: "legacy_ai_intent.logistics_when_cut6_off";
  cut6_live_gate_env: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV;
  d1_legacy_dispatch_gate_env: typeof TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1_ENV;
  d1_legacy_when_cut6_off_allowed: boolean;
  cut6_main_path_live: boolean;
  blocked_no_dispatch: boolean;
};

export function isTriageD1Cut6MainPathLogisticsLegacyDispatchWhenCut6OffAllowed(): boolean {
  const v = Deno.env.get(TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1_ENV);
  if (v === undefined || v === "") return true;
  const s = v.trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return true;
}

export function buildCut6MainPathLogisticsD1ExecV2(input: {
  d1LegacyWhenCut6OffAllowed: boolean;
  cut6MainPathLive: boolean;
}): Cut6MainPathLogisticsD1ExecV2 {
  const blocked_no_dispatch = !input.cut6MainPathLive && !input.d1LegacyWhenCut6OffAllowed;
  return {
    schema_version: 2,
    narrow_branch: "main_path_logistics_known_wedding",
    retirement_target: "legacy_ai_intent.logistics_when_cut6_off",
    cut6_live_gate_env: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV,
    d1_legacy_dispatch_gate_env: TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1_ENV,
    d1_legacy_when_cut6_off_allowed: input.d1LegacyWhenCut6OffAllowed,
    cut6_main_path_live: input.cut6MainPathLive,
    blocked_no_dispatch,
  };
}

/**
 * CUT7 — main triage path, **`commercial`** intent only, **known wedding**. Email/web only.
 * Default **off**. **draft_only** live orchestrator; legacy `ai/intent.commercial` skipped when on.
 */
export const TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV =
  "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1" as const;

/**
 * **D1 execution (CUT7 main-path commercial known-wedding only):** When **`0` / `false` / `off` / `no`**, triage
 * **does not** dispatch legacy **`ai/intent.commercial`** when **CUT7** is off. **Default when unset:** legacy
 * **allowed** when CUT7 off. Unknown values → **allowed** (fail open).
 *
 * **Scope:** main triage path + `dispatch_intent === "commercial"` + filed `wedding_id`. Distinct from CUT6.
 */
export const TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1_ENV =
  "TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1" as const;

export type Cut7MainPathCommercialD1ExecV2 = {
  schema_version: 2;
  narrow_branch: "main_path_commercial_known_wedding";
  retirement_target: "legacy_ai_intent.commercial_when_cut7_off";
  cut7_live_gate_env: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV;
  d1_legacy_dispatch_gate_env: typeof TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1_ENV;
  d1_legacy_when_cut7_off_allowed: boolean;
  cut7_main_path_live: boolean;
  blocked_no_dispatch: boolean;
};

export function isTriageD1Cut7MainPathCommercialLegacyDispatchWhenCut7OffAllowed(): boolean {
  const v = Deno.env.get(TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1_ENV);
  if (v === undefined || v === "") return true;
  const s = v.trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return true;
}

export function buildCut7MainPathCommercialD1ExecV2(input: {
  d1LegacyWhenCut7OffAllowed: boolean;
  cut7MainPathLive: boolean;
}): Cut7MainPathCommercialD1ExecV2 {
  const blocked_no_dispatch = !input.cut7MainPathLive && !input.d1LegacyWhenCut7OffAllowed;
  return {
    schema_version: 2,
    narrow_branch: "main_path_commercial_known_wedding",
    retirement_target: "legacy_ai_intent.commercial_when_cut7_off",
    cut7_live_gate_env: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV,
    d1_legacy_dispatch_gate_env: TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1_ENV,
    d1_legacy_when_cut7_off_allowed: input.d1LegacyWhenCut7OffAllowed,
    cut7_main_path_live: input.cut7MainPathLive,
    blocked_no_dispatch,
  };
}

/**
 * CUT8 — main triage path, **`studio`** intent only, **known wedding**. Email/web only.
 * Default **off**. **draft_only** live orchestrator; legacy `ai/intent.studio` skipped when on.
 */
export const TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV =
  "TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1" as const;

/**
 * **D1 execution (CUT8 main-path studio known-wedding only):** When **`0` / `false` / `off` / `no`**, triage
 * **does not** dispatch legacy **`ai/intent.studio`** when **CUT8** is off. **Default when unset:** legacy
 * **allowed** when CUT8 off. Unknown values → **allowed** (fail open).
 *
 * **Scope:** main triage path + `dispatch_intent === "studio"` + filed `wedding_id`. Distinct from CUT7.
 */
export const TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1_ENV =
  "TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1" as const;

export type Cut8MainPathStudioD1ExecV2 = {
  schema_version: 2;
  narrow_branch: "main_path_studio_known_wedding";
  retirement_target: "legacy_ai_intent.studio_when_cut8_off";
  cut8_live_gate_env: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV;
  d1_legacy_dispatch_gate_env: typeof TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1_ENV;
  d1_legacy_when_cut8_off_allowed: boolean;
  cut8_main_path_live: boolean;
  blocked_no_dispatch: boolean;
};

export function isTriageD1Cut8MainPathStudioLegacyDispatchWhenCut8OffAllowed(): boolean {
  const v = Deno.env.get(TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1_ENV);
  if (v === undefined || v === "") return true;
  const s = v.trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return true;
}

export function buildCut8MainPathStudioD1ExecV2(input: {
  d1LegacyWhenCut8OffAllowed: boolean;
  cut8MainPathLive: boolean;
}): Cut8MainPathStudioD1ExecV2 {
  const blocked_no_dispatch = !input.cut8MainPathLive && !input.d1LegacyWhenCut8OffAllowed;
  return {
    schema_version: 2,
    narrow_branch: "main_path_studio_known_wedding",
    retirement_target: "legacy_ai_intent.studio_when_cut8_off",
    cut8_live_gate_env: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV,
    d1_legacy_dispatch_gate_env: TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1_ENV,
    d1_legacy_when_cut8_off_allowed: input.d1LegacyWhenCut8OffAllowed,
    cut8_main_path_live: input.cut8MainPathLive,
    blocked_no_dispatch,
  };
}

/** @deprecated Import from `../triage/triageRoutingFlags.ts` — re-exported for backward compatibility. */
export {
  BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE,
  BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE,
  getTriageQaBoundedNearMatchSyntheticConfidenceScore,
  isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled,
  isTriageBoundedUnresolvedEmailMatchmakerEnabled,
  isTriageDeterministicInquiryDedupV1Enabled,
  TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1_ENV,
  TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCHMAKER_V1_ENV,
  TRIAGE_DETERMINISTIC_INQUIRY_DEDUP_V1_ENV,
  TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV,
} from "../triage/triageRoutingFlags.ts";

export const ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER_HOLD_REASON_CODE =
  "C2_HOLD_REASSESSMENT_POST_A4_NOT_READY" as const;

export type OrchestratorClientV1LiveCutoverHold = {
  live_cutover_enabled: false;
  hold_reason_code: typeof ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER_HOLD_REASON_CODE;
  summary: string;
  prerequisites_before_c2_retry: readonly string[];
};

export type OrchestratorClientV1LiveCutoverActiveWebWidget = {
  live_cutover_enabled: true;
  hold_reason_code: null;
  narrow_cutover_branch: "web_widget_known_wedding_v1";
  env_gate: typeof TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV;
  /** Live orchestrator uses draft-only (approval-style); not `auto`. */
  cut2_requested_execution_mode: "draft_only";
  summary: string;
};

export type OrchestratorClientV1LiveCutoverActiveMainPathConcierge = {
  live_cutover_enabled: true;
  hold_reason_code: null;
  narrow_cutover_branch: "main_path_concierge_known_wedding_v1";
  env_gate: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV;
  cut4_requested_execution_mode: "draft_only";
  summary: string;
};

export type OrchestratorClientV1LiveCutoverActiveMainPathProjectManagement = {
  live_cutover_enabled: true;
  hold_reason_code: null;
  narrow_cutover_branch: "main_path_project_management_known_wedding_v1";
  env_gate: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV;
  cut5_requested_execution_mode: "draft_only";
  summary: string;
};

export type OrchestratorClientV1LiveCutoverActiveMainPathLogistics = {
  live_cutover_enabled: true;
  hold_reason_code: null;
  narrow_cutover_branch: "main_path_logistics_known_wedding_v1";
  env_gate: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV;
  cut6_requested_execution_mode: "draft_only";
  summary: string;
};

export type OrchestratorClientV1LiveCutoverActiveMainPathCommercial = {
  live_cutover_enabled: true;
  hold_reason_code: null;
  narrow_cutover_branch: "main_path_commercial_known_wedding_v1";
  env_gate: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV;
  cut7_requested_execution_mode: "draft_only";
  summary: string;
};

export type OrchestratorClientV1LiveCutoverActiveMainPathStudio = {
  live_cutover_enabled: true;
  hold_reason_code: null;
  narrow_cutover_branch: "main_path_studio_known_wedding_v1";
  env_gate: typeof TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV;
  cut8_requested_execution_mode: "draft_only";
  summary: string;
};

export type OrchestratorClientV1LiveCutoverReadiness =
  | OrchestratorClientV1LiveCutoverHold
  | OrchestratorClientV1LiveCutoverActiveWebWidget;

export type OrchestratorClientV1LiveCutoverMainPathConciergeReadiness =
  | OrchestratorClientV1LiveCutoverHold
  | OrchestratorClientV1LiveCutoverActiveMainPathConcierge;

export type OrchestratorClientV1LiveCutoverMainPathProjectManagementReadiness =
  | OrchestratorClientV1LiveCutoverHold
  | OrchestratorClientV1LiveCutoverActiveMainPathProjectManagement;

export type OrchestratorClientV1LiveCutoverMainPathLogisticsReadiness =
  | OrchestratorClientV1LiveCutoverHold
  | OrchestratorClientV1LiveCutoverActiveMainPathLogistics;

export type OrchestratorClientV1LiveCutoverMainPathCommercialReadiness =
  | OrchestratorClientV1LiveCutoverHold
  | OrchestratorClientV1LiveCutoverActiveMainPathCommercial;

export type OrchestratorClientV1LiveCutoverMainPathStudioReadiness =
  | OrchestratorClientV1LiveCutoverHold
  | OrchestratorClientV1LiveCutoverActiveMainPathStudio;

/**
 * Default hold for non–web-widget returns and web-widget when CUT2 gate is off.
 */
export const ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER: OrchestratorClientV1LiveCutoverHold = {
  live_cutover_enabled: false,
  hold_reason_code: ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER_HOLD_REASON_CODE,
  summary:
    "Legacy ai/intent.* is the live path for this route. Web widget known-wedding: optional CUT2 live orchestrator " +
    `via ${TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV} (draft_only). Shadow/QA unchanged when gate off.`,
  prerequisites_before_c2_retry: [
    "B3 / operational evidence before enabling CUT2 in production",
    "Monitor draft creation vs legacy concierge for the narrow branch",
  ] as const,
};

export function getOrchestratorClientV1LiveCutoverReadiness(): OrchestratorClientV1LiveCutoverHold {
  return ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER;
}

export function getWebWidgetKnownWeddingOrchestratorLiveCutoverReadiness(
  cut2GateOn: boolean,
): OrchestratorClientV1LiveCutoverReadiness {
  if (cut2GateOn) {
    return {
      live_cutover_enabled: true,
      hold_reason_code: null,
      narrow_cutover_branch: "web_widget_known_wedding_v1",
      env_gate: TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV,
      cut2_requested_execution_mode: "draft_only",
      summary:
        "CUT2 active: live dispatch is ai/orchestrator.client.v1 with draft_only; legacy ai/intent.concierge skipped. " +
        `Rollback: unset ${TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV}.`,
    };
  }
  return ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER;
}

export function isTriageShadowOrchestratorClientV1Enabled(): boolean {
  const v = Deno.env.get(TRIAGE_SHADOW_ORCHESTRATOR_CLIENT_V1_ENV);
  return v === "1" || v === "true";
}

export function isTriageLiveOrchestratorWebWidgetKnownWeddingEnabled(): boolean {
  const v = Deno.env.get(TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1_ENV);
  return v === "1" || v === "true";
}

export function isTriageLiveOrchestratorMainPathConciergeKnownWeddingEnabled(): boolean {
  const v = Deno.env.get(TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV);
  return v === "1" || v === "true";
}

const MAIN_PATH_CONCIERGE_HOLD: OrchestratorClientV1LiveCutoverHold = {
  ...ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER,
  summary:
    "Legacy ai/intent.concierge remains live for main-path filed concierge unless " +
    `${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV}=1 (CUT4 draft_only orchestrator).`,
};

export function getMainPathConciergeKnownWeddingOrchestratorLiveCutoverReadiness(
  cut4GateOn: boolean,
): OrchestratorClientV1LiveCutoverMainPathConciergeReadiness {
  if (cut4GateOn) {
    return {
      live_cutover_enabled: true,
      hold_reason_code: null,
      narrow_cutover_branch: "main_path_concierge_known_wedding_v1",
      env_gate: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV,
      cut4_requested_execution_mode: "draft_only",
      summary:
        "CUT4 active: main-path concierge + known wedding → ai/orchestrator.client.v1 (draft_only); legacy concierge skipped. " +
        `Rollback: unset ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1_ENV}.`,
    };
  }
  return MAIN_PATH_CONCIERGE_HOLD;
}

export function isTriageLiveOrchestratorMainPathProjectManagementKnownWeddingEnabled(): boolean {
  const v = Deno.env.get(TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV);
  return v === "1" || v === "true";
}

const MAIN_PATH_PROJECT_MANAGEMENT_HOLD: OrchestratorClientV1LiveCutoverHold = {
  ...ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER,
  summary:
    "Legacy ai/intent.project_management remains live for main-path filed project_management unless " +
    `${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV}=1 (CUT5 draft_only orchestrator).`,
};

export function getMainPathProjectManagementKnownWeddingOrchestratorLiveCutoverReadiness(
  cut5GateOn: boolean,
): OrchestratorClientV1LiveCutoverMainPathProjectManagementReadiness {
  if (cut5GateOn) {
    return {
      live_cutover_enabled: true,
      hold_reason_code: null,
      narrow_cutover_branch: "main_path_project_management_known_wedding_v1",
      env_gate: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV,
      cut5_requested_execution_mode: "draft_only",
      summary:
        "CUT5 active: main-path project_management + known wedding → ai/orchestrator.client.v1 (draft_only); legacy project_management skipped. " +
        `Rollback: unset ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1_ENV}.`,
    };
  }
  return MAIN_PATH_PROJECT_MANAGEMENT_HOLD;
}

export function isTriageLiveOrchestratorMainPathLogisticsKnownWeddingEnabled(): boolean {
  const v = Deno.env.get(TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV);
  return v === "1" || v === "true";
}

const MAIN_PATH_LOGISTICS_HOLD: OrchestratorClientV1LiveCutoverHold = {
  ...ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER,
  summary:
    "Legacy ai/intent.logistics remains live for main-path filed logistics unless " +
    `${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV}=1 (CUT6 draft_only orchestrator).`,
};

export function getMainPathLogisticsKnownWeddingOrchestratorLiveCutoverReadiness(
  cut6GateOn: boolean,
): OrchestratorClientV1LiveCutoverMainPathLogisticsReadiness {
  if (cut6GateOn) {
    return {
      live_cutover_enabled: true,
      hold_reason_code: null,
      narrow_cutover_branch: "main_path_logistics_known_wedding_v1",
      env_gate: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV,
      cut6_requested_execution_mode: "draft_only",
      summary:
        "CUT6 active: main-path logistics + known wedding → ai/orchestrator.client.v1 (draft_only); legacy logistics skipped. " +
        `Rollback: unset ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1_ENV}.`,
    };
  }
  return MAIN_PATH_LOGISTICS_HOLD;
}

export function isTriageLiveOrchestratorMainPathCommercialKnownWeddingEnabled(): boolean {
  const v = Deno.env.get(TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV);
  return v === "1" || v === "true";
}

const MAIN_PATH_COMMERCIAL_HOLD: OrchestratorClientV1LiveCutoverHold = {
  ...ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER,
  summary:
    "Legacy ai/intent.commercial remains live for main-path filed commercial unless " +
    `${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV}=1 (CUT7 draft_only orchestrator).`,
};

export function getMainPathCommercialKnownWeddingOrchestratorLiveCutoverReadiness(
  cut7GateOn: boolean,
): OrchestratorClientV1LiveCutoverMainPathCommercialReadiness {
  if (cut7GateOn) {
    return {
      live_cutover_enabled: true,
      hold_reason_code: null,
      narrow_cutover_branch: "main_path_commercial_known_wedding_v1",
      env_gate: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV,
      cut7_requested_execution_mode: "draft_only",
      summary:
        "CUT7 active: main-path commercial + known wedding → ai/orchestrator.client.v1 (draft_only); legacy commercial skipped. " +
        `Rollback: unset ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1_ENV}.`,
    };
  }
  return MAIN_PATH_COMMERCIAL_HOLD;
}

export function isTriageLiveOrchestratorMainPathStudioKnownWeddingEnabled(): boolean {
  const v = Deno.env.get(TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV);
  return v === "1" || v === "true";
}

const MAIN_PATH_STUDIO_HOLD: OrchestratorClientV1LiveCutoverHold = {
  ...ORCHESTRATOR_CLIENT_V1_LIVE_CUTOVER,
  summary:
    "Legacy ai/intent.studio remains live for main-path filed studio unless " +
    `${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV}=1 (CUT8 draft_only orchestrator).`,
};

export function getMainPathStudioKnownWeddingOrchestratorLiveCutoverReadiness(
  cut8GateOn: boolean,
): OrchestratorClientV1LiveCutoverMainPathStudioReadiness {
  if (cut8GateOn) {
    return {
      live_cutover_enabled: true,
      hold_reason_code: null,
      narrow_cutover_branch: "main_path_studio_known_wedding_v1",
      env_gate: TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV,
      cut8_requested_execution_mode: "draft_only",
      summary:
        "CUT8 active: main-path studio + known wedding → ai/orchestrator.client.v1 (draft_only); legacy studio skipped. " +
        `Rollback: unset ${TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1_ENV}.`,
    };
  }
  return MAIN_PATH_STUDIO_HOLD;
}
