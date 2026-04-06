/**
 * Phase 2 Slice A3 — build a Step 6D.1-shaped `ToolEscalateInput` for QA/replay when the client
 * orchestrator outcome is `block` or `ask`. Validation-only via `executeToolEscalate` (no DB writes).
 */
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import type {
  BroadcastRiskLevel,
  OrchestratorProposalCandidate,
} from "../../../../src/types/decisionContext.types.ts";
import {
  EscalationReadyShapeSchema,
  type DecisionJustification,
  type ToolEscalateInput,
} from "../tools/schemas.ts";

type ExecutionMode = "auto" | "draft_only" | "ask_first" | "forbidden";

type ClientOrchestratorOutcome = "auto" | "draft" | "ask" | "block";

const ACTION_BLOCK_VERIFIER = "orchestrator.client.v1.block.broadcast_risk.v1" as const;
const ACTION_BLOCK_FORBIDDEN = "orchestrator.client.v1.block.forbidden.v1" as const;
const ACTION_ASK_FIRST = "orchestrator.client.v1.ask_first.v1" as const;

function mapBroadcastToRiskClass(
  broadcastRisk: BroadcastRiskLevel,
): DecisionJustification["risk_class"] {
  if (broadcastRisk === "high") return "high";
  if (broadcastRisk === "low") return "low";
  if (broadcastRisk === "medium") return "medium";
  return "medium";
}

function evidenceRefs(threadId: string | null, weddingId: string | null): string[] {
  const refs = ["orchestrator:client:v1"];
  if (threadId) refs.push(`thread:${threadId}`);
  else refs.push("thread:none");
  if (weddingId) refs.push(`wedding:${weddingId}`);
  return refs.slice(0, 32);
}

/** Same heuristic as draft selection — grounds escalation in a concrete proposal when possible. */
export function pickEscalationContextCandidate(
  proposedActions: OrchestratorProposalCandidate[],
): OrchestratorProposalCandidate | null {
  const send = proposedActions.find(
    (p) => p.action_family === "send_message" && p.likely_outcome !== "block",
  );
  if (send) return send;
  return proposedActions[0] ?? null;
}

function trimAsk(s: string, max: number): string {
  const t = s.trim();
  if (t.length === 0) return "(empty)";
  return t.slice(0, max);
}

export type BuildOrchestratorEscalationArtifactParams = {
  orchestratorOutcome: ClientOrchestratorOutcome;
  verifierResult: AgentResult<Record<string, unknown>>;
  requestedExecutionMode: ExecutionMode;
  rawMessage: string;
  broadcastRisk: BroadcastRiskLevel;
  proposedActions: OrchestratorProposalCandidate[];
  threadId: string | null;
  weddingId: string | null;
};

export type BuildOrchestratorEscalationArtifactResult =
  | {
      ok: true;
      input: ToolEscalateInput;
      chosenCandidateForEscalation: OrchestratorProposalCandidate | null;
    }
  | { ok: false; skipReason: string };

/**
 * Returns a `ToolEscalateInput` only when the outcome is `block` or `ask` and we can ground
 * the escalation in verifier facts or a clear policy explanation (conservative otherwise).
 */
export function buildOrchestratorEscalationArtifact(
  params: BuildOrchestratorEscalationArtifactParams,
): BuildOrchestratorEscalationArtifactResult {
  const {
    orchestratorOutcome,
    verifierResult,
    requestedExecutionMode,
    rawMessage,
    broadcastRisk,
    proposedActions,
    threadId,
    weddingId,
  } = params;

  if (orchestratorOutcome !== "block" && orchestratorOutcome !== "ask") {
    return { ok: false, skipReason: "outcome_not_block_or_ask" };
  }

  const chosenCandidateForEscalation = pickEscalationContextCandidate(proposedActions);
  const refs = evidenceRefs(threadId, weddingId);
  const riskClass = mapBroadcastToRiskClass(broadcastRisk);

  if (orchestratorOutcome === "ask") {
    if (requestedExecutionMode !== "ask_first") {
      return { ok: false, skipReason: "ask_outcome_without_ask_first_mode" };
    }
    if (!verifierResult.success) {
      return { ok: false, skipReason: "verifier_failed_unexpected_for_ask_outcome" };
    }

    const intended =
      chosenCandidateForEscalation?.action_family === "send_message"
        ? `Send an approved client-facing reply (${chosenCandidateForEscalation.action_key}).`
        : "Complete the proposed client-facing action after operator approval.";

    const input: ToolEscalateInput = {
      actionKey: ACTION_ASK_FIRST,
      escalation: {
        whatWasAsked: trimAsk(rawMessage, 500),
        intendedAction: intended,
        blockedByDecisionMode: "ask_first",
        photographerQuestion:
          "Review the orchestrator proposal and approve (or edit via draft) before the client receives a reply.",
        defaultRecommendation:
          "Approve the proposed send_message draft or switch execution mode if policy should change.",
        answerStorageTarget: "escalation_requests",
      },
      justification: {
        why_blocked:
          "Execution mode is ask_first: client-facing sends require explicit operator approval before delivery.",
        risk_class: riskClass,
        evidence_refs: refs,
        recommended_next_step: "Review pending approval draft or policy, then approve or revise.",
      },
    };
    return { ok: true, input, chosenCandidateForEscalation };
  }

  // orchestratorOutcome === "block"
  if (!verifierResult.success) {
    if (verifierResult.error !== "broadcast_risk_high_blocks_auto_execution") {
      return {
        ok: false,
        skipReason: "verifier_failure_without_escalation_context",
      };
    }
    const rawEsc = verifierResult.facts?.escalation;
    const parsedEsc = EscalationReadyShapeSchema.safeParse(rawEsc);
    if (!parsedEsc.success) {
      return {
        ok: false,
        skipReason: "verifier_block_missing_valid_escalation_shape",
      };
    }

    const input: ToolEscalateInput = {
      actionKey: ACTION_BLOCK_VERIFIER,
      escalation: parsedEsc.data,
      justification: {
        why_blocked:
          "Broadcast risk is high for this message; automatic execution is blocked until an operator approves or changes mode.",
        risk_class: riskClass,
        evidence_refs: refs,
        recommended_next_step: "Approve auto execution, switch to draft_only, or adjust policy.",
      },
    };
    return { ok: true, input, chosenCandidateForEscalation };
  }

  // Verifier passed but policy still blocks (forbidden)
  if (requestedExecutionMode === "forbidden") {
    const input: ToolEscalateInput = {
      actionKey: ACTION_BLOCK_FORBIDDEN,
      escalation: {
        whatWasAsked: trimAsk(rawMessage, 500),
        intendedAction:
          chosenCandidateForEscalation != null
            ? `Proceed with proposed action (${chosenCandidateForEscalation.action_family}: ${chosenCandidateForEscalation.action_key}).`
            : "Apply orchestrator-proposed client actions for this thread.",
        blockedByDecisionMode: "forbidden",
        photographerQuestion:
          "Tenant policy forbids executing this class of action for this message. Confirm override, change mode, or cancel.",
        defaultRecommendation: "Review playbook rules and execution mode before proceeding.",
        answerStorageTarget: "escalation_requests",
      },
      justification: {
        why_blocked:
          "Requested execution mode is forbidden under current tenant policy for this message context.",
        risk_class: riskClass,
        evidence_refs: refs,
        recommended_next_step: "Update playbook or choose a permitted execution mode.",
      },
    };
    return { ok: true, input, chosenCandidateForEscalation };
  }

  return {
    ok: false,
    skipReason: "block_outcome_without_forbidden_or_verifier_escalation_context",
  };
}
