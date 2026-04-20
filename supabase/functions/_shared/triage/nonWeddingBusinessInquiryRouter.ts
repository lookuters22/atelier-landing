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
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatOperatorEscalationQuestion } from "../formatOperatorEscalation.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
} from "../inngest.ts";
import type { TriageIntent } from "../agents/triage.ts";
import type { NonWeddingBusinessInquiryPolicyDecision } from "./emailIngressClassification.ts";
import {
  evaluateNonWeddingBusinessInquiryPolicy,
  fetchNonWeddingBusinessInquiryPlaybookRules,
  type NonWeddingBusinessInquiryChannel,
  type NonWeddingBusinessInquiryPolicyResult,
} from "./nonWeddingBusinessInquiryPolicy.ts";

const DEFAULT_DECLINE_TEMPLATE =
  "Thanks for reaching out! Right now we only take on wedding commissions, so we're not the right fit for this one — but we wish you the best with the shoot.";

const DEFAULT_UNCLEAR_OPERATOR_QUESTION =
  "Non-wedding inquiry arrived with no studio rule covering it. Decide whether to reply, decline, or ignore before automation proceeds.";

const NON_WEDDING_ROUTER_INSTRUCTION_STEP = "non_wedding_business_inquiry_router";

/** Appended only by {@link buildDraftBody} for `disallowed_decline` drafts — reliable without JSON history. */
const DECLINE_BODY_OPERATOR_NOTE_MARKER = "Studio rule note for operator:";

function reasonCodeForNonWeddingDraftDecision(
  decision: NonWeddingBusinessInquiryPolicyDecision,
): NonWeddingBusinessInquiryPolicyResult["reasonCode"] {
  switch (decision) {
    case "allowed_auto":
      return "PLAYBOOK_AUTO_REPLY";
    case "allowed_draft":
      return "PLAYBOOK_DRAFT_FOR_REVIEW";
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
function reconstructOutcomeFromPendingNonWeddingDraft(
  row: PendingNonWeddingDraftRow,
): {
  decision: NonWeddingBusinessInquiryPolicyDecision;
  reasonCode: NonWeddingBusinessInquiryPolicyResult["reasonCode"];
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
        return {
          decision: d,
          reasonCode: reasonCodeForNonWeddingDraftDecision(d),
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
  reasonCode: NonWeddingBusinessInquiryPolicyResult["reasonCode"];
  matchedPlaybookRuleId: string | null;
  matchedPlaybookActionKey: string | null;
  draftId: string | null;
  escalationId: string | null;
  /** True when the router found an already-routed thread and skipped inserts to stay idempotent. */
  alreadyRouted: boolean;
};

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
  metadataReasonCode: NonWeddingBusinessInquiryPolicyResult["reasonCode"] | null;
  metadataRuleId: string | null;
  metadataActionKey: string | null;
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
      ? (meta!.reason_code as NonWeddingBusinessInquiryPolicyResult["reasonCode"])
      : null;
  const metadataRuleId =
    isNonWeddingBucket && typeof meta!.matched_playbook_rule_id === "string"
      ? (meta!.matched_playbook_rule_id as string)
      : null;
  const metadataActionKey =
    isNonWeddingBucket && typeof meta!.matched_playbook_action_key === "string"
      ? (meta!.matched_playbook_action_key as string)
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
    existingDraftId,
    pendingNonWeddingDraftRow,
    existingEscalationId,
  };
}

function buildDraftBody(input: {
  decision: NonWeddingBusinessInquiryPolicyDecision;
  instruction: string;
}): string {
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
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("drafts")
    .insert({
      photographer_id: input.photographerId,
      thread_id: input.threadId,
      status: "pending_approval",
      body: input.body,
      source_action_key: input.sourceActionKey,
      instruction_history: [
        {
          step: "non_wedding_business_inquiry_router",
          decision: input.decision,
          matched_playbook_rule_id: input.matchedRuleId,
          matched_playbook_action_key: input.sourceActionKey,
        },
      ],
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
    reasonCode: NonWeddingBusinessInquiryPolicyResult["reasonCode"];
    matchedRuleId: string | null;
    matchedActionKey: string | null;
  },
): Promise<string> {
  const question_body = formatOperatorEscalationQuestion(DEFAULT_UNCLEAR_OPERATOR_QUESTION);

  const decision_justification = {
    why_blocked: "non_wedding_business_inquiry_without_clear_policy",
    missing_capability_or_fact: "playbook_rule_for_non_wedding_service_coverage",
    risk_class: "studio_scope_policy",
    reason_code: input.reasonCode,
    evidence_refs: [
      `dispatch_intent:${input.dispatchIntent}`,
      `llm_intent:${input.llmIntent}`,
      `sender:${input.senderEmail}`,
      `matched_playbook_rule_id:${input.matchedRuleId ?? "none"}`,
      `matched_playbook_action_key:${input.matchedActionKey ?? "none"}`,
    ],
    recommended_next_step:
      "add_or_update_playbook_rule_for_non_wedding_service_inquiry_then_resolve",
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
    const decision: NonWeddingBusinessInquiryPolicyDecision =
      existing.metadataDecision ?? fromDraft?.decision ?? "allowed_draft";
    const reasonCode: NonWeddingBusinessInquiryPolicyResult["reasonCode"] =
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
      alreadyRouted: true,
    };
  }

  if (activeEscalationId) {
    const decision: NonWeddingBusinessInquiryPolicyDecision =
      existing.metadataDecision ?? "unclear_operator_review";
    const reasonCode: NonWeddingBusinessInquiryPolicyResult["reasonCode"] =
      existing.metadataReasonCode ?? "PLAYBOOK_NO_RULE_ESCALATE";
    return {
      decision,
      reasonCode,
      matchedPlaybookRuleId: existing.metadataRuleId,
      matchedPlaybookActionKey: existing.metadataActionKey,
      draftId: null,
      escalationId: activeEscalationId,
      alreadyRouted: true,
    };
  }

  const rules = await fetchNonWeddingBusinessInquiryPlaybookRules(
    supabase,
    input.photographerId,
  );

  const policy = evaluateNonWeddingBusinessInquiryPolicy(
    rules,
    input.dispatchIntent,
    input.channel,
  );

  const shared = {
    reasonCode: policy.reasonCode,
    matchedPlaybookRuleId: policy.matchedRule?.id ?? null,
    matchedPlaybookActionKey: policy.matchedActionKey,
    alreadyRouted: false,
  };

  if (
    policy.decision === "allowed_auto" ||
    policy.decision === "allowed_draft" ||
    policy.decision === "disallowed_decline"
  ) {
    const draftId = await insertSeedDraft(supabase, {
      photographerId: input.photographerId,
      threadId: input.threadId,
      body: buildDraftBody({ decision: policy.decision, instruction: policy.instruction }),
      decision: policy.decision,
      sourceActionKey: policy.matchedActionKey,
      matchedRuleId: policy.matchedRule?.id ?? null,
    });

    return {
      decision: policy.decision,
      ...shared,
      draftId,
      escalationId: null,
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
  });

  return {
    decision: policy.decision,
    ...shared,
    draftId: null,
    escalationId,
  };
}
