/**
 * Shared execution core for `clientOrchestratorV1` — single source for the Inngest worker and QA replay.
 *
 * A1/A2/A3: proposals → verifier → draft → escalation artifact → calculator placeholder.
 * **`qaBroadcastRiskOverride`** is replay-only; production callers omit it.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildDecisionContext } from "../context/buildDecisionContext.ts";
import {
  buildWeddingCrmParityHints,
  type WeddingCrmParityHints,
} from "../context/weddingCrmParityHints.ts";
import {
  ORCHESTRATOR_CLIENT_V1_EVENT,
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
} from "../inngest.ts";
import {
  attemptOrchestratorDraft,
  type AttemptOrchestratorDraftParams,
} from "./attemptOrchestratorDraft.ts";
import { maybeRewriteOrchestratorDraftWithPersona } from "./maybeRewriteOrchestratorDraftWithPersona.ts";
import {
  buildOrchestratorEscalationArtifact,
  pickEscalationContextCandidate,
} from "./buildOrchestratorEscalationArtifact.ts";
import { applyMissingComplianceAssetOperatorProposals } from "./complianceAssetMissingCapture.ts";
import { enrichProposalsWithComplianceAssetResolution } from "./resolveComplianceAssetStorage.ts";
import { planBudgetStatementInjection } from "./budgetStatementInjection.ts";
import { deriveInquiryReplyPlan } from "./deriveInquiryReplyPlan.ts";
import { buildOrchestratorSupportingContextInjection } from "./buildOrchestratorSupportingContextInjection.ts";
import { buildV3ClientOrchestratorDecisionExplanation } from "./buildV3ClientOrchestratorDecisionExplanation.ts";
import { proposeClientOrchestratorCandidateActions } from "./proposeClientOrchestratorCandidateActions.ts";
import { recordStrategicTrustRepairEscalation } from "./recordStrategicTrustRepairEscalation.ts";
import { maybeRecordOrchestratorNoDraftableEscalation } from "./recordOrchestratorNoDraftableEscalation.ts";
import {
  fetchV3ThreadWorkflowState,
  upsertV3ThreadWorkflowFromInboundMessage,
} from "../workflow/v3ThreadWorkflowRepository.ts";
import type { V3ThreadWorkflowV1 } from "../workflow/v3ThreadWorkflowTypes.ts";
import { executeCalculatorTool } from "../tools/calculatorTool.ts";
import { executeToolEscalate } from "../tools/toolEscalate.ts";
import { resolveVerifierPolicyEvaluationActionKey } from "../tools/verifierPolicyGate.ts";
import { executeToolVerifier } from "../tools/toolVerifier.ts";
import type {
  AudienceVisibilityClass,
  AuthorizedCaseExceptionRow,
  BroadcastRiskLevel,
  BuildDecisionContextOptions,
  DecisionContext,
  EffectivePlaybookRule,
  InboundSenderAuthoritySnapshot,
  OrchestratorContextInjection,
  OrchestratorDraftAttemptResult,
  OrchestratorEscalationArtifactResult,
  OrchestratorProposalCandidate,
  PlaybookRuleContextRow,
  V3ClientOrchestratorDecisionExplanation,
} from "../../../../src/types/decisionContext.types.ts";

export type ClientOrchestratorV1ExecutionMode =
  | "auto"
  | "draft_only"
  | "ask_first"
  | "forbidden";

export type ClientOrchestratorV1Outcome = "auto" | "draft" | "ask" | "block";

export type OrchestratorHeavyContextLayers = {
  selectedMemories: DecisionContext["selectedMemories"];
  globalKnowledge: DecisionContext["globalKnowledge"];
  /** Baseline DB playbook (audit). */
  rawPlaybookRules: PlaybookRuleContextRow[];
  /** Active scoped exceptions (internal audit). */
  authorizedCaseExceptions: AuthorizedCaseExceptionRow[];
  /** Effective policy — verifier + orchestrator + persona policy excerpts use this. */
  playbookRules: EffectivePlaybookRule[];
  audience: DecisionContext["audience"];
  /** A4 — mirrors `DecisionContext` for orchestrator summary / shadow QA. */
  weddingId: DecisionContext["weddingId"];
  crmSnapshot: DecisionContext["crmSnapshot"];
  threadDraftsSummary: DecisionContext["threadDraftsSummary"];
  /** Bounded thread summary + recent bodies for Phase 4.1 non-commercial heuristics. */
  threadContextSnippet: string;
  /** Durable V3 workflow flags (`v3_thread_workflow_state`), null when no row / no thread. */
  v3ThreadWorkflow: V3ThreadWorkflowV1 | null;
  escalationState: {
    openEscalationIds: string[];
    openCount: number;
  };
  /** Distinct weddings linked to this thread (`thread_weddings`); mirrors `DecisionContext.candidateWeddingIds`. */
  candidateWeddingIds: DecisionContext["candidateWeddingIds"];
  /** Channel ingress sender identity; mirrors `DecisionContext.inboundSenderIdentity`. */
  inboundSenderIdentity: DecisionContext["inboundSenderIdentity"];
  /** Phase-1 sender authority; mirrors `DecisionContext.inboundSenderAuthority`. */
  inboundSenderAuthority: DecisionContext["inboundSenderAuthority"];
  /** Mirrors `DecisionContext.retrievalTrace` for verifier policy gate / QA. */
  retrievalTrace: DecisionContext["retrievalTrace"];
};

export type ClientOrchestratorV1CoreParams = {
  supabase: SupabaseClient;
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web";
  rawMessage: string;
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode;
  /**
   * Replay/QA only — after `buildDecisionContext`, replaces `audience.broadcastRisk` for this run.
   * Production worker must not pass this.
   */
  qaBroadcastRiskOverride?: BroadcastRiskLevel;
  /**
   * Replay/QA only — after `buildDecisionContext`, forces `audience.visibilityClass` + redaction flag.
   * Production worker must not pass this.
   */
  qaVisibilityClassOverride?: AudienceVisibilityClass;
  /** From verified ingress (`ai/orchestrator.client.v1`); optional display name for observability only. */
  inboundSenderEmail?: string | null;
  inboundSenderDisplayName?: string | null;
  /** Replay/QA only — overrides derived `inboundSenderAuthority`. Production must omit. */
  qaInboundSenderAuthorityOverride?: InboundSenderAuthoritySnapshot;
  /**
   * Replay/QA only — hydrate full `memories` rows for these ids in `buildDecisionContext`.
   * Production worker must not pass this (ingress uses header scan / retrieval).
   */
  qaSelectedMemoryIds?: string[];
  /**
   * Replay/QA only — attach full `OrchestratorHeavyContextLayers` on the result for audit reports
   * (policy diff, retrieval trace). Production must omit.
   */
  qaIncludeHeavyContextLayers?: boolean;
};

/** Intake post-bootstrap parity: draft/escalation steps are not run — no `drafts` rows or escalation artifacts. */
export const INTAKE_POST_BOOTSTRAP_PARITY_SKIP_REASON =
  "intake_post_bootstrap_parity_observation_only" as const;

export function orchestratorDraftAttemptSkippedIntakePostBootstrapParity(): OrchestratorDraftAttemptResult {
  return {
    draftCreated: false,
    draftId: null,
    chosenCandidate: null,
    skipReason: INTAKE_POST_BOOTSTRAP_PARITY_SKIP_REASON,
  };
}

export function orchestratorEscalationArtifactSkippedIntakePostBootstrapParity(): OrchestratorEscalationArtifactResult {
  return {
    escalationArtifactCreated: false,
    toolEscalateSuccess: false,
    escalationFacts: null,
    toolEscalateError: null,
    skipReason: INTAKE_POST_BOOTSTRAP_PARITY_SKIP_REASON,
    chosenCandidateForEscalation: null,
  };
}

/** V3 deterministic commercial output auditor (persona JSON + grounded validation). */
export type PersonaOutputAuditorSummary =
  | { ran: false; reason?: string }
  | { ran: true; passed: true; draftId: string }
  | {
      ran: true;
      passed: false;
      draftId: string;
      violations: string[];
      escalationId: string | null;
    };

export type ClientOrchestratorV1CoreResult = {
  schemaVersion: typeof ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION;
  photographerId: string;
  heavyContextSummary: {
    selectedMemoriesCount: number;
    globalKnowledgeCount: number;
    /** Effective merged rules (same length as raw when no synthetic rows). */
    playbookRuleCount: number;
    rawPlaybookRuleCount: number;
    authorizedCaseExceptionCount: number;
    audience: DecisionContext["audience"];
    escalationOpenCount: number;
    escalationOpenIds: string[];
    threadDraftsSummary: DecisionContext["threadDraftsSummary"];
    weddingCrmParityHints: WeddingCrmParityHints | null;
  };
  proposedActions: OrchestratorProposalCandidate[];
  proposalCount: number;
  verifierResult: Awaited<ReturnType<typeof executeToolVerifier>>;
  draftAttempt: OrchestratorDraftAttemptResult;
  escalationAttempt: OrchestratorEscalationArtifactResult;
  chosenCandidate: OrchestratorProposalCandidate | null;
  draftCreated: boolean;
  escalationArtifactCreated: boolean;
  neitherDraftNorEscalationReason: string | null;
  calculatorResult: Awaited<ReturnType<typeof executeCalculatorTool>> | null;
  orchestratorOutcome: ClientOrchestratorV1Outcome;
  /** Present when Inngest worker ran the persona rewrite step (including skipped). */
  personaOutputAuditor?: PersonaOutputAuditorSummary;
  /**
   * Bounded synthesis from `selectedMemories`, `globalKnowledge`, and `retrievalTrace` for orchestrator
   * reasoning and QA replay. Persona does not receive raw heavy layers — only rationale strings that may
   * include this suffix via `formatOrchestratorContextInjectionRationaleSuffix`.
   */
  orchestratorContextInjection: OrchestratorContextInjection;
  /**
   * Structured operator/developer explainability (bounded summaries + machine-readable fields).
   * Does not replace verifier facts or raw playbook rows elsewhere on the result.
   */
  decisionExplanation: V3ClientOrchestratorDecisionExplanation;
  /**
   * Present when `qaIncludeHeavyContextLayers` was set on the request (replay reports only).
   */
  qaHeavyContextLayers?: OrchestratorHeavyContextLayers;
};

async function fetchOpenEscalationStateForScope(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
): Promise<{ openEscalationIds: string[]; openCount: number }> {
  if (!threadId && !weddingId) {
    return { openEscalationIds: [], openCount: 0 };
  }

  let q = supabase
    .from("escalation_requests")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("status", "open");

  if (threadId && weddingId) {
    q = q.or(`thread_id.eq.${threadId},wedding_id.eq.${weddingId}`);
  } else if (threadId) {
    q = q.eq("thread_id", threadId);
  } else {
    q = q.eq("wedding_id", weddingId!);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`clientOrchestrator escalation state: ${error.message}`);
  }
  const openEscalationIds = (data ?? []).map((r) => r.id as string);
  return { openEscalationIds, openCount: openEscalationIds.length };
}

const THREAD_CONTEXT_SNIPPET_MAX = 8000;

/** Thread summary + last N message bodies for deterministic heuristics (bounded). */
function buildThreadContextSnippetForOrchestratorHeuristics(ctx: DecisionContext): string {
  const parts: string[] = [];
  if (typeof ctx.threadSummary === "string" && ctx.threadSummary.trim().length > 0) {
    parts.push(ctx.threadSummary.trim());
  }
  const recent = Array.isArray(ctx.recentMessages) ? ctx.recentMessages : [];
  const tail = recent.slice(-8);
  for (const m of tail) {
    const row = m as Record<string, unknown>;
    const b = typeof row.body === "string" ? row.body : String(row.body ?? "");
    if (b.trim().length > 0) parts.push(b.trim());
  }
  const joined = parts.join("\n\n");
  if (joined.length <= THREAD_CONTEXT_SNIPPET_MAX) return joined;
  return joined.slice(-THREAD_CONTEXT_SNIPPET_MAX);
}

function buildOrchestratorHeavyContextLayers(
  ctx: DecisionContext,
  escalation: { openEscalationIds: string[]; openCount: number },
): Omit<OrchestratorHeavyContextLayers, "v3ThreadWorkflow"> {
  return {
    selectedMemories: ctx.selectedMemories,
    globalKnowledge: ctx.globalKnowledge,
    rawPlaybookRules: ctx.rawPlaybookRules,
    authorizedCaseExceptions: ctx.authorizedCaseExceptions,
    playbookRules: ctx.playbookRules,
    audience: ctx.audience,
    weddingId: ctx.weddingId,
    crmSnapshot: ctx.crmSnapshot,
    threadDraftsSummary: ctx.threadDraftsSummary,
    threadContextSnippet: buildThreadContextSnippetForOrchestratorHeuristics(ctx),
    escalationState: escalation,
    candidateWeddingIds: ctx.candidateWeddingIds,
    inboundSenderIdentity: ctx.inboundSenderIdentity,
    inboundSenderAuthority: ctx.inboundSenderAuthority,
    retrievalTrace: ctx.retrievalTrace,
  };
}

function applyBroadcastRiskOverride(
  ctx: DecisionContext,
  override: BroadcastRiskLevel | undefined,
): DecisionContext {
  if (override === undefined) return ctx;
  return {
    ...ctx,
    audience: {
      ...ctx.audience,
      broadcastRisk: override,
    },
  };
}

/**
 * Builds `toolVerifier` input from orchestrator heavy layers (execute_v3 Step 6D).
 * Includes `policyGate` for deterministic playbook / audience / escalation / memory-metadata gates.
 */
export function buildVerifierPayloadForClientOrchestratorV1(
  heavyContextLayers: OrchestratorHeavyContextLayers,
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode,
  rawMessage: string,
  proposedActions: OrchestratorProposalCandidate[],
): unknown {
  const broadcastRisk = heavyContextLayers.audience.broadcastRisk;
  const policyEvaluationActionKey = resolveVerifierPolicyEvaluationActionKey(proposedActions);
  const base: Record<string, unknown> = {
    broadcastRisk,
    requestedExecutionMode,
    policyGate: {
      audience: {
        visibilityClass: heavyContextLayers.audience.visibilityClass,
        clientVisibleForPrivateCommercialRedaction:
          heavyContextLayers.audience.clientVisibleForPrivateCommercialRedaction,
        broadcastRisk: heavyContextLayers.audience.broadcastRisk,
        recipientCount: heavyContextLayers.audience.recipientCount,
      },
      playbookRules: heavyContextLayers.playbookRules.map((r) => ({
        id: r.id,
        action_key: r.action_key,
        decision_mode: r.decision_mode,
        topic: r.topic,
        is_active: r.is_active,
      })),
      selectedMemoriesSummary: heavyContextLayers.selectedMemories.map((m) => ({
        id: m.id,
        type: m.type,
      })),
      globalKnowledgeLoadedCount: heavyContextLayers.globalKnowledge.length,
      retrievalTrace: {
        globalKnowledgeFetch: heavyContextLayers.retrievalTrace.globalKnowledgeFetch,
        globalKnowledgeGateDetail: heavyContextLayers.retrievalTrace.globalKnowledgeGateDetail,
        selectedMemoryIdsResolved: heavyContextLayers.retrievalTrace.selectedMemoryIdsResolved,
      },
      escalationOpenCount: heavyContextLayers.escalationState.openCount,
      policyEvaluationActionKey,
    },
  };

  if (broadcastRisk === "high" && requestedExecutionMode === "auto") {
    return {
      ...base,
      escalation: {
        whatWasAsked: rawMessage.trim().slice(0, 500) || "(empty)",
        intendedAction: "Proceed with auto execution for this client message.",
        blockedByDecisionMode: "auto" as const,
        photographerQuestion:
          "High broadcast risk was detected. Approve auto execution or choose a safer mode?",
        answerStorageTarget: "undetermined" as const,
      },
    };
  }
  return base;
}

/**
 * Maps verifier result + requested mode to orchestrator outcome. Reads `facts.policyVerdict` and
 * `facts.verifierStage` (see `src/types/verifier.types.ts`) from `executeToolVerifier` when the
 * pre-generation policy gate coerces `auto` → draft/ask.
 */
export function mapClientOrchestratorV1Outcome(
  verifierPassed: boolean,
  requestedMode: ClientOrchestratorV1ExecutionMode,
  verifierFacts?: Record<string, unknown> | null,
): ClientOrchestratorV1Outcome {
  const pv = verifierFacts?.policyVerdict;
  if (typeof pv === "string") {
    if (verifierPassed && requestedMode === "auto") {
      if (pv === "require_draft_only") return "draft";
      if (pv === "require_ask" || pv === "require_operator_review") return "ask";
    }
    if (!verifierPassed && pv === "hard_block") {
      return "block";
    }
  }
  if (!verifierPassed) return "block";
  if (requestedMode === "forbidden") return "block";
  if (requestedMode === "draft_only") return "draft";
  if (requestedMode === "ask_first") return "ask";
  return "auto";
}

export function resolveOrchestratorChosenCandidate(
  draftAttempt: OrchestratorDraftAttemptResult,
  escalationAttempt: OrchestratorEscalationArtifactResult,
  proposedActions: OrchestratorProposalCandidate[],
): OrchestratorProposalCandidate | null {
  return (
    draftAttempt.chosenCandidate ??
    escalationAttempt.chosenCandidateForEscalation ??
    pickEscalationContextCandidate(proposedActions)
  );
}

export function computeNeitherDraftNorEscalationReason(
  orchestratorOutcome: ClientOrchestratorV1Outcome,
  draftAttempt: OrchestratorDraftAttemptResult,
  escalationAttempt: OrchestratorEscalationArtifactResult,
): string | null {
  if (draftAttempt.draftCreated || escalationAttempt.escalationArtifactCreated) {
    return null;
  }
  if (orchestratorOutcome === "auto") {
    return "outcome_auto_no_draft_no_escalation_artifact";
  }
  if (orchestratorOutcome === "draft") {
    return draftAttempt.skipReason ?? "draft_outcome_without_draft_or_escalation";
  }
  if (orchestratorOutcome === "block" || orchestratorOutcome === "ask") {
    return (
      escalationAttempt.skipReason ?? "block_or_ask_outcome_without_escalation_artifact"
    );
  }
  return "neither_draft_nor_escalation_unknown";
}

export async function buildDecisionContextForClientOrchestratorV1(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
  replyChannel: "email" | "web",
  rawMessage: string,
  qaBroadcastRiskOverride?: BroadcastRiskLevel,
  qaVisibilityClassOverride?: AudienceVisibilityClass,
  inboundSenderEmail?: string | null,
  inboundSenderDisplayName?: string | null,
  qaInboundSenderAuthorityOverride?: InboundSenderAuthoritySnapshot,
  qaSelectedMemoryIds?: string[],
): Promise<DecisionContext> {
  const buildOptions: BuildDecisionContextOptions | undefined = (() => {
    const o: BuildDecisionContextOptions = {};
    if (qaVisibilityClassOverride !== undefined) {
      o.qaVisibilityClassOverride = qaVisibilityClassOverride;
    }
    if (inboundSenderEmail !== undefined) {
      o.inboundSenderEmail = inboundSenderEmail;
    }
    if (inboundSenderDisplayName !== undefined) {
      o.inboundSenderDisplayName = inboundSenderDisplayName;
    }
    if (qaInboundSenderAuthorityOverride !== undefined) {
      o.qaInboundSenderAuthorityOverride = qaInboundSenderAuthorityOverride;
    }
    if (qaSelectedMemoryIds !== undefined && qaSelectedMemoryIds.length > 0) {
      o.selectedMemoryIds = qaSelectedMemoryIds;
    }
    return Object.keys(o).length > 0 ? o : undefined;
  })();

  let decisionContext = await buildDecisionContext(
    supabase,
    photographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    buildOptions,
  );
  decisionContext = applyBroadcastRiskOverride(decisionContext, qaBroadcastRiskOverride);
  return decisionContext;
}

export async function assembleHeavyContextForClientOrchestratorV1(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
  decisionContext: DecisionContext,
): Promise<OrchestratorHeavyContextLayers> {
  const escalation = await fetchOpenEscalationStateForScope(
    supabase,
    photographerId,
    weddingId,
    threadId,
  );
  const base = buildOrchestratorHeavyContextLayers(decisionContext, escalation);
  if (!threadId) {
    return { ...base, v3ThreadWorkflow: null };
  }
  const wf = await fetchV3ThreadWorkflowState(supabase, photographerId, threadId);
  return { ...base, v3ThreadWorkflow: wf };
}

export function proposeCandidateActionsForClientOrchestratorV1(
  heavyContextLayers: OrchestratorHeavyContextLayers,
  decisionContext: DecisionContext,
  weddingId: string | null,
  threadId: string | null,
  replyChannel: "email" | "web",
  rawMessage: string,
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode,
): {
  proposals: OrchestratorProposalCandidate[];
  orchestratorContextInjection: OrchestratorContextInjection;
} {
  const budgetPlan = planBudgetStatementInjection(rawMessage, heavyContextLayers.playbookRules);
  const inquiryReplyPlan = deriveInquiryReplyPlan({
    decisionContext,
    rawMessage,
    playbookRules: heavyContextLayers.playbookRules,
    budgetPlan,
  });

  const orchestratorContextInjection = buildOrchestratorSupportingContextInjection({
    selectedMemories: heavyContextLayers.selectedMemories,
    globalKnowledge: heavyContextLayers.globalKnowledge,
    retrievalTrace: heavyContextLayers.retrievalTrace,
    playbookRules: heavyContextLayers.playbookRules,
    audience: decisionContext.audience,
    inquiryReplyPlan,
    crmSnapshot: decisionContext.crmSnapshot,
    rawMessageForPackageInclusion: rawMessage,
    inboundSenderAuthority: decisionContext.inboundSenderAuthority,
    rawMessageForMultiActorAuthority: rawMessage,
  });

  const proposals = proposeClientOrchestratorCandidateActions({
    audience: heavyContextLayers.audience,
    playbookRules: heavyContextLayers.playbookRules,
    selectedMemoriesCount: heavyContextLayers.selectedMemories.length,
    globalKnowledgeCount: heavyContextLayers.globalKnowledge.length,
    escalationOpenCount: heavyContextLayers.escalationState.openCount,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    requestedExecutionMode,
    threadDraftsSummary: heavyContextLayers.threadDraftsSummary,
    weddingCrmParityHints: buildWeddingCrmParityHints(
      heavyContextLayers.weddingId,
      heavyContextLayers.crmSnapshot,
    ),
    threadContextSnippet: heavyContextLayers.threadContextSnippet,
    v3ThreadWorkflow: heavyContextLayers.v3ThreadWorkflow ?? null,
    candidateWeddingIds: heavyContextLayers.candidateWeddingIds,
    inboundSenderIdentity: heavyContextLayers.inboundSenderIdentity,
    inboundSenderAuthority: heavyContextLayers.inboundSenderAuthority,
    contextInjection: orchestratorContextInjection,
    selectedMemorySummaries: heavyContextLayers.selectedMemories.map((m) => ({
      type: m.type,
      title: m.title,
      summary: m.summary,
      full_content: m.full_content,
    })),
  });

  return { proposals, orchestratorContextInjection };
}

export async function runToolVerifierForClientOrchestratorV1(
  heavyContextLayers: OrchestratorHeavyContextLayers,
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode,
  rawMessage: string,
  photographerId: string,
  threadId: string | null,
  weddingId: string | null,
  proposedActions: OrchestratorProposalCandidate[],
): Promise<Awaited<ReturnType<typeof executeToolVerifier>>> {
  const payload = buildVerifierPayloadForClientOrchestratorV1(
    heavyContextLayers,
    requestedExecutionMode,
    rawMessage,
    proposedActions,
  );
  return executeToolVerifier(payload, photographerId, {
    thread_id: threadId ?? null,
    wedding_id: weddingId ?? null,
    source_event: ORCHESTRATOR_CLIENT_V1_EVENT,
    risk_class: heavyContextLayers.audience.broadcastRisk,
  });
}

export async function runDraftAttemptForClientOrchestratorV1(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    threadId: string | null;
    proposedActions: OrchestratorProposalCandidate[];
    verifierSuccess: boolean;
    orchestratorOutcome: ClientOrchestratorV1Outcome;
    rawMessage: string;
    replyChannel: "email" | "web";
    playbookRules: OrchestratorHeavyContextLayers["playbookRules"];
    audience?: AttemptOrchestratorDraftParams["audience"];
  },
): Promise<OrchestratorDraftAttemptResult> {
  return attemptOrchestratorDraft(supabase, {
    photographerId: params.photographerId,
    threadId: params.threadId,
    proposedActions: params.proposedActions,
    verifierSuccess: params.verifierSuccess,
    orchestratorOutcome: params.orchestratorOutcome,
    rawMessage: params.rawMessage,
    replyChannel: params.replyChannel,
    playbookRules: params.playbookRules,
    audience: params.audience,
  });
}

export async function runEscalationArtifactForClientOrchestratorV1(
  photographerId: string,
  params: {
    orchestratorOutcome: ClientOrchestratorV1Outcome;
    verifierResult: Awaited<ReturnType<typeof executeToolVerifier>>;
    requestedExecutionMode: ClientOrchestratorV1ExecutionMode;
    rawMessage: string;
    broadcastRisk: BroadcastRiskLevel;
    proposedActions: OrchestratorProposalCandidate[];
    threadId: string | null;
    weddingId: string | null;
  },
): Promise<OrchestratorEscalationArtifactResult> {
  const built = buildOrchestratorEscalationArtifact({
    orchestratorOutcome: params.orchestratorOutcome,
    verifierResult: params.verifierResult,
    requestedExecutionMode: params.requestedExecutionMode,
    rawMessage: params.rawMessage,
    broadcastRisk: params.broadcastRisk,
    proposedActions: params.proposedActions,
    threadId: params.threadId,
    weddingId: params.weddingId,
  });

  if (!built.ok) {
    return {
      escalationArtifactCreated: false,
      toolEscalateSuccess: false,
      escalationFacts: null,
      toolEscalateError: null,
      skipReason: built.skipReason,
      chosenCandidateForEscalation: null,
    } satisfies OrchestratorEscalationArtifactResult;
  }

  const result = await executeToolEscalate(built.input, photographerId);

  return {
    escalationArtifactCreated: result.success === true,
    toolEscalateSuccess: result.success,
    escalationFacts: result.success ? (result.facts as Record<string, unknown>) : null,
    toolEscalateError: result.success ? null : result.error,
    skipReason: result.success ? null : "tool_escalate_validation_failed",
    chosenCandidateForEscalation: built.chosenCandidateForEscalation,
  } satisfies OrchestratorEscalationArtifactResult;
}

export async function runCalculatorPlaceholderForClientOrchestratorV1(
  verifierSuccess: boolean,
  photographerId: string,
): Promise<Awaited<ReturnType<typeof executeCalculatorTool>> | null> {
  if (!verifierSuccess) return null;
  return executeCalculatorTool({ operation: "sum", values: [1, 1] }, photographerId);
}

export function buildClientOrchestratorV1CoreResultPayload(
  photographerId: string,
  heavyContextLayers: OrchestratorHeavyContextLayers,
  proposedActions: OrchestratorProposalCandidate[],
  verifierResult: Awaited<ReturnType<typeof executeToolVerifier>>,
  draftAttempt: OrchestratorDraftAttemptResult,
  escalationAttempt: OrchestratorEscalationArtifactResult,
  calculatorResult: Awaited<ReturnType<typeof executeCalculatorTool>> | null,
  orchestratorOutcome: ClientOrchestratorV1Outcome,
  orchestratorContextInjection: OrchestratorContextInjection,
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode,
  personaOutputAuditor?: PersonaOutputAuditorSummary,
): ClientOrchestratorV1CoreResult {
  const chosenCandidate = resolveOrchestratorChosenCandidate(
    draftAttempt,
    escalationAttempt,
    proposedActions,
  );
  const neitherDraftNorEscalationReason = computeNeitherDraftNorEscalationReason(
    orchestratorOutcome,
    draftAttempt,
    escalationAttempt,
  );

  const decisionExplanation = buildV3ClientOrchestratorDecisionExplanation({
    heavyContextLayers,
    proposedActions,
    verifierResult,
    draftAttempt,
    escalationAttempt,
    orchestratorOutcome,
    orchestratorContextInjection,
    requestedExecutionMode,
    personaOutputAuditor,
  });

  return {
    schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
    photographerId,
    heavyContextSummary: {
      selectedMemoriesCount: heavyContextLayers.selectedMemories.length,
      globalKnowledgeCount: heavyContextLayers.globalKnowledge.length,
      playbookRuleCount: heavyContextLayers.playbookRules.length,
      rawPlaybookRuleCount: heavyContextLayers.rawPlaybookRules.length,
      authorizedCaseExceptionCount: heavyContextLayers.authorizedCaseExceptions.length,
      audience: heavyContextLayers.audience,
      escalationOpenCount: heavyContextLayers.escalationState.openCount,
      escalationOpenIds: heavyContextLayers.escalationState.openEscalationIds,
      threadDraftsSummary: heavyContextLayers.threadDraftsSummary,
      weddingCrmParityHints: buildWeddingCrmParityHints(
        heavyContextLayers.weddingId,
        heavyContextLayers.crmSnapshot,
      ),
    },
    proposedActions,
    proposalCount: proposedActions.length,
    verifierResult,
    draftAttempt,
    escalationAttempt,
    chosenCandidate,
    draftCreated: draftAttempt.draftCreated,
    escalationArtifactCreated: escalationAttempt.escalationArtifactCreated,
    neitherDraftNorEscalationReason,
    calculatorResult,
    orchestratorOutcome,
    orchestratorContextInjection,
    decisionExplanation,
    ...(personaOutputAuditor !== undefined ? { personaOutputAuditor } : {}),
  };
}

/**
 * Full pipeline — use from QA replay, or mirror step-by-step via the phase exports in the worker.
 */
export async function executeClientOrchestratorV1Core(
  params: ClientOrchestratorV1CoreParams,
): Promise<ClientOrchestratorV1CoreResult> {
  const {
    supabase,
    photographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    requestedExecutionMode,
    qaBroadcastRiskOverride,
    qaVisibilityClassOverride,
    inboundSenderEmail,
    inboundSenderDisplayName,
    qaInboundSenderAuthorityOverride,
    qaSelectedMemoryIds,
  } = params;

  const decisionContext = await buildDecisionContextForClientOrchestratorV1(
    supabase,
    photographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    qaBroadcastRiskOverride,
    qaVisibilityClassOverride,
    inboundSenderEmail,
    inboundSenderDisplayName,
    qaInboundSenderAuthorityOverride,
    qaSelectedMemoryIds,
  );

  await upsertV3ThreadWorkflowFromInboundMessage(supabase, {
    photographerId,
    threadId,
    weddingId,
    rawMessage,
  });

  const heavyContextLayers = await assembleHeavyContextForClientOrchestratorV1(
    supabase,
    photographerId,
    weddingId,
    threadId,
    decisionContext,
  );

  const { proposals: proposedActionsInitial, orchestratorContextInjection } =
    proposeCandidateActionsForClientOrchestratorV1(
      heavyContextLayers,
      decisionContext,
      weddingId,
      threadId,
      replyChannel,
      rawMessage,
      requestedExecutionMode,
    );

  let proposedActions = proposedActionsInitial;

  proposedActions = await enrichProposalsWithComplianceAssetResolution(
    supabase,
    photographerId,
    proposedActions,
  );

  proposedActions = applyMissingComplianceAssetOperatorProposals(proposedActions);

  await recordStrategicTrustRepairEscalation(supabase, {
    photographerId,
    threadId,
    weddingId,
    rawMessage,
    threadContextSnippet: heavyContextLayers.threadContextSnippet,
  });

  const verifierResult = await runToolVerifierForClientOrchestratorV1(
    heavyContextLayers,
    requestedExecutionMode,
    rawMessage,
    photographerId,
    threadId,
    weddingId,
    proposedActions,
  );

  const orchestratorOutcome = mapClientOrchestratorV1Outcome(
    verifierResult.success,
    requestedExecutionMode,
    verifierResult.facts,
  );

  const draftAttempt = await runDraftAttemptForClientOrchestratorV1(supabase, {
    photographerId,
    threadId,
    proposedActions,
    verifierSuccess: verifierResult.success === true,
    orchestratorOutcome,
    rawMessage,
    replyChannel,
    playbookRules: heavyContextLayers.playbookRules,
    audience: decisionContext.audience,
  });

  /** Mirrors `clientOrchestratorV1` Inngest worker: persona rewrite + auditors before escalation artifact. */
  let personaOutputAuditor: PersonaOutputAuditorSummary | undefined;
  if (!draftAttempt.draftCreated || !draftAttempt.draftId) {
    personaOutputAuditor = { ran: false, reason: "no_draft" };
  } else {
    const personaRewriteResult = await maybeRewriteOrchestratorDraftWithPersona(supabase, {
      decisionContext,
      draftAttempt,
      rawMessage,
      playbookRules: heavyContextLayers.playbookRules,
      photographerId,
      replyChannel,
      threadId,
    });
    if (!personaRewriteResult.applied) {
      personaOutputAuditor = { ran: false, reason: personaRewriteResult.reason };
    } else if (personaRewriteResult.auditPassed) {
      personaOutputAuditor = {
        ran: true,
        passed: true,
        draftId: personaRewriteResult.draftId,
      };
    } else {
      personaOutputAuditor = {
        ran: true,
        passed: false,
        draftId: personaRewriteResult.draftId,
        violations: personaRewriteResult.violations,
        escalationId: personaRewriteResult.escalationId ?? null,
      };
    }
  }

  const escalationAttempt = await runEscalationArtifactForClientOrchestratorV1(photographerId, {
    orchestratorOutcome,
    verifierResult,
    requestedExecutionMode,
    rawMessage,
    broadcastRisk: heavyContextLayers.audience.broadcastRisk,
    proposedActions,
    threadId,
    weddingId,
  });

  await maybeRecordOrchestratorNoDraftableEscalation(supabase, {
    photographerId,
    threadId,
    weddingId,
    verifierSuccess: verifierResult.success === true,
    orchestratorOutcome,
    draftSkipReason: draftAttempt.skipReason ?? null,
    draftCreated: draftAttempt.draftCreated,
    proposedActions,
    rawMessage,
  });

  const calculatorResult = await runCalculatorPlaceholderForClientOrchestratorV1(
    verifierResult.success === true,
    photographerId,
  );

  const payload = buildClientOrchestratorV1CoreResultPayload(
    photographerId,
    heavyContextLayers,
    proposedActions,
    verifierResult,
    draftAttempt,
    escalationAttempt,
    calculatorResult,
    orchestratorOutcome,
    orchestratorContextInjection,
    requestedExecutionMode,
    personaOutputAuditor,
  );

  if (params.qaIncludeHeavyContextLayers === true) {
    return { ...payload, qaHeavyContextLayers: heavyContextLayers };
  }

  return payload;
}
