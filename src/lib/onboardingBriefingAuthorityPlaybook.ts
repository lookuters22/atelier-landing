import type { OnboardingPlaybookSeed } from "./onboardingV4Payload.ts";
import type { ActionPermissionDecisionMode } from "./onboardingActionPermissionMatrixScheduling.ts";

/** Draft-only seeds written from the Authority step; finalize maps to playbook_rules later. */
export const BRIEFING_AUTHORITY_PLAYBOOK_SOURCE = "briefing_authority_v1" as const;

export const DEFAULT_NON_SCHEDULING_AUTHORITY_MODE: ActionPermissionDecisionMode = "ask_first";

/** All autonomy keys stored as global `playbook_seeds` (scheduling uses the matrix instead). */
export const NON_SCHEDULING_AUTHORITY_ACTION_KEYS = [
  "discount_quote",
  "send_invoice",
  "payment_plan_exception",
  "late_payment_extension",
  "release_raw_files",
  "publication_permission",
  "planner_coordination",
  "vendor_credit_request",
  "respond_to_art_feedback",
  "share_private_client_data",
  "proactive_followup",
  "operator_notification_routing",
] as const;

export type NonSchedulingAuthorityActionKey = (typeof NON_SCHEDULING_AUTHORITY_ACTION_KEYS)[number];

const MANAGED_KEY_SET = new Set<string>(NON_SCHEDULING_AUTHORITY_ACTION_KEYS);

export type AuthorityBoardRowDef = {
  action_key: NonSchedulingAuthorityActionKey;
  scenarioLabel: string;
  topic: string;
};

export type AuthorityBoardGroupDef = {
  id: string;
  title: string;
  rows: readonly AuthorityBoardRowDef[];
};

export const AUTHORITY_BOARD_GROUPS: readonly AuthorityBoardGroupDef[] = [
  {
    id: "pricing",
    title: "Pricing & money",
    rows: [
      { action_key: "discount_quote", scenarioLabel: "Offer or change a quote / discount", topic: "pricing" },
      { action_key: "send_invoice", scenarioLabel: "Send an invoice", topic: "invoicing" },
      {
        action_key: "payment_plan_exception",
        scenarioLabel: "Payment plan exceptions",
        topic: "payments",
      },
      {
        action_key: "late_payment_extension",
        scenarioLabel: "Late payment extensions",
        topic: "payments",
      },
    ],
  },
  {
    id: "deliverables",
    title: "Deliverables & files",
    rows: [
      { action_key: "release_raw_files", scenarioLabel: "Release RAW files", topic: "deliverables" },
      {
        action_key: "publication_permission",
        scenarioLabel: "Publication / gallery permission",
        topic: "deliverables",
      },
    ],
  },
  {
    id: "coordination",
    title: "Coordination",
    rows: [
      {
        action_key: "planner_coordination",
        scenarioLabel: "Planner or vendor coordination",
        topic: "coordination",
      },
      { action_key: "vendor_credit_request", scenarioLabel: "Vendor credit requests", topic: "coordination" },
      {
        action_key: "respond_to_art_feedback",
        scenarioLabel: "Respond to art / creative feedback",
        topic: "coordination",
      },
      {
        action_key: "operator_notification_routing",
        scenarioLabel: "Operator notification routing decisions",
        topic: "escalation",
      },
    ],
  },
  {
    id: "sensitive",
    title: "Sensitive communication",
    rows: [
      {
        action_key: "share_private_client_data",
        scenarioLabel: "Share private client data",
        topic: "privacy",
      },
      { action_key: "proactive_followup", scenarioLabel: "Proactive follow-up outreach", topic: "communication" },
    ],
  },
];

/** Resolve current mode from draft seeds (briefing_authority_v1 wins; else any global seed for managed keys). */
export function resolveNonSchedulingAuthorityMode(
  seeds: OnboardingPlaybookSeed[] | undefined,
  action_key: NonSchedulingAuthorityActionKey,
): ActionPermissionDecisionMode {
  const list = seeds ?? [];
  const briefing = list.find(
    (s) =>
      s.scope === "global" &&
      s.action_key === action_key &&
      s.source_type === BRIEFING_AUTHORITY_PLAYBOOK_SOURCE,
  );
  if (briefing) return briefing.decision_mode;
  const legacy = list.find(
    (s) => s.scope === "global" && s.action_key === action_key && MANAGED_KEY_SET.has(s.action_key),
  );
  if (legacy) return legacy.decision_mode;
  return DEFAULT_NON_SCHEDULING_AUTHORITY_MODE;
}

/**
 * Replace any global seed for this managed action_key, then append the briefing_authority seed.
 * Avoids duplicate rows for the same action_key in the draft snapshot.
 */
export function upsertBriefingAuthorityPlaybookSeed(
  seeds: OnboardingPlaybookSeed[] | undefined,
  row: AuthorityBoardRowDef,
  decision_mode: ActionPermissionDecisionMode,
): OnboardingPlaybookSeed[] {
  const list = [...(seeds ?? [])];
  const filtered = list.filter(
    (s) =>
      !(
        s.scope === "global" &&
        s.action_key === row.action_key &&
        MANAGED_KEY_SET.has(s.action_key)
      ),
  );
  const seed: OnboardingPlaybookSeed = {
    scope: "global",
    channel: null,
    action_key: row.action_key,
    topic: row.topic,
    decision_mode,
    instruction: JSON.stringify({
      kind: "briefing_authority_draft_v1",
      action_key: row.action_key,
      decision_mode,
    }),
    source_type: BRIEFING_AUTHORITY_PLAYBOOK_SOURCE,
    confidence_label: "explicit",
    is_active: true,
  };
  return [...filtered, seed];
}
