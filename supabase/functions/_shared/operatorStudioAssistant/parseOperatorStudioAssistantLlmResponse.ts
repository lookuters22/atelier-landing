/**
 * OpenAI `json_object` output → user-visible reply + validated proposals (Slice 6–11).
 */
import type { OperatorAssistantProposedAction } from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import { tryParseLlmProposedPlaybookRuleCandidate } from "./validatePlaybookRuleCandidatePayload.ts";
import { tryParseLlmProposedMemoryNote } from "./validateOperatorAssistantMemoryPayload.ts";
import { tryParseLlmProposedTask } from "./validateOperatorAssistantTaskPayload.ts";
import { tryParseLlmProposedAuthorizedCaseException } from "./validateOperatorAssistantAuthorizedCaseExceptionPayload.ts";

export type ReadOnlyLookupToolOutcome = {
  name: string;
  ok: boolean;
  content: string;
  detail?: string;
  /** Slice 7 — model-provided JSON args for heuristic "used pointer" checks. */
  functionArguments?: string;
};

export type OperatorStudioAssistantLlmResult = {
  reply: string;
  proposedActions: OperatorAssistantProposedAction[];
  /** Present when bounded read-only lookup tools ran during this turn (operator widget). */
  readOnlyLookupToolTrace?: Array<{ name: string; ok: boolean; detail?: string }>;
  /** Slice 6 — tool JSON bodies for carry-forward extraction (same order as the model’s tool call list). */
  readOnlyLookupToolOutcomes?: ReadOnlyLookupToolOutcome[];
};

function tryParseJsonObject(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    // tolerate rare ```json fences
    const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (m) {
      try {
        return JSON.parse(m[1]!.trim()) as unknown;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Same user-visible `reply` string that {@link parseOperatorStudioAssistantLlmResponse} would surface,
 * or `null` when there is no non-empty model reply to stream (e.g. missing/empty `reply` in JSON).
 * Used to emit a last-resort `token` when the stream extractor failed to output visible deltas.
 */
export function getVisibleReplyForStreamFallback(rawContent: string): string | null {
  const parsed = tryParseJsonObject(rawContent);
  if (parsed == null || typeof parsed !== "object") {
    const r = rawContent.trim();
    return r.length > 0 ? r : null;
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.reply === "string" && o.reply.trim().length > 0) {
    return o.reply.trim();
  }
  return null;
}

/**
 * When the model returns non-JSON, keep full text as `reply` and no proposals.
 */
export function parseOperatorStudioAssistantLlmResponse(rawContent: string): OperatorStudioAssistantLlmResult {
  const parsed = tryParseJsonObject(rawContent);
  if (parsed == null || typeof parsed !== "object") {
    return { reply: rawContent.trim() || "No reply returned.", proposedActions: [] };
  }
  const o = parsed as Record<string, unknown>;
  const reply = typeof o.reply === "string" ? o.reply.trim() : "";
  const actions: OperatorAssistantProposedAction[] = [];
  const arr = o.proposedActions;
  if (Array.isArray(arr)) {
    for (const item of arr) {
      const rule = tryParseLlmProposedPlaybookRuleCandidate(item);
      if (rule.ok) {
        actions.push(rule.value);
        continue;
      }
      const task = tryParseLlmProposedTask(item);
      if (task.ok) {
        actions.push(task.value);
        continue;
      }
      const mem = tryParseLlmProposedMemoryNote(item);
      if (mem.ok) {
        actions.push(mem.value);
        continue;
      }
      const exc = tryParseLlmProposedAuthorizedCaseException(item);
      if (exc.ok) {
        actions.push(exc.value);
        continue;
      }
      console.warn(
        JSON.stringify({
          type: "operator_studio_assistant_dropped_proposal",
          reason: `${rule.reason}; ${task.reason}; ${mem.reason}; ${exc.reason}`,
        }),
      );
    }
  }
  return {
    reply: reply || "No reply text.",
    proposedActions: actions,
  };
}
