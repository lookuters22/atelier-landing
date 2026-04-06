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
import { attemptOrchestratorDraft } from "./attemptOrchestratorDraft.ts";
import {
  buildOrchestratorEscalationArtifact,
  pickEscalationContextCandidate,
} from "./buildOrchestratorEscalationArtifact.ts";
import { proposeClientOrchestratorCandidateActions } from "./proposeClientOrchestratorCandidateActions.ts";
import { executeCalculatorTool } from "../tools/calculatorTool.ts";
import { executeToolEscalate } from "../tools/toolEscalate.ts";
import { executeToolVerifier } from "../tools/toolVerifier.ts";
import type {
  BroadcastRiskLevel,
  DecisionContext,
  OrchestratorDraftAttemptResult,
  OrchestratorEscalationArtifactResult,
  OrchestratorProposalCandidate,
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
  playbookRules: DecisionContext["playbookRules"];
  audience: DecisionContext["audience"];
  /** A4 — mirrors `DecisionContext` for orchestrator summary / shadow QA. */
  weddingId: DecisionContext["weddingId"];
  crmSnapshot: DecisionContext["crmSnapshot"];
  threadDraftsSummary: DecisionContext["threadDraftsSummary"];
  escalationState: {
    openEscalationIds: string[];
    openCount: number;
  };
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
    playbookRuleCount: number;
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

function buildOrchestratorHeavyContextLayers(
  ctx: DecisionContext,
  escalation: { openEscalationIds: string[]; openCount: number },
): OrchestratorHeavyContextLayers {
  return {
    selectedMemories: ctx.selectedMemories,
    globalKnowledge: ctx.globalKnowledge,
    playbookRules: ctx.playbookRules,
    audience: ctx.audience,
    weddingId: ctx.weddingId,
    crmSnapshot: ctx.crmSnapshot,
    threadDraftsSummary: ctx.threadDraftsSummary,
    escalationState: escalation,
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

/** Satisfies `ToolVerifierInputSchema` when high broadcast risk blocks `auto` (Step 6D.1 escalation). */
export function buildVerifierPayloadForClientOrchestratorV1(
  broadcastRisk: BroadcastRiskLevel,
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode,
  rawMessage: string,
): unknown {
  const base = { broadcastRisk, requestedExecutionMode };
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

export function mapClientOrchestratorV1Outcome(
  verifierPassed: boolean,
  requestedMode: ClientOrchestratorV1ExecutionMode,
): ClientOrchestratorV1Outcome {
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
): Promise<DecisionContext> {
  let decisionContext = await buildDecisionContext(
    supabase,
    photographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
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
  return buildOrchestratorHeavyContextLayers(decisionContext, escalation);
}

export function proposeCandidateActionsForClientOrchestratorV1(
  heavyContextLayers: OrchestratorHeavyContextLayers,
  weddingId: string | null,
  threadId: string | null,
  replyChannel: "email" | "web",
  rawMessage: string,
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode,
): OrchestratorProposalCandidate[] {
  return proposeClientOrchestratorCandidateActions({
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
  });
}

export async function runToolVerifierForClientOrchestratorV1(
  heavyContextLayers: OrchestratorHeavyContextLayers,
  requestedExecutionMode: ClientOrchestratorV1ExecutionMode,
  rawMessage: string,
  photographerId: string,
  threadId: string | null,
  weddingId: string | null,
): Promise<Awaited<ReturnType<typeof executeToolVerifier>>> {
  const payload = buildVerifierPayloadForClientOrchestratorV1(
    heavyContextLayers.audience.broadcastRisk,
    requestedExecutionMode,
    rawMessage,
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

  return {
    schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
    photographerId,
    heavyContextSummary: {
      selectedMemoriesCount: heavyContextLayers.selectedMemories.length,
      globalKnowledgeCount: heavyContextLayers.globalKnowledge.length,
      playbookRuleCount: heavyContextLayers.playbookRules.length,
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
  } = params;

  const decisionContext = await buildDecisionContextForClientOrchestratorV1(
    supabase,
    photographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    qaBroadcastRiskOverride,
  );

  const heavyContextLayers = await assembleHeavyContextForClientOrchestratorV1(
    supabase,
    photographerId,
    weddingId,
    threadId,
    decisionContext,
  );

  const proposedActions = proposeCandidateActionsForClientOrchestratorV1(
    heavyContextLayers,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    requestedExecutionMode,
  );

  const verifierResult = await runToolVerifierForClientOrchestratorV1(
    heavyContextLayers,
    requestedExecutionMode,
    rawMessage,
    photographerId,
    threadId,
    weddingId,
  );

  const orchestratorOutcome = mapClientOrchestratorV1Outcome(
    verifierResult.success,
    requestedExecutionMode,
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
  });

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

  const calculatorResult = await runCalculatorPlaceholderForClientOrchestratorV1(
    verifierResult.success === true,
    photographerId,
  );

  return buildClientOrchestratorV1CoreResultPayload(
    photographerId,
    heavyContextLayers,
    proposedActions,
    verifierResult,
    draftAttempt,
    escalationAttempt,
    calculatorResult,
    orchestratorOutcome,
    undefined,
  );
}
