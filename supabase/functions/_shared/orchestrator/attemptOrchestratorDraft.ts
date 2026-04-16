/**
 * Phase 2 Slice A2 — bounded `drafts` insert for `clientOrchestratorV1`.
 * Safety: only `send_message` candidates may become drafts — matches approval/outbound as client-facing text.
 * No outbound sends, no CRM writes.
 *
 * **Body:** deterministic **stub** (`[Orchestrator draft — clientOrchestratorV1 QA path]`) from proposal + excerpts.
 * This is not a misconfiguration: A2 never called an LLM. For live client-facing prose, the Inngest worker runs
 * {@link maybeRewriteOrchestratorDraftWithPersona} after insert when `ANTHROPIC_API_KEY` is set (override with
 * `ORCHESTRATOR_CLIENT_V1_PERSONA_DRAFT_BODY=0` to keep the stub for parity harnesses).
 *
 * **V3 RBAC:** When `audience.clientVisibleForPrivateCommercialRedaction` is passed as true, the stub body is
 * line-redacted so planner-private commercial phrasing does not persist in drafts for client-visible runs
 * (no-persona path, persona-skipped path, stub restore).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  DecisionAudienceSnapshot,
  OrchestratorDraftAttemptResult,
  OrchestratorProposalCandidate,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import { redactPlannerPrivateCommercialMultilineText } from "../context/applyAudiencePrivateCommercialRedaction.ts";
import { ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION } from "../inngest.ts";

export type OrchestratorStubDraftAudienceOptions = Pick<
  DecisionAudienceSnapshot,
  "clientVisibleForPrivateCommercialRedaction"
>;

type OrchestratorRuntimeOutcome = "auto" | "draft" | "ask" | "block";

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

function playbookExcerptsFromRules(rules: PlaybookRuleContextRow[], maxLines: number): string[] {
  return rules
    .filter((r) => r.is_active !== false)
    .slice(0, maxLines)
    .map((r) => {
      const topic = r.topic ?? "rule";
      const ins = (r.instruction ?? "").trim().slice(0, 200);
      return `${topic}: ${ins}`;
    });
}

/** Deterministic stub body (A2) — used to revert persona output when the V3 output auditor rejects the draft. */
export function buildOrchestratorStubDraftBody(
  candidate: OrchestratorProposalCandidate,
  rawMessage: string,
  replyChannel: "email" | "web",
  playbookRules: PlaybookRuleContextRow[],
  audience?: OrchestratorStubDraftAudienceOptions | null,
): string {
  const excerpts = playbookExcerptsFromRules(playbookRules, 3);
  const raw = buildDraftBody(candidate, rawMessage, replyChannel, excerpts);
  if (audience?.clientVisibleForPrivateCommercialRedaction) {
    return redactPlannerPrivateCommercialMultilineText(raw);
  }
  return raw;
}

function buildDraftBody(
  candidate: OrchestratorProposalCandidate,
  rawMessage: string,
  replyChannel: "email" | "web",
  playbookExcerpts: string[],
): string {
  const lines: string[] = [
    "[Orchestrator draft — clientOrchestratorV1 QA path]",
    `Action: ${candidate.action_family} (${candidate.action_key})`,
    `Channel: ${replyChannel}`,
    "",
    `Rationale: ${candidate.rationale}`,
    "",
    "Inbound (excerpt):",
    rawMessage.trim().slice(0, 800),
  ];
  if (playbookExcerpts.length > 0) {
    lines.push("", "Policy context (excerpt):");
    for (const ex of playbookExcerpts) {
      lines.push(`— ${ex.slice(0, 240)}`);
    }
  }
  if (candidate.blockers_or_missing_facts.length > 0) {
    lines.push("", `Open notes: ${candidate.blockers_or_missing_facts.join("; ")}`);
  }
  lines.push(
    "",
    "This text is a pending-approval draft only. It must not be sent without operator approval.",
  );
  return lines.join("\n");
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
