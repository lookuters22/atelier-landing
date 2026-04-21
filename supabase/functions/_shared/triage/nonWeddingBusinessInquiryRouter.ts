/**
 * Routes an **unlinked non-wedding human business inquiry** after triage has classified the
 * message as a human intent (not promo / bulk) but no wedding context exists to send it into the
 * usual client pipelines. Uses `evaluateNonWeddingBusinessInquiryPolicy` to consult the
 * photographer's playbook rules and then acts:
 *
 *   - `allowed_auto`           → seed a `pending_approval` draft (auto mode preserved for
 *                                downstream; this router does not send, matching the rest of the
 *                                codebase where a human approves `auto` drafts on the dashboard)
 *   - `allowed_draft`          → seed a `pending_approval` draft for operator review
 *   - `disallowed_decline`     → seed a polite decline draft (`pending_approval`, using the rule
 *                                instruction as the decline rationale)
 *   - `unclear_operator_review` → insert an `escalation_requests` row, set
 *                                 `v3_operator_automation_hold` on the thread, and emit the
 *                                 pending-delivery fan-out event
 *
 * Returning a discriminated result lets the triage / post-ingest caller write a single routing
 * metadata row that reflects the real outcome rather than the legacy `unresolved_human` dead end.
 *
 * **Authority:** `studio_business_profiles` gates fit; `playbook_rules` set automation posture;
 * see {@link resolveNonWeddingBusinessInquiryPolicyWithProfile}.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatOperatorEscalationQuestion } from "../formatOperatorEscalation.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
} from "../inngest.ts";
import type { TriageIntent } from "../agents/triage.ts";
import type { InboundSenderRoleClassification } from "../../../../src/lib/inboundSenderRoleClassifier.ts";
import { bootstrapInquiryWeddingForCanonicalThread } from "../resolvers/bootstrapInquiryWeddingForCanonicalThread.ts";
import type { NonWeddingBusinessInquiryPolicyDecision } from "./emailIngressClassification.ts";
import {
  applyCustomerLeadProjectPromotionUpgrade,
  fetchNonWeddingBusinessInquiryPlaybookRules,
  fetchStudioBusinessProfileForNonWeddingPolicy,
  resolveNonWeddingBusinessInquiryPolicyWithProfile,
  type NonWeddingBusinessInquiryChannel,
  type NonWeddingBusinessInquiryReasonCode,
  type NonWeddingInquiryDecisionSource,
} from "./nonWeddingBusinessInquiryPolicy.ts";
import {
  inferPromotedNonWeddingProjectTypeV1,
  type WeddingProjectType,
} from "./inferPromotedNonWeddingProjectTypeV1.ts";
import {
  PROFILE_FIT_FALLBACK_DRAFT_INSTRUCTION,
  type NonWeddingProfileFit,
} from "./nonWeddingInquiryProfileFit.ts";

const DEFAULT_DECLINE_TEMPLATE =
  "Thanks for reaching out! Right now we only take on wedding commissions, so we're not the right fit for this one — but we wish you the best with the shoot.";

const DEFAULT_UNCLEAR_OPERATOR_QUESTION =
  "Non-wedding inquiry arrived with no studio rule covering it. Decide whether to reply, decline, or ignore before automation proceeds.";

function buildNonWeddingEscalationQuestionBody(
  reasonCode: NonWeddingBusinessInquiryReasonCode,
  senderRole: InboundSenderRoleClassification | null | undefined,
): string {
  const isSenderRoleReason =
    reasonCode === "SENDER_ROLE_VENDOR_SOLICITATION_OPERATOR_REVIEW" ||
    reasonCode === "SENDER_ROLE_PARTNERSHIP_OPERATOR_REVIEW" ||
    reasonCode === "SENDER_ROLE_BILLING_FOLLOWUP_LINK_WEDDING" ||
    reasonCode === "SENDER_ROLE_RECRUITER_OPERATOR_REVIEW";
  const sr = senderRole;
  if (isSenderRoleReason && sr && (sr.confidence === "medium" || sr.confidence === "high")) {
    const note = sr.reason?.trim() ? ` Context: ${sr.reason.trim()}` : "";
    switch (sr.role) {
      case "vendor_solicitation":
        return `Inbound classified as vendor or agency solicitation (sender-role). Not a client lead — decide reply, ignore, or block.${note}`;
      case "partnership_or_collaboration":
        return `Inbound classified as partnership or collaboration outreach.${note} Operator review before any client-style automation.`;
      case "billing_or_account_followup":
        return `Inbound classified as billing or account follow-up.${note} Link to the correct wedding or account before automating.`;
      case "recruiter_or_job_outreach":
        return `Inbound classified as recruiting or job outreach.${note} Not a client inquiry — use operator discretion.`;
      default:
        break;
    }
  }
  return DEFAULT_UNCLEAR_OPERATOR_QUESTION;
}

const NON_WEDDING_ROUTER_INSTRUCTION_STEP = "non_wedding_business_inquiry_router";

/** Appended only by {@link buildDraftBody} for `disallowed_decline` drafts — reliable without JSON history. */
const DECLINE_BODY_OPERATOR_NOTE_MARKER = "Studio rule note for operator:";

function reasonCodeForNonWeddingDraftDecision(
  decision: NonWeddingBusinessInquiryPolicyDecision,
): NonWeddingBusinessInquiryReasonCode {
  switch (decision) {
    case "allowed_auto":
      return "PLAYBOOK_AUTO_REPLY";
    case "allowed_draft":
      return "PLAYBOOK_DRAFT_FOR_REVIEW";
    case "allowed_promote_to_project":
      return "CUSTOMER_LEAD_PROMOTE_TO_PROJECT";
    case "disallowed_decline":
      return "PLAYBOOK_FORBIDDEN_DECLINE";
    default:
      return "PLAYBOOK_DRAFT_FOR_REVIEW";
  }
}

type PendingNonWeddingDraftRow = {
  source_action_key: string | null;
  instruction_history: unknown;
  body: string | null;
};

/**
 * When thread metadata is missing, replay the router's outcome from fields already stored on the
 * pending draft. Prefer the newest `instruction_history` entry from this router step; if history
 * is absent or malformed, infer `disallowed_decline` from the decline body shape; otherwise fall
 * back to `allowed_draft` / `PLAYBOOK_DRAFT_FOR_REVIEW` because `allowed_auto` and `allowed_draft`
 * bodies are indistinguishable without history.
 */
function extractProfileAuditFromDraftHistory(row: PendingNonWeddingDraftRow): {
  decisionSource: NonWeddingInquiryDecisionSource;
  profileFit: NonWeddingProfileFit;
  profileFitReasonCodes: string[];
} | null {
  const history = row.instruction_history;
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (rec.step !== NON_WEDDING_ROUTER_INSTRUCTION_STEP) continue;
    const ds = rec.decision_source;
    const pf = rec.profile_fit;
    const pfr = rec.profile_fit_reason_codes;
    if (typeof ds !== "string") return null;
    if (
      pf !== "fit" &&
      pf !== "unfit" &&
      pf !== "ambiguous" &&
      pf !== "operator_review"
    ) {
      return null;
    }
    const codes = Array.isArray(pfr)
      ? pfr.filter((x): x is string => typeof x === "string")
      : [];
    return {
      decisionSource: ds as NonWeddingInquiryDecisionSource,
      profileFit: pf,
      profileFitReasonCodes: codes,
    };
  }
  return null;
}

function reconstructOutcomeFromPendingNonWeddingDraft(
  row: PendingNonWeddingDraftRow,
): {
  decision: NonWeddingBusinessInquiryPolicyDecision;
  reasonCode: NonWeddingBusinessInquiryReasonCode;
  matchedPlaybookRuleId: string | null;
  matchedPlaybookActionKey: string | null;
} {
  const history = row.instruction_history;
  if (Array.isArray(history)) {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i];
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      if (rec.step !== NON_WEDDING_ROUTER_INSTRUCTION_STEP) continue;
      const d = rec.decision;
      if (d === "allowed_auto" || d === "allowed_draft" || d === "disallowed_decline") {
        const matchedRuleId =
          typeof rec.matched_playbook_rule_id === "string" ? rec.matched_playbook_rule_id : null;
        const matchedActionKey =
          typeof rec.matched_playbook_action_key === "string"
            ? rec.matched_playbook_action_key
            : null;
        const rc =
          typeof rec.reason_code === "string"
            ? (rec.reason_code as NonWeddingBusinessInquiryReasonCode)
            : reasonCodeForNonWeddingDraftDecision(d);
        return {
          decision: d,
          reasonCode: rc,
          matchedPlaybookRuleId: matchedRuleId,
          matchedPlaybookActionKey: matchedActionKey ?? row.source_action_key,
        };
      }
    }
  }

  const body = typeof row.body === "string" ? row.body : "";
  const trimmedBody = body.trim();
  const isDeclineBodyShape =
    body.includes(DECLINE_BODY_OPERATOR_NOTE_MARKER) ||
    trimmedBody.startsWith(DEFAULT_DECLINE_TEMPLATE.trim());
  if (isDeclineBodyShape) {
    return {
      decision: "disallowed_decline",
      reasonCode: "PLAYBOOK_FORBIDDEN_DECLINE",
      matchedPlaybookRuleId: null,
      matchedPlaybookActionKey: row.source_action_key,
    };
  }

  return {
    decision: "allowed_draft",
    reasonCode: "PLAYBOOK_DRAFT_FOR_REVIEW",
    matchedPlaybookRuleId: null,
    matchedPlaybookActionKey: row.source_action_key,
  };
}

export type NonWeddingBusinessInquiryRouteOutcome = {
  decision: NonWeddingBusinessInquiryPolicyDecision;
  reasonCode: NonWeddingBusinessInquiryReasonCode;
  matchedPlaybookRuleId: string | null;
  matchedPlaybookActionKey: string | null;
  draftId: string | null;
  escalationId: string | null;
  decisionSource: NonWeddingInquiryDecisionSource;
  profileFit: NonWeddingProfileFit;
  profileFitReasonCodes: string[];
  /** True when the router found an already-routed thread and skipped inserts to stay idempotent. */
  alreadyRouted: boolean;
  /** Populated when `decision === "allowed_promote_to_project"` (linked `weddings` row). */
  promotedProjectId: string | null;
  promotedProjectType: WeddingProjectType | null;
};

/** True when promotion linked a first-class `weddings` row in this router pass (Slice 3–4). */
export function nonWeddingPromotionYieldedLinkedProject(
  outcome: NonWeddingBusinessInquiryRouteOutcome | null,
): boolean {
  return (
    outcome !== null &&
    outcome.decision === "allowed_promote_to_project" &&
    typeof outcome.promotedProjectId === "string" &&
    outcome.promotedProjectId.length > 0
  );
}

/**
 * Resolves `effectiveWeddingId` / `effectivePhotographerId` for {@link runMainPathEmailDispatch}
 * after optional wedding-intake bootstrap or non-wedding promotion (Slice 4). Intake bootstrap wins
 * when both are absent; promotion and intake bootstrap are mutually exclusive in practice.
 */
export function computeEffectiveWeddingAfterInboxTriage(input: {
  finalWeddingId: string | null;
  finalPhotographerId: string | null;
  tenantPhotographerId: string;
  bootstrapWeddingId: string | null;
  nonWeddingOutcome: NonWeddingBusinessInquiryRouteOutcome | null;
}): { effectiveWeddingId: string | null; effectivePhotographerId: string | null } {
  if (input.bootstrapWeddingId) {
    return {
      effectiveWeddingId: input.bootstrapWeddingId,
      effectivePhotographerId: input.tenantPhotographerId,
    };
  }
  if (nonWeddingPromotionYieldedLinkedProject(input.nonWeddingOutcome)) {
    return {
      effectiveWeddingId: input.nonWeddingOutcome!.promotedProjectId,
      effectivePhotographerId: input.finalPhotographerId ?? input.tenantPhotographerId,
    };
  }
  return {
    effectiveWeddingId: input.finalWeddingId,
    effectivePhotographerId: input.finalPhotographerId,
  };
}

/**
 * Reads the thread row + **active** non-wedding-inquiry artifacts. Routing metadata alone is
 * audit-only and never short-circuits. Idempotency requires a real row:
 *   - `drafts`: `source_action_key LIKE 'non_wedding_inquiry_%'` AND `status = 'pending_approval'`
 *   - `escalation_requests`: `action_key = 'non_wedding_inquiry_policy_review'` AND `status = 'open'`
 * When short-circuiting, metadata (decision, rule ids, etc.) enriches the returned outcome when present.
 * Pending-draft replay uses `instruction_history` / body when metadata is incomplete.
 */
async function findExistingNonWeddingInquiryArtifacts(
  supabase: SupabaseClient,
  input: { photographerId: string; threadId: string },
): Promise<{
  metadataDraftId: string | null;
  metadataEscalationId: string | null;
  metadataDecision: NonWeddingBusinessInquiryPolicyDecision | null;
  metadataReasonCode: NonWeddingBusinessInquiryReasonCode | null;
  metadataRuleId: string | null;
  metadataActionKey: string | null;
  metadataDecisionSource: NonWeddingInquiryDecisionSource | null;
  metadataProfileFit: NonWeddingProfileFit | null;
  metadataProfileFitReasonCodes: string[] | null;
  metadataPromotedProjectId: string | null;
  metadataPromotedProjectType: WeddingProjectType | null;
  existingDraftId: string | null;
  /** Snapshot for reconstructing decision/reason when metadata is missing (same row as `existingDraftId`). */
  pendingNonWeddingDraftRow: PendingNonWeddingDraftRow | null;
  existingEscalationId: string | null;
}> {
  const { data: threadRow, error: threadErr } = await supabase
    .from("threads")
    .select("ai_routing_metadata")
    .eq("id", input.threadId)
    .eq("photographer_id", input.photographerId)
    .maybeSingle();
  if (threadErr) {
    throw new Error(
      `nonWeddingBusinessInquiryRouter: thread read failed — ${threadErr.message}`,
    );
  }

  const meta =
    threadRow?.ai_routing_metadata && typeof threadRow.ai_routing_metadata === "object"
      ? (threadRow.ai_routing_metadata as Record<string, unknown>)
      : null;

  const isNonWeddingBucket =
    meta !== null && meta.routing_disposition === "non_wedding_business_inquiry";

  const metadataDraftId =
    isNonWeddingBucket && typeof meta!.seeded_draft_id === "string"
      ? (meta!.seeded_draft_id as string)
      : null;
  const metadataEscalationId =
    isNonWeddingBucket && typeof meta!.operator_review_escalation_id === "string"
      ? (meta!.operator_review_escalation_id as string)
      : null;
  const metadataDecision =
    isNonWeddingBucket && typeof meta!.policy_decision === "string"
      ? (meta!.policy_decision as NonWeddingBusinessInquiryPolicyDecision)
      : null;
  const metadataReasonCode =
    isNonWeddingBucket && typeof meta!.reason_code === "string"
      ? (meta!.reason_code as NonWeddingBusinessInquiryReasonCode)
      : null;
  const metadataRuleId =
    isNonWeddingBucket && typeof meta!.matched_playbook_rule_id === "string"
      ? (meta!.matched_playbook_rule_id as string)
      : null;
  const metadataActionKey =
    isNonWeddingBucket && typeof meta!.matched_playbook_action_key === "string"
      ? (meta!.matched_playbook_action_key as string)
      : null;
  const metadataDecisionSource =
    isNonWeddingBucket && typeof meta!.decision_source === "string"
      ? (meta!.decision_source as NonWeddingInquiryDecisionSource)
      : null;
  const metadataProfileFit =
    isNonWeddingBucket &&
    (meta!.profile_fit === "fit" ||
      meta!.profile_fit === "unfit" ||
      meta!.profile_fit === "ambiguous" ||
      meta!.profile_fit === "operator_review")
      ? (meta!.profile_fit as NonWeddingProfileFit)
      : null;
  const metadataProfileFitReasonCodes =
    isNonWeddingBucket && Array.isArray(meta!.profile_fit_reason_codes)
      ? (meta!.profile_fit_reason_codes as unknown[]).filter((x): x is string => typeof x === "string")
      : null;
  const metadataPromotedProjectId =
    isNonWeddingBucket && typeof meta!.promoted_project_id === "string"
      ? (meta!.promoted_project_id as string)
      : null;
  const rawProjectType = isNonWeddingBucket ? meta!.project_type : null;
  const metadataPromotedProjectType =
    rawProjectType === "wedding" ||
    rawProjectType === "portrait" ||
    rawProjectType === "commercial" ||
    rawProjectType === "family" ||
    rawProjectType === "editorial" ||
    rawProjectType === "brand_content" ||
    rawProjectType === "other"
      ? (rawProjectType as WeddingProjectType)
      : null;

  const { data: draftRows, error: draftErr } = await supabase
    .from("drafts")
    .select("id, source_action_key, instruction_history, body")
    .eq("photographer_id", input.photographerId)
    .eq("thread_id", input.threadId)
    .eq("status", "pending_approval")
    .like("source_action_key", "non_wedding_inquiry_%")
    .limit(1);
  if (draftErr) {
    throw new Error(
      `nonWeddingBusinessInquiryRouter: drafts read failed — ${draftErr.message}`,
    );
  }
  const draft0 = draftRows && draftRows.length > 0 ? draftRows[0] : null;
  const existingDraftId = draft0?.id != null ? (draft0.id as string) : null;
  const pendingNonWeddingDraftRow: PendingNonWeddingDraftRow | null = draft0
    ? {
        source_action_key:
          typeof draft0.source_action_key === "string" ? draft0.source_action_key : null,
        instruction_history: draft0.instruction_history,
        body: typeof draft0.body === "string" ? draft0.body : null,
      }
    : null;

  const { data: escRows, error: escErr } = await supabase
    .from("escalation_requests")
    .select("id, status")
    .eq("photographer_id", input.photographerId)
    .eq("thread_id", input.threadId)
    .eq("action_key", "non_wedding_inquiry_policy_review")
    .eq("status", "open")
    .limit(1);
  if (escErr) {
    throw new Error(
      `nonWeddingBusinessInquiryRouter: escalation_requests read failed — ${escErr.message}`,
    );
  }
  const existingEscalationId = escRows && escRows.length > 0 ? (escRows[0].id as string) : null;

  return {
    metadataDraftId,
    metadataEscalationId,
    metadataDecision,
    metadataReasonCode,
    metadataRuleId,
    metadataActionKey,
    metadataDecisionSource,
    metadataProfileFit,
    metadataProfileFitReasonCodes,
    metadataPromotedProjectId,
    metadataPromotedProjectType,
    existingDraftId,
    pendingNonWeddingDraftRow,
    existingEscalationId,
  };
}

/** Customer-facing reply when policy uses profile fit but no playbook rule (`PROFILE_FIT_FALLBACK_DRAFT`). */
function buildProfileDerivedFallbackCustomerEmail(dispatchIntent: TriageIntent): string {
  const cta = (() => {
    switch (dispatchIntent) {
      case "commercial":
        return "When you have a moment, could you share the scope, how you'd like to use the work, and your timeline — plus where you'd like to shoot if you know it?";
      case "logistics":
        return "When you have a moment, could you confirm the dates and locations you're considering, and what matters most for you on this?";
      case "project_management":
        return "Could you outline the main milestones or deliverables you're hoping for, and your rough timeline?";
      case "concierge":
        return "Could you share a bit more about what you have in mind — the kind of session or project, plus timing and location if you know them?";
      case "studio":
        return "Could you share a bit more about your request and any timing or location details that apply?";
      case "intake":
      default:
        return "Could you share a bit more about what you're looking for, plus any timing and location details that would help us respond?";
    }
  })();

  return [
    "Hello,",
    "",
    "Thank you for reaching out — we appreciate you getting in touch.",
    "",
    `We may be able to help with this kind of request. ${cta}`,
    "",
    "We'll review your note and follow up from here.",
    "",
    "Warm regards,",
  ].join("\n");
}

function buildDraftBody(input: {
  decision: NonWeddingBusinessInquiryPolicyDecision;
  instruction: string;
  decisionSource: NonWeddingInquiryDecisionSource;
  reasonCode: NonWeddingBusinessInquiryReasonCode;
  dispatchIntent: TriageIntent;
}): string {
  if (
    input.decision === "allowed_draft" &&
    input.decisionSource === "profile_derived_fallback" &&
    input.reasonCode === "PROFILE_FIT_FALLBACK_DRAFT"
  ) {
    return buildProfileDerivedFallbackCustomerEmail(input.dispatchIntent);
  }

  const trimmed = input.instruction.trim();
  if (input.decision === "disallowed_decline") {
    if (trimmed.length === 0) return DEFAULT_DECLINE_TEMPLATE;
    return `${DEFAULT_DECLINE_TEMPLATE}\n\nStudio rule note for operator: ${trimmed}`;
  }
  if (trimmed.length > 0) return trimmed;
  return "Draft for operator review — no studio instruction text on the matched rule.";
}

async function insertSeedDraft(
  supabase: SupabaseClient,
  input: {
    photographerId: string;
    threadId: string;
    body: string;
    decision: NonWeddingBusinessInquiryPolicyDecision;
    sourceActionKey: string | null;
    matchedRuleId: string | null;
    reasonCode: NonWeddingBusinessInquiryReasonCode;
    decisionSource: NonWeddingInquiryDecisionSource;
    profileFit: NonWeddingProfileFit;
    profileFitReasonCodes: string[];
  },
): Promise<string> {
  const historyEntry: Record<string, unknown> = {
    step: "non_wedding_business_inquiry_router",
    decision: input.decision,
    matched_playbook_rule_id: input.matchedRuleId,
    matched_playbook_action_key: input.sourceActionKey,
    reason_code: input.reasonCode,
    decision_source: input.decisionSource,
    profile_fit: input.profileFit,
    profile_fit_reason_codes: input.profileFitReasonCodes,
  };
  if (input.decisionSource === "profile_derived_fallback") {
    historyEntry.profile_fallback_operator_hint = PROFILE_FIT_FALLBACK_DRAFT_INSTRUCTION;
  }

  const { data, error } = await supabase
    .from("drafts")
    .insert({
      photographer_id: input.photographerId,
      thread_id: input.threadId,
      status: "pending_approval",
      body: input.body,
      source_action_key: input.sourceActionKey,
      instruction_history: [historyEntry],
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `nonWeddingBusinessInquiryRouter: drafts insert failed — ${error?.message ?? "no id"}`,
    );
  }

  return data.id as string;
}

async function insertOperatorReviewEscalation(
  supabase: SupabaseClient,
  input: {
    photographerId: string;
    threadId: string;
    dispatchIntent: TriageIntent;
    llmIntent: TriageIntent;
    senderEmail: string;
    reasonCode: NonWeddingBusinessInquiryReasonCode;
    matchedRuleId: string | null;
    matchedActionKey: string | null;
    senderRoleClassification?: InboundSenderRoleClassification | null;
  },
): Promise<string> {
  const question_body = formatOperatorEscalationQuestion(
    buildNonWeddingEscalationQuestionBody(input.reasonCode, input.senderRoleClassification),
  );

  const sr = input.senderRoleClassification;
  const senderRoleAudit =
    sr &&
    (input.reasonCode === "SENDER_ROLE_VENDOR_SOLICITATION_OPERATOR_REVIEW" ||
      input.reasonCode === "SENDER_ROLE_PARTNERSHIP_OPERATOR_REVIEW" ||
      input.reasonCode === "SENDER_ROLE_BILLING_FOLLOWUP_LINK_WEDDING" ||
      input.reasonCode === "SENDER_ROLE_RECRUITER_OPERATOR_REVIEW")
      ? {
          sender_role: sr.role,
          sender_role_confidence: sr.confidence,
          sender_role_reason: sr.reason ?? null,
        }
      : null;

  const decision_justification = {
    why_blocked: senderRoleAudit
      ? "sender_role_non_customer_human_outreach"
      : "non_wedding_business_inquiry_without_clear_policy",
    missing_capability_or_fact: senderRoleAudit
      ? "operator_disambiguation_inbound_sender_role_v1"
      : "playbook_rule_for_non_wedding_service_coverage",
    risk_class: senderRoleAudit ? "inbound_sender_role_v1" : "studio_scope_policy",
    reason_code: input.reasonCode,
    ...(senderRoleAudit ?? {}),
    evidence_refs: [
      `dispatch_intent:${input.dispatchIntent}`,
      `llm_intent:${input.llmIntent}`,
      `sender:${input.senderEmail}`,
      `matched_playbook_rule_id:${input.matchedRuleId ?? "none"}`,
      `matched_playbook_action_key:${input.matchedActionKey ?? "none"}`,
    ],
    recommended_next_step: senderRoleAudit
      ? "Review sender purpose and thread; do not approve client-style drafts until confirmed."
      : "add_or_update_playbook_rule_for_non_wedding_service_inquiry_then_resolve",
  };

  const { data, error } = await supabase
    .from("escalation_requests")
    .insert({
      photographer_id: input.photographerId,
      thread_id: input.threadId,
      wedding_id: null,
      action_key: "non_wedding_inquiry_policy_review",
      reason_code: input.reasonCode,
      decision_justification,
      question_body,
      recommended_resolution:
        "Reply via dashboard or decline, then (optionally) add a playbook rule so future similar inquiries route automatically.",
      status: "open",
      operator_delivery: "dashboard_only",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `nonWeddingBusinessInquiryRouter: escalation_requests insert failed — ${error?.message ?? "no id"}`,
    );
  }

  const escalationId = data.id as string;

  const { error: holdErr } = await supabase
    .from("threads")
    .update({
      v3_operator_automation_hold: true,
      v3_operator_hold_escalation_id: escalationId,
    })
    .eq("id", input.threadId)
    .eq("photographer_id", input.photographerId);

  if (holdErr) {
    console.error(
      "[nonWeddingBusinessInquiryRouter] thread v3_operator_automation_hold update failed:",
      holdErr.message,
    );
  }

  try {
    await inngest.send({
      name: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
      data: {
        schemaVersion: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
        photographerId: input.photographerId,
        escalationId,
        operatorDelivery: "dashboard_only" as const,
        questionBody: question_body,
        threadId: input.threadId,
      },
    });
  } catch (e) {
    console.error(
      "[nonWeddingBusinessInquiryRouter] operator escalation delivery fan-out failed (non-fatal):",
      e,
    );
  }

  return escalationId;
}

/**
 * End-to-end: fetch rules → evaluate → act. The caller persists the returned outcome into
 * `threads.ai_routing_metadata` via {@link buildAiRoutingMetadataNonWeddingBusinessInquiry}.
 *
 * **Idempotency:** short-circuit only when a **pending_approval** draft
 * (`non_wedding_inquiry_*` source_action_key) or an **open**
 * `non_wedding_inquiry_policy_review` escalation exists. Stale metadata or terminal drafts/escalations
 * do not block. If both an active draft and an open escalation exist, the draft path wins for the
 * returned decision/reason; both ids may still be returned for visibility.
 */
export async function routeNonWeddingBusinessInquiry(
  supabase: SupabaseClient,
  input: {
    photographerId: string;
    threadId: string;
    llmIntent: TriageIntent;
    dispatchIntent: TriageIntent;
    channel: NonWeddingBusinessInquiryChannel;
    senderEmail: string;
    /** Full inbound body — currently only used for observability; reply generation may use it in future slices. */
    body: string;
    /** Layer-3 sender role (post-ingest unlinked path); optional. */
    senderRoleClassification?: InboundSenderRoleClassification | null;
    /** Canonical thread title — used for v1 `project_type` inference. */
    threadTitle?: string | null;
  },
): Promise<NonWeddingBusinessInquiryRouteOutcome> {
  const existing = await findExistingNonWeddingInquiryArtifacts(supabase, {
    photographerId: input.photographerId,
    threadId: input.threadId,
  });

  const activeDraftId = existing.existingDraftId;
  const activeEscalationId = existing.existingEscalationId;

  if (activeDraftId) {
    const fromDraft =
      existing.pendingNonWeddingDraftRow !== null
        ? reconstructOutcomeFromPendingNonWeddingDraft(existing.pendingNonWeddingDraftRow)
        : null;
    const fromDraftAudit =
      existing.pendingNonWeddingDraftRow !== null
        ? extractProfileAuditFromDraftHistory(existing.pendingNonWeddingDraftRow)
        : null;
    const decision: NonWeddingBusinessInquiryPolicyDecision =
      existing.metadataDecision ?? fromDraft?.decision ?? "allowed_draft";
    const reasonCode: NonWeddingBusinessInquiryReasonCode =
      existing.metadataReasonCode ??
      fromDraft?.reasonCode ??
      reasonCodeForNonWeddingDraftDecision(decision);
    return {
      decision,
      reasonCode,
      matchedPlaybookRuleId: existing.metadataRuleId ?? fromDraft?.matchedPlaybookRuleId ?? null,
      matchedPlaybookActionKey:
        existing.metadataActionKey ?? fromDraft?.matchedPlaybookActionKey ?? null,
      draftId: activeDraftId,
      escalationId: activeEscalationId ?? null,
      decisionSource:
        existing.metadataDecisionSource ??
        fromDraftAudit?.decisionSource ??
        "playbook_explicit",
      profileFit: existing.metadataProfileFit ?? fromDraftAudit?.profileFit ?? "ambiguous",
      profileFitReasonCodes:
        existing.metadataProfileFitReasonCodes ?? fromDraftAudit?.profileFitReasonCodes ?? [],
      alreadyRouted: true,
      promotedProjectId: existing.metadataPromotedProjectId,
      promotedProjectType: existing.metadataPromotedProjectType,
    };
  }

  if (activeEscalationId) {
    const decision: NonWeddingBusinessInquiryPolicyDecision =
      existing.metadataDecision ?? "unclear_operator_review";
    const reasonCode: NonWeddingBusinessInquiryReasonCode =
      existing.metadataReasonCode ?? "PROFILE_AMBIGUOUS_NO_PLAYBOOK_ESCALATE";
    return {
      decision,
      reasonCode,
      matchedPlaybookRuleId: existing.metadataRuleId,
      matchedPlaybookActionKey: existing.metadataActionKey,
      draftId: null,
      escalationId: activeEscalationId,
      decisionSource: existing.metadataDecisionSource ?? "profile_ambiguous_escalate",
      profileFit: existing.metadataProfileFit ?? "ambiguous",
      profileFitReasonCodes: existing.metadataProfileFitReasonCodes ?? [],
      alreadyRouted: true,
      promotedProjectId: existing.metadataPromotedProjectId,
      promotedProjectType: existing.metadataPromotedProjectType,
    };
  }

  const [rules, profile] = await Promise.all([
    fetchNonWeddingBusinessInquiryPlaybookRules(supabase, input.photographerId),
    fetchStudioBusinessProfileForNonWeddingPolicy(supabase, input.photographerId),
  ]);

  const basePolicy = resolveNonWeddingBusinessInquiryPolicyWithProfile(
    rules,
    profile,
    input.dispatchIntent,
    input.channel,
    input.senderRoleClassification ?? null,
  );
  const policy = applyCustomerLeadProjectPromotionUpgrade(
    basePolicy,
    input.senderRoleClassification ?? null,
  );

  const shared = {
    reasonCode: policy.reasonCode,
    matchedPlaybookRuleId: policy.matchedRule?.id ?? null,
    matchedPlaybookActionKey: policy.matchedActionKey,
    decisionSource: policy.decisionSource,
    profileFit: policy.profileFit,
    profileFitReasonCodes: policy.profileFitReasonCodes,
    alreadyRouted: false,
  };

  if (policy.decision === "allowed_promote_to_project") {
    const projectType = inferPromotedNonWeddingProjectTypeV1({
      dispatchIntent: input.dispatchIntent,
      profile,
      threadTitle: input.threadTitle ?? null,
      rawMessagePreview: input.body,
    });
    const { weddingId } = await bootstrapInquiryWeddingForCanonicalThread(supabase, {
      photographerId: input.photographerId,
      threadId: input.threadId,
      rawMessagePreview: input.body,
      senderEmail: input.senderEmail,
      threadTitle: input.threadTitle ?? null,
      projectType,
    });

    return {
      decision: policy.decision,
      ...shared,
      draftId: null,
      escalationId: null,
      promotedProjectId: weddingId,
      promotedProjectType: projectType,
    };
  }

  if (
    policy.decision === "allowed_auto" ||
    policy.decision === "allowed_draft" ||
    policy.decision === "disallowed_decline"
  ) {
    const draftId = await insertSeedDraft(supabase, {
      photographerId: input.photographerId,
      threadId: input.threadId,
      body: buildDraftBody({
        decision: policy.decision,
        instruction: policy.instruction,
        decisionSource: policy.decisionSource,
        reasonCode: policy.reasonCode,
        dispatchIntent: input.dispatchIntent,
      }),
      decision: policy.decision,
      sourceActionKey: policy.matchedActionKey,
      matchedRuleId: policy.matchedRule?.id ?? null,
      reasonCode: policy.reasonCode,
      decisionSource: policy.decisionSource,
      profileFit: policy.profileFit,
      profileFitReasonCodes: policy.profileFitReasonCodes,
    });

    return {
      decision: policy.decision,
      ...shared,
      draftId,
      escalationId: null,
      promotedProjectId: null,
      promotedProjectType: null,
    };
  }

  const escalationId = await insertOperatorReviewEscalation(supabase, {
    photographerId: input.photographerId,
    threadId: input.threadId,
    dispatchIntent: input.dispatchIntent,
    llmIntent: input.llmIntent,
    senderEmail: input.senderEmail,
    reasonCode: policy.reasonCode,
    matchedRuleId: policy.matchedRule?.id ?? null,
    matchedActionKey: policy.matchedActionKey,
    senderRoleClassification: input.senderRoleClassification ?? null,
  });

  return {
    decision: policy.decision,
    ...shared,
    draftId: null,
    escalationId,
    promotedProjectId: null,
    promotedProjectType: null,
  };
}
