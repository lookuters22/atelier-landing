/**
 * Pure helpers for {@link SupportAssistantWidget} contract enforcement (fail closed)
 * and structured display (footer / dev retrieval).
 */

export type OperatorStudioAssistantInvokePayload = {
  reply?: unknown;
  clientFacingForbidden?: unknown;
  retrievalLog?: {
    selectedMemoryIds?: string[];
    scopesQueried?: string[];
  };
};

export const OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE =
  "We could not verify this reply as operator-only, so it was not shown. Try again.";

export type OperatorStudioAssistantAssistantDisplay =
  | { kind: "contract_violation"; mainText: string }
  | {
      kind: "answer";
      mainText: string;
      operatorRibbon: string;
      devRetrieval: { scopes: string[]; memoryIds: string[] } | null;
    };

const OPERATOR_RIBBON_COPY =
  "Internal assistant for your workflow only. Do not paste into client-facing messages.";

function normalizedReply(reply: unknown): string {
  return typeof reply === "string" && reply.trim().length > 0
    ? reply.trim()
    : "No reply returned. Please try again.";
}

/**
 * Structured assistant turn for the widget. Fails closed when `clientFacingForbidden !== true`.
 */
export function buildOperatorStudioAssistantAssistantDisplay(
  payload: OperatorStudioAssistantInvokePayload | null | undefined,
  options: { devMode: boolean },
): OperatorStudioAssistantAssistantDisplay {
  if (payload?.clientFacingForbidden !== true) {
    return { kind: "contract_violation", mainText: OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE };
  }

  const reply = normalizedReply(payload.reply);

  const devRetrieval =
    options.devMode && payload.retrievalLog
      ? {
          scopes: [...(payload.retrievalLog.scopesQueried ?? [])],
          memoryIds: [...(payload.retrievalLog.selectedMemoryIds ?? [])],
        }
      : null;

  return {
    kind: "answer",
    mainText: reply,
    operatorRibbon: OPERATOR_RIBBON_COPY,
    devRetrieval,
  };
}
