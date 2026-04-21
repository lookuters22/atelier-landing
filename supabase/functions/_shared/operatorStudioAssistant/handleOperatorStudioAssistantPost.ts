import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AssistantRetrievalLog } from "../../../../src/types/assistantContext.types.ts";
import { buildAssistantContext } from "../context/buildAssistantContext.ts";
import { completeOperatorStudioAssistantLlm } from "./completeOperatorStudioAssistantLlm.ts";
import { OperatorStudioAssistantValidationError } from "./operatorStudioAssistantHttp.ts";

export type OperatorStudioAssistantRequestBody = {
  queryText?: string;
  focusedWeddingId?: string | null;
  focusedPersonId?: string | null;
};

export type OperatorStudioAssistantResponseBody = {
  reply: string;
  clientFacingForbidden: true;
  retrievalLog: AssistantRetrievalLog;
};

/**
 * Authenticated operator assistant turn: {@link buildAssistantContext} + operator-only LLM completion.
 */
export async function handleOperatorStudioAssistantPost(
  supabase: SupabaseClient,
  photographerId: string,
  body: OperatorStudioAssistantRequestBody,
): Promise<OperatorStudioAssistantResponseBody> {
  const queryText = String(body.queryText ?? "").trim();
  if (!queryText) {
    throw new OperatorStudioAssistantValidationError("queryText is required");
  }

  const ctx = await buildAssistantContext(supabase, photographerId, {
    queryText,
    focusedWeddingId: body.focusedWeddingId ?? null,
    focusedPersonId: body.focusedPersonId ?? null,
  });

  let reply: string;
  try {
    reply = await completeOperatorStudioAssistantLlm(ctx);
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

  return {
    reply,
    clientFacingForbidden: true,
    retrievalLog: ctx.retrievalLog,
  };
}
