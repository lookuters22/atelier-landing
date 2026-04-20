/**
 * Shared email ingress classification (deterministic identity, LLM intent, stage gate, matchmaker).
 * Used by triage `comms/email.received` / `comms/web.received` main path and `inbox/thread.requires_triage.v1`.
 * Does not persist threads/messages.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { TriageIntent } from "../agents/triage.ts";
import { runMatchmakerAgent, type MatchmakerResult } from "../agents/matchmaker.ts";
import {
  BOUNDED_UNRESOLVED_MATCH_APPROVAL_ESCALATION_MIN_CONFIDENCE,
  BOUNDED_UNRESOLVED_MATCH_AUTO_RESOLVE_MIN_CONFIDENCE,
  getTriageQaBoundedNearMatchSyntheticConfidenceScore,
  isTriageBoundedUnresolvedEmailMatchApprovalEscalationEnabled,
  isTriageBoundedUnresolvedEmailMatchmakerEnabled,
  TRIAGE_QA_BOUNDED_NEAR_MATCH_SYNTHETIC_CONFIDENCE_V1_ENV,
} from "../orchestrator/triageShadowOrchestratorClientV1Gate.ts";

export type StageGroup = "new_lead" | "pre_booking" | "active" | "post_wedding";

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

/** Matchmaker step output + explicit skip reason for observability. */
export type MatchmakerStepResult = {
  weddingId: string | null;
  match: MatchmakerResult | null;
  photographerId?: string | null;
  resolved_wedding_project_stage?: string | null;
  matchmaker_invoked: boolean;
  matchmaker_skip_reason: string;
  bounded_unresolved_activation?: boolean;
  qa_synthetic_near_match_confidence?: number | null;
};

export type EmailIngressIdentity = {
  weddingId: string | null;
  photographerId: string | null;
  projectStage: string | null;
};

export function enforceStageGate(
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

export async function resolveDeterministicIdentity(
  supabase: SupabaseClient,
  input: { sender: string; payloadPhotographerId: string | null },
): Promise<EmailIngressIdentity> {
  let weddingId: string | null = null;
  let photographerId: string | null = null;
  let projectStage: string | null = null;

  if (input.sender) {
    const { data: client } = await supabase
      .from("clients")
      .select("wedding_id")
      .eq("email", input.sender)
      .limit(1)
      .maybeSingle();

    weddingId = (client?.wedding_id as string) ?? null;
  }

  if (weddingId) {
    const { data: wedding } = await supabase
      .from("weddings")
      .select("photographer_id, stage")
      .eq("id", weddingId)
      .single();

    photographerId = (wedding?.photographer_id as string) ?? null;
    projectStage = (wedding?.stage as string) ?? null;
  }

  if (!photographerId && input.payloadPhotographerId) {
    photographerId = input.payloadPhotographerId;
  }

  return { weddingId, photographerId, projectStage };
}

export async function runConditionalMatchmakerForEmail(
  supabase: SupabaseClient,
  input: {
    body: string;
    identity: EmailIngressIdentity;
    stageGateIntent: TriageIntent;
    boundedUnresolvedSubsetEligible: boolean;
    payloadPhotographerId: string | null;
  },
): Promise<MatchmakerStepResult> {
  const { body, identity, stageGateIntent, boundedUnresolvedSubsetEligible, payloadPhotographerId } =
    input;

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

  const { data: activeWeddings } = await supabase
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

  let match = await runMatchmakerAgent(body, activeWeddings as Record<string, unknown>[]);

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
    const { data: wedding } = await supabase
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
}

export type BoundedUnresolvedOutcome =
  | "not_eligible"
  | "resolved_above_threshold"
  | "escalated_for_approval"
  | "declined_low_confidence"
  | "skipped_matchmaker_not_invoked";

export function buildBoundedUnresolvedOutcome(input: {
  boundedUnresolvedGateOn: boolean;
  boundedUnresolvedSubsetEligible: boolean;
  matchResult: MatchmakerStepResult;
  nearMatchForApproval: boolean;
}): {
  gate_on: boolean;
  subset_eligible: boolean;
  activation: boolean;
  outcome: BoundedUnresolvedOutcome;
} {
  const {
    boundedUnresolvedGateOn,
    boundedUnresolvedSubsetEligible,
    matchResult,
    nearMatchForApproval,
  } = input;

  if (!boundedUnresolvedSubsetEligible) {
    return {
      gate_on: boundedUnresolvedGateOn,
      subset_eligible: false,
      activation: false,
      outcome: "not_eligible",
    };
  }
  if (!matchResult.matchmaker_invoked) {
    return {
      gate_on: true,
      subset_eligible: true,
      activation: false,
      outcome: "skipped_matchmaker_not_invoked",
    };
  }
  if (matchResult.matchmaker_skip_reason === "matchmaker_resolved_above_threshold") {
    return {
      gate_on: true,
      subset_eligible: true,
      activation: true,
      outcome: "resolved_above_threshold",
    };
  }
  if (nearMatchForApproval) {
    return {
      gate_on: true,
      subset_eligible: true,
      activation: true,
      outcome: "escalated_for_approval",
    };
  }
  return {
    gate_on: true,
    subset_eligible: true,
    activation: true,
    outcome: "declined_low_confidence",
  };
}

export function buildWeddingResolutionTrace(input: {
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
    outcome: BoundedUnresolvedOutcome;
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

/** `legacy` = triage / comms ingress (unchanged). `gmail_canonical` = post-ingest classifier: never coerce unlinked mail to intake via gate. */
export type EmailIngressDerivePolicy = "legacy" | "gmail_canonical";

/** Compute derived routing fields after matchmaker (matches triage main-path semantics). */
export function deriveEmailIngressRouting(input: {
  identity: EmailIngressIdentity;
  llmIntent: TriageIntent;
  stageGateIntent: TriageIntent;
  matchResult: MatchmakerStepResult;
  payloadPhotographerId: string | null;
  boundedUnresolvedSubsetEligible: boolean;
  /** Default `legacy` — pass `gmail_canonical` from `processInboxThreadRequiresTriage` only. */
  derivePolicy?: EmailIngressDerivePolicy;
}) {
  const { identity, llmIntent, stageGateIntent, matchResult, payloadPhotographerId } = input;
  const derivePolicy: EmailIngressDerivePolicy = input.derivePolicy ?? "legacy";

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
    input.boundedUnresolvedSubsetEligible &&
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

  const dispatchIntent =
    derivePolicy === "gmail_canonical" && !finalWeddingId
      ? llmIntent
      : enforceStageGate(llmIntent, projectStageUsedForDispatch, !!finalWeddingId);

  const boundedUnresolvedGateOn = isTriageBoundedUnresolvedEmailMatchmakerEnabled();
  const boundedUnresolved = buildBoundedUnresolvedOutcome({
    boundedUnresolvedGateOn,
    boundedUnresolvedSubsetEligible: input.boundedUnresolvedSubsetEligible,
    matchResult,
    nearMatchForApproval,
  });

  const weddingResolutionTrace = buildWeddingResolutionTrace({
    identity,
    llmIntent,
    enforcedIntent: stageGateIntent,
    dispatchIntent,
    projectStageUsedForDispatch,
    matchResult,
    finalWeddingId,
    boundedUnresolved,
  });

  return {
    finalWeddingId,
    finalPhotographerId,
    matchCandidateId,
    matchConfidence,
    nearMatchForApproval,
    projectStageUsedForDispatch,
    dispatchIntent,
    boundedUnresolved,
    weddingResolutionTrace,
    approvalEscalationGateOn,
    boundedUnresolvedGateOn,
  };
}

export function buildAiRoutingMetadataForUnresolved(input: {
  finalWeddingId: string | null;
  matchResult: MatchmakerStepResult;
  dispatchIntent: TriageIntent;
  nearMatchForApproval: boolean;
}): Record<string, unknown> | null {
  const { finalWeddingId, matchResult, dispatchIntent, nearMatchForApproval } = input;
  if (!finalWeddingId && matchResult.match) {
    return {
      suggested_wedding_id: matchResult.match.suggested_wedding_id,
      confidence_score: matchResult.match.confidence_score,
      reasoning: matchResult.match.reasoning,
      classified_intent: dispatchIntent,
      routing_disposition: nearMatchForApproval
        ? ("near_match_escalation_candidate" as const)
        : ("suggested_match_unresolved" as const),
      ...(nearMatchForApproval
        ? {
            pending_photographer_wedding_approval: true as const,
            routing_kind: "near_match_escalation_candidate" as const,
          }
        : {}),
    };
  }
  return null;
}

/**
 * Unlinked mail classified by LLM but no wedding to attach — visibility-first, no worker implied.
 * `confidence_score` / `reasoning` populated when the triage model exposes them (future).
 *
 * Legacy disposition label — kept for backward compatibility with rows persisted before the
 * non-wedding business inquiry policy router shipped. New callers should prefer
 * {@link buildAiRoutingMetadataNonWeddingBusinessInquiry} once policy has been evaluated.
 */
export function buildAiRoutingMetadataUnlinkedHumanNoRoute(input: {
  llmIntent: TriageIntent;
  confidenceScore?: number | null;
  reasoning?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    classified_intent: input.llmIntent,
    routing_disposition: "unresolved_human",
  };
  if (input.confidenceScore != null && typeof input.confidenceScore === "number") {
    out.confidence_score = input.confidenceScore;
  }
  if (input.reasoning != null && String(input.reasoning).trim()) {
    out.reasoning = String(input.reasoning).slice(0, 2000);
  }
  return out;
}

/**
 * Distinct classification bucket for an unlinked human message that the LLM classified as a
 * **non-wedding business inquiry** (e.g. travel sessions, commercial shoots, portraits). Separate
 * from promo / automated / bulk suppression (`promo_automated`) and from the pre-policy
 * `unresolved_human` label. Emitted by the non-wedding business inquiry router after it evaluates
 * the photographer's playbook rules.
 */
export type NonWeddingBusinessInquiryPolicyDecision =
  | "allowed_auto"
  | "allowed_draft"
  | "disallowed_decline"
  | "unclear_operator_review";

export function buildAiRoutingMetadataNonWeddingBusinessInquiry(input: {
  llmIntent: TriageIntent;
  dispatchIntent: TriageIntent;
  policyDecision: NonWeddingBusinessInquiryPolicyDecision;
  matchedPlaybookRuleId: string | null;
  matchedPlaybookActionKey: string | null;
  reasonCode: string;
  draftId?: string | null;
  escalationId?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    classified_intent: input.llmIntent,
    dispatch_intent: input.dispatchIntent,
    routing_disposition: "non_wedding_business_inquiry",
    policy_decision: input.policyDecision,
    matched_playbook_rule_id: input.matchedPlaybookRuleId,
    matched_playbook_action_key: input.matchedPlaybookActionKey,
    reason_code: input.reasonCode,
  };
  if (input.draftId) out.seeded_draft_id = input.draftId;
  if (input.escalationId) out.operator_review_escalation_id = input.escalationId;
  return out;
}

/** Use LLM intent for matchmaker gating when unlinked; preserve stage gate when a project already exists. */
export function matchmakerStageIntentForGmailClassifier(
  llmIntent: TriageIntent,
  identity: EmailIngressIdentity,
): TriageIntent {
  if (identity.weddingId) {
    return enforceStageGate(llmIntent, identity.projectStage, true);
  }
  return llmIntent;
}
