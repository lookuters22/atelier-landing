/**
 * Policy evaluation for **unlinked non-wedding human business inquiries** (e.g. travel session,
 * portrait, commercial shoot asks). Combines:
 *
 *   1. **`studio_business_profiles`** — deterministic fit/capability gate (services, travel/geography,
 *      `lead_acceptance_rules` for out-of-scope service/geo posture)
 *   2. **`playbook_rules`** — automation posture + instruction (`auto`, `draft_only`, `forbidden`, `ask_first`)
 *   3. **Profile-derived fallback** — when profile fits and no matching `non_wedding_inquiry_*` rule exists
 *
 * Rule matching on `playbook_rules.action_key`:
 *   - `non_wedding_inquiry_{intent}` (e.g. `non_wedding_inquiry_commercial`) — intent-specific override
 *   - `non_wedding_inquiry_reply` — catch-all baseline
 *
 * Scope / channel precedence (unchanged): channel rule for current channel → global.
 *
 * Conflict rules (summary):
 *   - Profile **unfit** + playbook auto/draft/ask_first → profile wins (`disallowed_decline`)
 *   - Profile **operator_review** (OOS + lead routes to operator) + non-forbidden playbook → `unclear_operator_review` (no auto / no auto-downgrade to draft)
 *   - Profile **operator_review** + playbook forbidden → playbook wins (`disallowed_decline`)
 *   - Profile **fit** + playbook forbidden → playbook wins (`disallowed_decline`)
 *   - Profile **fit** + playbook auto/draft/ask_first → playbook wins
 *   - Profile **fit** + no rule → `allowed_draft` with deterministic profile fallback (never `allowed_auto`),
 *     except **`commercial` intent**: operator review (no customer-facing profile fallback draft)
 *   - Profile **ambiguous** + no rule → `unclear_operator_review`
 *   - Profile **ambiguous** + playbook `auto` → downgraded to `allowed_draft`
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import { ONBOARDING_OWNED_PLAYBOOK_RULE_SOURCE_TYPES } from "../../../../src/lib/onboardingRuntimeOwnership.ts";
import type { TriageIntent } from "../agents/triage.ts";
import type { InboundSenderRoleClassification } from "../../../../src/lib/inboundSenderRoleClassifier.ts";
import type { NonWeddingBusinessInquiryPolicyDecision } from "./emailIngressClassification.ts";
import {
  evaluateNonWeddingInquiryProfileFit,
  PROFILE_FIT_FALLBACK_DRAFT_INSTRUCTION,
  PROFILE_UNFIT_DECLINE_INSTRUCTION,
  type NonWeddingProfileFit,
} from "./nonWeddingInquiryProfileFit.ts";

export type NonWeddingBusinessInquiryChannel = Database["public"]["Enums"]["thread_channel"];

export const NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE = "non_wedding_inquiry_reply" as const;

/** Build the intent-specific override key (e.g. `non_wedding_inquiry_commercial`). */
export function nonWeddingInquiryActionKeyForIntent(intent: TriageIntent): string {
  return `non_wedding_inquiry_${intent}`;
}

export type NonWeddingInquiryDecisionSource =
  | "playbook_explicit"
  | "playbook_onboarding_default"
  | "profile_derived_fallback"
  | "commercial_unlinked_operator_review"
  | "customer_lead_promote_to_project"
  | "sender_role_vendor_operator_review"
  | "sender_role_partnership_operator_review"
  | "sender_role_billing_operator_review"
  | "sender_role_recruiter_operator_review"
  | "profile_unfit"
  | "profile_unfit_overrides_playbook"
  | "profile_oos_lead_operator_review"
  | "profile_ambiguous_escalate"
  | "profile_ambiguous_playbook_auto_downgraded";

export type NonWeddingBusinessInquiryReasonCode =
  | "PLAYBOOK_AUTO_REPLY"
  | "PLAYBOOK_DRAFT_FOR_REVIEW"
  | "PLAYBOOK_FORBIDDEN_DECLINE"
  | "PLAYBOOK_ASK_FIRST_ESCALATE"
  | "PLAYBOOK_NO_RULE_ESCALATE"
  | "PROFILE_UNFIT_DECLINE"
  | "PROFILE_UNFIT_OVERRIDES_PLAYBOOK"
  | "PROFILE_FIT_FALLBACK_DRAFT"
  | "COMMERCIAL_UNLINKED_REQUIRES_OPERATOR_DISAMBIGUATION"
  | "SENDER_ROLE_VENDOR_SOLICITATION_OPERATOR_REVIEW"
  | "SENDER_ROLE_PARTNERSHIP_OPERATOR_REVIEW"
  | "SENDER_ROLE_BILLING_FOLLOWUP_LINK_WEDDING"
  | "SENDER_ROLE_RECRUITER_OPERATOR_REVIEW"
  | "PROFILE_OOS_LEAD_ACCEPTANCE_OPERATOR_REVIEW"
  | "PROFILE_AMBIGUOUS_NO_PLAYBOOK_ESCALATE"
  | "PROFILE_AMBIGUOUS_PLAYBOOK_AUTO_DOWNGRADED_TO_DRAFT"
  | "CUSTOMER_LEAD_PROMOTE_TO_PROJECT";

export type NonWeddingBusinessInquiryPolicyResult = {
  decision: NonWeddingBusinessInquiryPolicyDecision;
  reasonCode: NonWeddingBusinessInquiryReasonCode;
  matchedRule: PlaybookRuleContextRow | null;
  matchedActionKey: string | null;
  instruction: string;
  decisionSource: NonWeddingInquiryDecisionSource;
  profileFit: NonWeddingProfileFit;
  profileFitReasonCodes: string[];
};

function isOnboardingOwnedSourceType(sourceType: string | null | undefined): boolean {
  if (!sourceType) return false;
  return (ONBOARDING_OWNED_PLAYBOOK_RULE_SOURCE_TYPES as readonly string[]).includes(sourceType);
}

function playbookDecisionSourceForRule(rule: PlaybookRuleContextRow): NonWeddingInquiryDecisionSource {
  return isOnboardingOwnedSourceType(rule.source_type)
    ? "playbook_onboarding_default"
    : "playbook_explicit";
}

function pickMatchedNonWeddingPlaybookRule(
  rules: PlaybookRuleContextRow[],
  dispatchIntent: TriageIntent,
  currentChannel: NonWeddingBusinessInquiryChannel,
): PlaybookRuleContextRow | null {
  const activeRules = rules.filter((r) => r.is_active !== false);
  const intentKey = nonWeddingInquiryActionKeyForIntent(dispatchIntent);

  const pickMostSpecific = (actionKey: string): PlaybookRuleContextRow | null => {
    const candidates = activeRules.filter((r) => r.action_key === actionKey);
    const channelMatch = candidates.find(
      (r) => r.scope === "channel" && r.channel === currentChannel,
    );
    if (channelMatch) return channelMatch;
    const globalMatch = candidates.find((r) => r.scope === "global");
    return globalMatch ?? null;
  };

  return (
    pickMostSpecific(intentKey) ??
    pickMostSpecific(NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE) ??
    null
  );
}

const SENDER_ROLE_NON_CUSTOMER_GATE_ROLES = new Set([
  "vendor_solicitation",
  "partnership_or_collaboration",
  "billing_or_account_followup",
  "recruiter_or_job_outreach",
]);

/**
 * Leading gate: high/medium-confidence non-customer human outreach → operator review only (no playbook/profile draft).
 * `customer_lead`, `unclear`, and low-confidence non-customer → null (existing logic).
 */
/**
 * When profile + playbook would allow automated handling for a **customer lead**, upgrade the
 * terminal decision to {@link NonWeddingBusinessInquiryPolicyDecision} `allowed_promote_to_project`
 * so routing can materialize a first-class `weddings` row instead of a thread-only draft.
 *
 * Preserves commercial no-rule operator disambiguation and all `unclear_operator_review` / forbidden paths.
 */
export function applyCustomerLeadProjectPromotionUpgrade(
  policy: NonWeddingBusinessInquiryPolicyResult,
  senderRoleClassification: InboundSenderRoleClassification | null | undefined,
): NonWeddingBusinessInquiryPolicyResult {
  const sr = senderRoleClassification;
  if (!sr || sr.role !== "customer_lead") return policy;
  if (sr.confidence !== "medium" && sr.confidence !== "high") return policy;
  if (policy.profileFit !== "fit") return policy;
  if (policy.decision !== "allowed_auto" && policy.decision !== "allowed_draft") return policy;
  if (policy.reasonCode === "COMMERCIAL_UNLINKED_REQUIRES_OPERATOR_DISAMBIGUATION") return policy;
  return {
    ...policy,
    decision: "allowed_promote_to_project",
    reasonCode: "CUSTOMER_LEAD_PROMOTE_TO_PROJECT",
    decisionSource: "customer_lead_promote_to_project",
  };
}

export function resolveSenderRoleLeadingGate(
  senderRole: InboundSenderRoleClassification | null | undefined,
): Pick<
  NonWeddingBusinessInquiryPolicyResult,
  "decision" | "reasonCode" | "decisionSource"
> | null {
  if (!senderRole) return null;
  if (senderRole.confidence !== "medium" && senderRole.confidence !== "high") return null;
  if (!SENDER_ROLE_NON_CUSTOMER_GATE_ROLES.has(senderRole.role)) return null;

  switch (senderRole.role) {
    case "vendor_solicitation":
      return {
        decision: "unclear_operator_review",
        reasonCode: "SENDER_ROLE_VENDOR_SOLICITATION_OPERATOR_REVIEW",
        decisionSource: "sender_role_vendor_operator_review",
      };
    case "partnership_or_collaboration":
      return {
        decision: "unclear_operator_review",
        reasonCode: "SENDER_ROLE_PARTNERSHIP_OPERATOR_REVIEW",
        decisionSource: "sender_role_partnership_operator_review",
      };
    case "billing_or_account_followup":
      return {
        decision: "unclear_operator_review",
        reasonCode: "SENDER_ROLE_BILLING_FOLLOWUP_LINK_WEDDING",
        decisionSource: "sender_role_billing_operator_review",
      };
    case "recruiter_or_job_outreach":
      return {
        decision: "unclear_operator_review",
        reasonCode: "SENDER_ROLE_RECRUITER_OPERATOR_REVIEW",
        decisionSource: "sender_role_recruiter_operator_review",
      };
    default:
      return null;
  }
}

function playbookRuleToPolicyResult(
  matched: PlaybookRuleContextRow,
): Pick<
  NonWeddingBusinessInquiryPolicyResult,
  "decision" | "reasonCode" | "instruction" | "decisionSource"
> {
  const instruction = typeof matched.instruction === "string" ? matched.instruction : "";
  const decisionSource = playbookDecisionSourceForRule(matched);
  switch (matched.decision_mode) {
    case "auto":
      return {
        decision: "allowed_auto",
        reasonCode: "PLAYBOOK_AUTO_REPLY",
        instruction,
        decisionSource,
      };
    case "draft_only":
      return {
        decision: "allowed_draft",
        reasonCode: "PLAYBOOK_DRAFT_FOR_REVIEW",
        instruction,
        decisionSource,
      };
    case "forbidden":
      return {
        decision: "disallowed_decline",
        reasonCode: "PLAYBOOK_FORBIDDEN_DECLINE",
        instruction,
        decisionSource,
      };
    case "ask_first":
    default:
      return {
        decision: "unclear_operator_review",
        reasonCode: "PLAYBOOK_ASK_FIRST_ESCALATE",
        instruction,
        decisionSource,
      };
  }
}

/**
 * Full resolution: profile fit gate + playbook posture + conflicts + fallback.
 */
export function resolveNonWeddingBusinessInquiryPolicyWithProfile(
  rules: PlaybookRuleContextRow[],
  profile: {
    core_services?: unknown;
    service_types?: unknown;
    geographic_scope?: unknown;
    travel_policy?: unknown;
    lead_acceptance_rules?: unknown;
  } | null,
  dispatchIntent: TriageIntent,
  currentChannel: NonWeddingBusinessInquiryChannel,
  senderRoleClassification?: InboundSenderRoleClassification | null,
): NonWeddingBusinessInquiryPolicyResult {
  const fit = evaluateNonWeddingInquiryProfileFit(profile, dispatchIntent);
  const matchedRule = pickMatchedNonWeddingPlaybookRule(rules, dispatchIntent, currentChannel);

  const baseMeta = {
    matchedRule,
    matchedActionKey: matchedRule?.action_key ?? null,
    profileFit: fit.overall,
    profileFitReasonCodes: fit.reasonCodes,
  };

  const senderGate = resolveSenderRoleLeadingGate(senderRoleClassification);
  if (senderGate) {
    return {
      ...senderGate,
      matchedRule: null,
      matchedActionKey: null,
      instruction: "",
      profileFit: fit.overall,
      profileFitReasonCodes: fit.reasonCodes,
    };
  }

  // ── OOS + lead_acceptance routes to operator (not automated decline) ─
  if (fit.overall === "operator_review") {
    if (matchedRule?.decision_mode === "forbidden") {
      const p = playbookRuleToPolicyResult(matchedRule);
      return {
        ...p,
        matchedRule,
        matchedActionKey: matchedRule.action_key,
        profileFit: fit.overall,
        profileFitReasonCodes: fit.reasonCodes,
      };
    }
    return {
      decision: "unclear_operator_review",
      reasonCode: "PROFILE_OOS_LEAD_ACCEPTANCE_OPERATOR_REVIEW",
      matchedRule,
      matchedActionKey: matchedRule?.action_key ?? null,
      instruction: "",
      decisionSource: "profile_oos_lead_operator_review",
      profileFit: fit.overall,
      profileFitReasonCodes: fit.reasonCodes,
    };
  }

  // ── Profile unfit ─────────────────────────────────────────────────────
  if (fit.overall === "unfit") {
    if (matchedRule && matchedRule.decision_mode !== "forbidden") {
      return {
        decision: "disallowed_decline",
        reasonCode: "PROFILE_UNFIT_OVERRIDES_PLAYBOOK",
        instruction: PROFILE_UNFIT_DECLINE_INSTRUCTION,
        decisionSource: "profile_unfit_overrides_playbook",
        ...baseMeta,
      };
    }
    if (matchedRule?.decision_mode === "forbidden") {
      const p = playbookRuleToPolicyResult(matchedRule);
      return {
        ...p,
        matchedRule,
        matchedActionKey: matchedRule.action_key,
        profileFit: fit.overall,
        profileFitReasonCodes: fit.reasonCodes,
      };
    }
    return {
      decision: "disallowed_decline",
      reasonCode: "PROFILE_UNFIT_DECLINE",
      instruction: PROFILE_UNFIT_DECLINE_INSTRUCTION,
      decisionSource: "profile_unfit",
      matchedRule: null,
      matchedActionKey: null,
      profileFit: fit.overall,
      profileFitReasonCodes: fit.reasonCodes,
    };
  }

  // ── Profile fit ───────────────────────────────────────────────────────
  if (fit.overall === "fit") {
    if (matchedRule) {
      const p = playbookRuleToPolicyResult(matchedRule);
      return {
        ...p,
        matchedRule,
        matchedActionKey: matchedRule.action_key,
        profileFit: fit.overall,
        profileFitReasonCodes: fit.reasonCodes,
      };
    }
    if (dispatchIntent === "commercial") {
      return {
        decision: "unclear_operator_review",
        reasonCode: "COMMERCIAL_UNLINKED_REQUIRES_OPERATOR_DISAMBIGUATION",
        matchedRule: null,
        matchedActionKey: null,
        instruction: "",
        decisionSource: "commercial_unlinked_operator_review",
        profileFit: fit.overall,
        profileFitReasonCodes: fit.reasonCodes,
      };
    }
    return {
      decision: "allowed_draft",
      reasonCode: "PROFILE_FIT_FALLBACK_DRAFT",
      matchedRule: null,
      matchedActionKey: NON_WEDDING_INQUIRY_ACTION_KEY_BASELINE,
      instruction: PROFILE_FIT_FALLBACK_DRAFT_INSTRUCTION,
      decisionSource: "profile_derived_fallback",
      profileFit: fit.overall,
      profileFitReasonCodes: fit.reasonCodes,
    };
  }

  // ── Profile ambiguous ───────────────────────────────────────────────
  if (matchedRule?.decision_mode === "forbidden") {
    const p = playbookRuleToPolicyResult(matchedRule);
    return {
      ...p,
      matchedRule,
      matchedActionKey: matchedRule.action_key,
      profileFit: fit.overall,
      profileFitReasonCodes: fit.reasonCodes,
    };
  }

  if (!matchedRule) {
    return {
      decision: "unclear_operator_review",
      reasonCode: "PROFILE_AMBIGUOUS_NO_PLAYBOOK_ESCALATE",
      matchedRule: null,
      matchedActionKey: null,
      instruction: "",
      decisionSource: "profile_ambiguous_escalate",
      profileFit: fit.overall,
      profileFitReasonCodes: fit.reasonCodes,
    };
  }

  if (matchedRule.decision_mode === "auto") {
    return {
      decision: "allowed_draft",
      reasonCode: "PROFILE_AMBIGUOUS_PLAYBOOK_AUTO_DOWNGRADED_TO_DRAFT",
      matchedRule,
      matchedActionKey: matchedRule.action_key,
      instruction:
        typeof matchedRule.instruction === "string" ? matchedRule.instruction : "",
      decisionSource: "profile_ambiguous_playbook_auto_downgraded",
      profileFit: fit.overall,
      profileFitReasonCodes: fit.reasonCodes,
    };
  }

  const p = playbookRuleToPolicyResult(matchedRule);
  return {
    ...p,
    matchedRule,
    matchedActionKey: matchedRule.action_key,
    profileFit: fit.overall,
    profileFitReasonCodes: fit.reasonCodes,
  };
}

/**
 * @deprecated Prefer {@link resolveNonWeddingBusinessInquiryPolicyWithProfile} with a profile row.
 * Delegates to full resolver with `profile: null` (treated as ambiguous fit).
 */
export function evaluateNonWeddingBusinessInquiryPolicy(
  rules: PlaybookRuleContextRow[],
  dispatchIntent: TriageIntent,
  currentChannel: NonWeddingBusinessInquiryChannel,
): NonWeddingBusinessInquiryPolicyResult {
  return resolveNonWeddingBusinessInquiryPolicyWithProfile(
    rules,
    null,
    dispatchIntent,
    currentChannel,
    null,
  );
}

/**
 * Fetch `studio_business_profiles` columns needed for non-wedding inquiry fit.
 */
export async function fetchStudioBusinessProfileForNonWeddingPolicy(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<{
  core_services: unknown;
  service_types: unknown;
  geographic_scope: unknown;
  travel_policy: unknown;
  lead_acceptance_rules: unknown;
} | null> {
  const { data, error } = await supabase
    .from("studio_business_profiles")
    .select("core_services, service_types, geographic_scope, travel_policy, lead_acceptance_rules")
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    throw new Error(`fetchStudioBusinessProfileForNonWeddingPolicy: ${error.message}`);
  }

  return data ?? null;
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
