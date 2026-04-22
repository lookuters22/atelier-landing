import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AssistantRetrievalLog } from "../../../../src/types/assistantContext.types.ts";
import type { OperatorAnaCarryForwardClientState } from "../../../../src/types/operatorAnaCarryForward.types.ts";
import type { OperatorAnaWebConversationMessage } from "../../../../src/lib/operatorAnaWidgetConversationBounds.ts";
import type { OperatorAssistantProposedAction } from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import { buildAssistantContext } from "../context/buildAssistantContext.ts";
import { completeOperatorStudioAssistantLlm, completeOperatorStudioAssistantLlmStreaming } from "./completeOperatorStudioAssistantLlm.ts";
import type { ReadOnlyLookupToolOutcome } from "./parseOperatorStudioAssistantLlmResponse.ts";
import {
  buildClientCarryForwardState,
  buildOperatorAnaCarryForwardTelemetry,
  extractCarryForwardDataFromTurn,
} from "./operatorAssistantCarryForward.ts";
import { OperatorStudioAssistantValidationError } from "./operatorStudioAssistantHttp.ts";
import { validateAndNormalizeOperatorStudioAssistantConversation } from "./validateOperatorStudioAssistantConversation.ts";

export type OperatorStudioAssistantRequestBody = {
  queryText?: string;
  focusedWeddingId?: string | null;
  focusedPersonId?: string | null;
  /** Optional bounded client-only session; validated and passed as LLM `messages[]`, not stored. */
  conversation?: unknown;
  /** Slice 6 — client round-trip carry-forward from the previous response. */
  carryForward?: unknown;
};

export type OperatorStudioAssistantResponseBody = {
  reply: string;
  /** Slice 6–11 — rule, task, memory, and/or case-exception proposals (confirm via the matching insert edge functions). */
  proposedActions?: OperatorAssistantProposedAction[];
  clientFacingForbidden: true;
  retrievalLog: AssistantRetrievalLog;
  /** Slice 6 — pointer to send on the next request (null if nothing to carry). */
  carryForward?: OperatorAnaCarryForwardClientState | null;
};

export type OperatorStudioAssistantValidatedRequest = {
  queryText: string;
  conversation: OperatorAnaWebConversationMessage[];
};

/**
 * Shared validation for JSON and non-SSE error responses. Callers may run this before starting an SSE body
 * so invalid requests never return `text/event-stream`.
 */
export function parseAndValidateOperatorStudioAssistantRequest(
  body: OperatorStudioAssistantRequestBody,
): OperatorStudioAssistantValidatedRequest {
  const queryText = String(body.queryText ?? "").trim();
  if (!queryText) {
    throw new OperatorStudioAssistantValidationError("queryText is required");
  }
  const conv = validateAndNormalizeOperatorStudioAssistantConversation(body.conversation);
  if (!conv.ok) {
    throw new OperatorStudioAssistantValidationError(conv.error);
  }
  return { queryText, conversation: conv.value };
}

/**
 * Authenticated operator assistant turn: {@link buildAssistantContext} + operator-only LLM completion.
 */
export async function handleOperatorStudioAssistantPost(
  supabase: SupabaseClient,
  photographerId: string,
  body: OperatorStudioAssistantRequestBody,
): Promise<OperatorStudioAssistantResponseBody> {
  const { queryText, conversation } = parseAndValidateOperatorStudioAssistantRequest(body);

  const ctx = await buildAssistantContext(supabase, photographerId, {
    queryText,
    focusedWeddingId: body.focusedWeddingId ?? null,
    focusedPersonId: body.focusedPersonId ?? null,
    carryForward: body.carryForward,
  });

  let reply: string;
  let proposedActions: OperatorAssistantProposedAction[] | undefined;
  let readOnlyLookupToolTrace: AssistantRetrievalLog["readOnlyLookupTools"] | undefined;
  let readOnlyLookupToolOutcomes: ReadOnlyLookupToolOutcome[] | undefined;
  try {
    const out = await completeOperatorStudioAssistantLlm(ctx, { conversation, supabase });
    reply = out.reply;
    proposedActions = out.proposedActions.length > 0 ? out.proposedActions : undefined;
    readOnlyLookupToolTrace = out.readOnlyLookupToolTrace;
    readOnlyLookupToolOutcomes = out.readOnlyLookupToolOutcomes;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      JSON.stringify({
        type: "operator_studio_assistant_llm_failed",
        photographerId,
        reason: msg,
        retrievalFingerprint: ctx.retrievalLog.queryDigest.fingerprint,
      }),
    );
    reply = [
      "[Studio assistant - retrieval succeeded, reply generation failed]",
      `Reason: ${msg}`,
      "",
      "Retrieval summary:",
      `- Memory ids: ${ctx.retrievalLog.selectedMemoryIds.join(", ") || "(none)"}`,
      `- KB rows: ${ctx.retrievalLog.globalKnowledgeRowCount}`,
      `- Scopes: ${ctx.retrievalLog.scopesQueried.join(", ")}`,
    ].join("\n");
  }

  const retrievalLog: AssistantRetrievalLog = readOnlyLookupToolTrace
    ? { ...ctx.retrievalLog, readOnlyLookupTools: readOnlyLookupToolTrace }
    : ctx.retrievalLog;

  const outArr = (readOnlyLookupToolOutcomes ?? []) as ReadOnlyLookupToolOutcome[];
  const cfTelemetry = buildOperatorAnaCarryForwardTelemetry(ctx, outArr);
  console.log(JSON.stringify(cfTelemetry));
  const extracted = extractCarryForwardDataFromTurn(
    ctx,
    outArr as Array<{ name: string; ok: boolean; content: string }>,
  );
  const carryForward = buildClientCarryForwardState(extracted, Date.now(), {
    weddingId: ctx.focusedWeddingId,
    personId: ctx.focusedPersonId,
  });

  return {
    reply,
    proposedActions,
    clientFacingForbidden: true,
    retrievalLog,
    carryForward: carryForward ?? null,
  };
}

export type OnOperatorStudioAssistantStreamToken = (delta: string) => void;

export type HandleOperatorStudioAssistantPostStreamingOptions = {
  /** When set, forwards to {@link completeOperatorStudioAssistantLlmStreaming} for OpenAI `fetch` cancellation. */
  signal?: AbortSignal;
  /** When set, skips a second `parseAndValidate` after the edge already validated (same request). */
  prevalidated?: OperatorStudioAssistantValidatedRequest;
};

/**
 * Same as {@link handleOperatorStudioAssistantPost} but streams reply text via `onToken` and does **not** use the
 * long fallback message on LLM failure — callers (SSE) must surface failures as a terminal `error` event.
 */
export async function handleOperatorStudioAssistantPostStreaming(
  supabase: SupabaseClient,
  photographerId: string,
  body: OperatorStudioAssistantRequestBody,
  onToken: OnOperatorStudioAssistantStreamToken,
  options: HandleOperatorStudioAssistantPostStreamingOptions = {},
): Promise<OperatorStudioAssistantResponseBody> {
  const { queryText, conversation } = options.prevalidated
    ? options.prevalidated
    : parseAndValidateOperatorStudioAssistantRequest(body);

  const ctx = await buildAssistantContext(supabase, photographerId, {
    queryText,
    focusedWeddingId: body.focusedWeddingId ?? null,
    focusedPersonId: body.focusedPersonId ?? null,
    carryForward: body.carryForward,
  });

  let out: Awaited<ReturnType<typeof completeOperatorStudioAssistantLlmStreaming>>;
  try {
    out = await completeOperatorStudioAssistantLlmStreaming(
      ctx,
      { conversation, supabase, signal: options.signal },
      onToken,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      JSON.stringify({
        type: "operator_studio_assistant_llm_failed",
        photographerId,
        reason: msg,
        retrievalFingerprint: ctx.retrievalLog.queryDigest.fingerprint,
      }),
    );
    throw e;
  }
  const reply = out.reply;
  const proposedActions = out.proposedActions.length > 0 ? out.proposedActions : undefined;
  const readOnlyLookupToolTrace = out.readOnlyLookupToolTrace;
  const readOnlyLookupToolOutcomes = out.readOnlyLookupToolOutcomes;

  const retrievalLog: AssistantRetrievalLog = readOnlyLookupToolTrace
    ? { ...ctx.retrievalLog, readOnlyLookupTools: readOnlyLookupToolTrace }
    : ctx.retrievalLog;

  const outArr = (readOnlyLookupToolOutcomes ?? []) as ReadOnlyLookupToolOutcome[];
  const cfTelemetry = buildOperatorAnaCarryForwardTelemetry(ctx, outArr);
  console.log(JSON.stringify(cfTelemetry));
  const extracted = extractCarryForwardDataFromTurn(ctx, outArr as Array<{ name: string; ok: boolean; content: string }>);
  const carryForward = buildClientCarryForwardState(extracted, Date.now(), {
    weddingId: ctx.focusedWeddingId,
    personId: ctx.focusedPersonId,
  });

  return {
    reply,
    proposedActions,
    clientFacingForbidden: true,
    retrievalLog,
    carryForward: carryForward ?? null,
  };
}
