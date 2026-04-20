/**
 * Policy evaluation for **unlinked non-wedding human business inquiries** (e.g. travel session,
 * portrait, commercial shoot asks). Triage previously dead-ended these messages at the "unfiled"
 * branch — no draft, no escalation, no visibility beyond a metadata row. This evaluator turns the
 * photographer's `playbook_rules` into a deterministic allow / decline / escalate decision so the
 * router (`nonWeddingBusinessInquiryRouter.ts`) can act instead of silently doing nothing.
 *
 * Rule matching convention on `playbook_rules.action_key`:
 *  - `non_wedding_inquiry_{intent}` (e.g. `non_wedding_inquiry_commercial`) — intent-specific override
 *  - `non_wedding_inquiry_reply` — catch-all baseline for any non-wedding business inquiry
 *
 * Scope / channel precedence (for a given `action_key`, most-specific wins):
 *  1. `scope='channel'` AND `channel === currentChannel` (exact channel match)
 *  2. `scope='global'` (channel must be null per DB constraint)
 *  Rules with `scope='channel'` but a mismatching `channel` are ignored — they belong to a
 *  different lane and must not leak across channels.
 *
 * Decision mapping from `playbook_rules.decision_mode`:
 *  - `auto`       → `allowed_auto`          (seed draft; downstream auto-send gating unchanged)
 *  - `draft_only` → `allowed_draft`          (seed draft for operator approval)
 *  - `forbidden`  → `disallowed_decline`    (seed polite decline draft)
 *  - `ask_first`  → `unclear_operator_review` (operator review before reply)
 *  - No rule      → `unclear_operator_review` (explicit opt-out prevents silent no-op)
 *
 * Pure over `PlaybookRuleContextRow[]`; the DB fetch is a separate helper so the evaluator is
 * trivially testable without Supabase.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import type { TriageIntent } from "../agents/triage.ts";
import type { NonWeddingBusinessInquiryPolicyDecision } from "./emailIngressClassification.ts";

export type NonWeddingBusinessInquiryChannel = Database["public"]["Enums"]["thread_channel"];

export const NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE = "non_wedding_inquiry_reply" as const;

/** Build the intent-specific override key (e.g. `non_wedding_inquiry_commercial`). */
export function nonWeddingInquiryActionKeyForIntent(intent: TriageIntent): string {
  return `non_wedding_inquiry_${intent}`;
}

export type NonWeddingBusinessInquiryPolicyResult = {
  decision: NonWeddingBusinessInquiryPolicyDecision;
  reasonCode:
    | "PLAYBOOK_AUTO_REPLY"
    | "PLAYBOOK_DRAFT_FOR_REVIEW"
    | "PLAYBOOK_FORBIDDEN_DECLINE"
    | "PLAYBOOK_ASK_FIRST_ESCALATE"
    | "PLAYBOOK_NO_RULE_ESCALATE";
  matchedRule: PlaybookRuleContextRow | null;
  /** Which action_key actually matched (intent-specific or baseline). Null when no rule matched. */
  matchedActionKey: string | null;
  /** Instruction text to seed the draft / decline body. Empty string when no rule matched. */
  instruction: string;
};

/**
 * Pure evaluator over a list of tenant `playbook_rules` rows.
 *
 * Precedence: for each candidate action_key (`non_wedding_inquiry_{intent}`, then baseline
 * `non_wedding_inquiry_reply`) we first try a channel-scoped rule matching `currentChannel`,
 * then fall back to the global rule. The intent-specific key is consulted before the baseline
 * even if the baseline has a channel-specific row — an intent-specific global rule still beats
 * a baseline channel rule, since the intent override is the more targeted policy signal.
 *
 * Only `is_active: true` rows are considered; inactive rules are ignored to match
 * `fetchActivePlaybookRulesForDecisionContext` semantics (the DB filter is also applied below
 * for defence in depth).
 */
export function evaluateNonWeddingBusinessInquiryPolicy(
  rules: PlaybookRuleContextRow[],
  dispatchIntent: TriageIntent,
  currentChannel: NonWeddingBusinessInquiryChannel,
): NonWeddingBusinessInquiryPolicyResult {
  const activeRules = rules.filter((r) => r.is_active !== false);
  const intentKey = nonWeddingInquiryActionKeyForIntent(dispatchIntent);

  const pickMostSpecific = (actionKey: string): PlaybookRuleContextRow | null => {
    const candidates = activeRules.filter((r) => r.action_key === actionKey);
    // Channel-scoped rule for this channel wins over global; channel rules for other channels are skipped.
    const channelMatch = candidates.find(
      (r) => r.scope === "channel" && r.channel === currentChannel,
    );
    if (channelMatch) return channelMatch;
    const globalMatch = candidates.find((r) => r.scope === "global");
    return globalMatch ?? null;
  };

  const matched =
    pickMostSpecific(intentKey) ??
    pickMostSpecific(NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE) ??
    null;

  if (!matched) {
    return {
      decision: "unclear_operator_review",
      reasonCode: "PLAYBOOK_NO_RULE_ESCALATE",
      matchedRule: null,
      matchedActionKey: null,
      instruction: "",
    };
  }

  const instruction = typeof matched.instruction === "string" ? matched.instruction : "";

  switch (matched.decision_mode) {
    case "auto":
      return {
        decision: "allowed_auto",
        reasonCode: "PLAYBOOK_AUTO_REPLY",
        matchedRule: matched,
        matchedActionKey: matched.action_key,
        instruction,
      };
    case "draft_only":
      return {
        decision: "allowed_draft",
        reasonCode: "PLAYBOOK_DRAFT_FOR_REVIEW",
        matchedRule: matched,
        matchedActionKey: matched.action_key,
        instruction,
      };
    case "forbidden":
      return {
        decision: "disallowed_decline",
        reasonCode: "PLAYBOOK_FORBIDDEN_DECLINE",
        matchedRule: matched,
        matchedActionKey: matched.action_key,
        instruction,
      };
    case "ask_first":
    default:
      return {
        decision: "unclear_operator_review",
        reasonCode: "PLAYBOOK_ASK_FIRST_ESCALATE",
        matchedRule: matched,
        matchedActionKey: matched.action_key,
        instruction,
      };
  }
}

/**
 * Fetch only the `playbook_rules` rows relevant to non-wedding business inquiry routing
 * (baseline + every intent-specific override). Tenant-scoped via `photographer_id`.
 */
export async function fetchNonWeddingBusinessInquiryPlaybookRules(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<PlaybookRuleContextRow[]> {
  const intents: TriageIntent[] = [
    "intake",
    "commercial",
    "logistics",
    "project_management",
    "concierge",
    "studio",
  ];
  const actionKeys = [
    NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
    ...intents.map((i) => nonWeddingInquiryActionKeyForIntent(i)),
  ];

  const { data, error } = await supabase
    .from("playbook_rules")
    .select(
      "id, action_key, topic, decision_mode, scope, channel, instruction, source_type, confidence_label, is_active",
    )
    .eq("photographer_id", photographerId)
    .eq("is_active", true)
    .in("action_key", actionKeys);

  if (error) {
    throw new Error(`fetchNonWeddingBusinessInquiryPlaybookRules: ${error.message}`);
  }

  return (data ?? []) as PlaybookRuleContextRow[];
}
