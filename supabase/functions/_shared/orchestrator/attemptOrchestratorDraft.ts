/**
 * Phase 2 Slice A2 — bounded `drafts` insert for `clientOrchestratorV1`.
 * Safety: only `send_message` candidates may become drafts — matches approval/outbound as client-facing text.
 * No outbound sends, no CRM writes.
 *
 * **`drafts.body` is always safe to display** as draft content (placeholder until persona succeeds, then
 * client prose). Orchestrator diagnostics (action, rationale, inbound excerpt, policy snippets) live in
 * `instruction_history` only — see the `client_orchestrator_v1` step fields.
 *
 * For live client-facing prose, the Inngest worker runs {@link maybeRewriteOrchestratorDraftWithPersona}
 * after insert when `ANTHROPIC_API_KEY` is set (`ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY=0` disables rewrite).
 *
 * **V3 RBAC:** When `audience.clientVisibleForPrivateCommercialRedaction` is true, the placeholder is still
 * passed through redaction (no-op for fixed copy) for consistency with other paths.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  DecisionAudienceSnapshot,
  OrchestratorDraftAttemptResult,
  OrchestratorProposalCandidate,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import {
  redactPlannerPrivateCommercialMultilineText,
  redactPlannerPrivateCommercialText,
} from "../context/applyAudiencePrivateCommercialRedaction.ts";
import { ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION } from "../inngest.ts";

export type OrchestratorStubDraftAudienceOptions = Pick<
  DecisionAudienceSnapshot,
  "clientVisibleForPrivateCommercialRedaction"
>;

type OrchestratorRuntimeOutcome = "auto" | "draft" | "ask" | "block";

/** Safe pending-draft copy only — must stay free of machine diagnostics (keep in sync with `src/lib/inquiryWritingHostedQaClassification.ts`). */
export const ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER =
  "Reply draft pending — generated text will replace this when the writer runs successfully." as const;

/** `attemptOrchestratorDraft` skipReason when no `send_message` proposal is draftable (all blocked or absent). */
export const ORCHESTRATOR_DRAFT_SKIP_NO_DRAFTABLE_CANDIDATE =
  "no_draftable_send_message_candidate" as const;

/** Only `send_message` + non-block proposals are draftable for the existing approval → outbound message path. */
function selectSendMessageDraftableCandidate(
  proposals: OrchestratorProposalCandidate[],
): OrchestratorProposalCandidate | null {
  return (
    proposals.find(
      (p) => p.action_family === "send_message" && p.likely_outcome !== "block",
    ) ?? null
  );
}

export function playbookExcerptsFromRules(rules: PlaybookRuleContextRow[], maxLines: number): string[] {
  return rules
    .filter((r) => r.is_active !== false)
    .slice(0, maxLines)
    .map((r) => {
      const topic = r.topic ?? "rule";
      const ins = (r.instruction ?? "").trim().slice(0, 200);
      return `${topic}: ${ins}`;
    });
}

/** Operator-only metadata persisted on `instruction_history` (never concatenate into `drafts.body`). */
export type OrchestratorA2DraftDiagnostics = {
  orchestrator_rationale: string;
  inbound_excerpt: string;
  policy_context_excerpts: string[];
  reply_channel: "email" | "web";
  blockers_or_missing_facts: string[];
};

export function buildOrchestratorA2DraftDiagnostics(
  candidate: OrchestratorProposalCandidate,
  rawMessage: string,
  replyChannel: "email" | "web",
  playbookRules: PlaybookRuleContextRow[],
  audience?: OrchestratorStubDraftAudienceOptions | null,
): OrchestratorA2DraftDiagnostics {
  const base: OrchestratorA2DraftDiagnostics = {
    orchestrator_rationale: candidate.rationale,
    inbound_excerpt: rawMessage.trim().slice(0, 800),
    policy_context_excerpts: playbookExcerptsFromRules(playbookRules, 3).map((ex) => ex.slice(0, 240)),
    reply_channel: replyChannel,
    blockers_or_missing_facts: [...candidate.blockers_or_missing_facts],
  };
  if (!audience?.clientVisibleForPrivateCommercialRedaction) {
    return base;
  }
  return {
    ...base,
    orchestrator_rationale: redactPlannerPrivateCommercialText(base.orchestrator_rationale),
    inbound_excerpt: redactPlannerPrivateCommercialMultilineText(base.inbound_excerpt),
    policy_context_excerpts: base.policy_context_excerpts.map((ex) => redactPlannerPrivateCommercialText(ex)),
  };
}

/**
 * Client-safe placeholder body until persona runs (or when persona restores after audit failure).
 * Does not include action keys, rationale, or policy text.
 */
export function buildOrchestratorStubDraftBody(
  _candidate: OrchestratorProposalCandidate,
  _rawMessage: string,
  _replyChannel: "email" | "web",
  _playbookRules: PlaybookRuleContextRow[],
  audience?: OrchestratorStubDraftAudienceOptions | null,
): string {
  void _candidate;
  void _rawMessage;
  void _replyChannel;
  void _playbookRules;
  const raw = ORCHESTRATOR_PENDING_DRAFT_BODY_PLACEHOLDER;
  if (audience?.clientVisibleForPrivateCommercialRedaction) {
    return redactPlannerPrivateCommercialMultilineText(raw);
  }
  return raw;
}

export type AttemptOrchestratorDraftParams = {
  photographerId: string;
  threadId: string | null;
  proposedActions: OrchestratorProposalCandidate[];
  verifierSuccess: boolean;
  orchestratorOutcome: OrchestratorRuntimeOutcome;
  rawMessage: string;
  replyChannel: "email" | "web";
  playbookRules: PlaybookRuleContextRow[];
  /** When set from `buildDecisionContext`, client-visible runs get stub redaction at insert time. */
  audience?: OrchestratorStubDraftAudienceOptions | null;
};

/**
 * Creates at most one pending draft when verifier passed and runtime outcome is draft/ask-first review.
 */
export async function attemptOrchestratorDraft(
  supabase: SupabaseClient,
  params: AttemptOrchestratorDraftParams,
): Promise<OrchestratorDraftAttemptResult> {
  const {
    photographerId,
    threadId,
    proposedActions,
    verifierSuccess,
    orchestratorOutcome,
    rawMessage,
    replyChannel,
    playbookRules,
  } = params;

  if (!verifierSuccess) {
    return {
      draftCreated: false,
      draftId: null,
      chosenCandidate: null,
      skipReason: "verifier_blocked",
    };
  }

  if (!photographerId || typeof photographerId !== "string" || photographerId.trim().length === 0) {
    return {
      draftCreated: false,
      draftId: null,
      chosenCandidate: null,
      skipReason: "missing_photographer_id",
    };
  }

  if (!threadId) {
    return {
      draftCreated: false,
      draftId: null,
      chosenCandidate: null,
      skipReason: "missing_thread_id",
    };
  }

  if (orchestratorOutcome === "block") {
    return {
      draftCreated: false,
      draftId: null,
      chosenCandidate: null,
      skipReason: "orchestrator_outcome_block",
    };
  }

  if (orchestratorOutcome === "auto") {
    return {
      draftCreated: false,
      draftId: null,
      chosenCandidate: null,
      skipReason: "outcome_auto_no_draft_in_slice_a2",
    };
  }

  const chosen = selectSendMessageDraftableCandidate(proposedActions);
  if (!chosen) {
    return {
      draftCreated: false,
      draftId: null,
      chosenCandidate: null,
      skipReason: ORCHESTRATOR_DRAFT_SKIP_NO_DRAFTABLE_CANDIDATE,
    };
  }

  const body = buildOrchestratorStubDraftBody(chosen, rawMessage, replyChannel, playbookRules, params.audience);
  const diagnostics = buildOrchestratorA2DraftDiagnostics(
    chosen,
    rawMessage,
    replyChannel,
    playbookRules,
    params.audience,
  );

  const { data, error } = await supabase
    .from("drafts")
    .insert({
      photographer_id: photographerId,
      thread_id: threadId,
      status: "pending_approval",
      body,
      instruction_history: [
        {
          step: "client_orchestrator_v1",
          orchestrator_slice: "A2_draft",
          schema_version: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
          candidate_id: chosen.id,
          action_family: chosen.action_family,
          action_key: chosen.action_key,
          playbook_rule_ids: chosen.playbook_rule_ids ?? null,
          ...diagnostics,
        },
      ],
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return {
      draftCreated: false,
      draftId: null,
      chosenCandidate: chosen,
      skipReason: `draft_insert_failed:${error?.message ?? "unknown"}`,
    };
  }

  return {
    draftCreated: true,
    draftId: data.id as string,
    chosenCandidate: chosen,
    skipReason: null,
  };
}
