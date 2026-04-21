import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AssistantContext,
  AssistantRetrievalLog,
  BuildAssistantContextInput,
} from "../../../../src/types/assistantContext.types.ts";
import { assertResolvedTenantPhotographerId } from "../../../../src/types/decisionContext.types.ts";
import { deriveEffectivePlaybook } from "../policy/deriveEffectivePlaybook.ts";
import { fetchActivePlaybookRulesForDecisionContext } from "./fetchActivePlaybookRulesForDecisionContext.ts";
import { fetchAuthorizedCaseExceptionsForDecisionContext } from "./fetchAuthorizedCaseExceptionsForDecisionContext.ts";
import { fetchAssistantCrmDigest } from "./fetchAssistantCrmDigest.ts";
import {
  fetchRelevantGlobalKnowledgeForDecisionContext,
  MAX_GLOBAL_KNOWLEDGE_ROWS_ASSISTANT,
} from "./fetchRelevantGlobalKnowledgeForDecisionContext.ts";
import { fetchAssistantMemoryHeaders } from "../memory/fetchAssistantMemoryHeaders.ts";
import { fetchSelectedMemoriesFull } from "../memory/fetchSelectedMemoriesFull.ts";
import { selectAssistantMemoryIdsDeterministic } from "../memory/selectAssistantMemoryIdsDeterministic.ts";

function normalizeOptionalUuid(id: string | null | undefined): string | null {
  if (id == null) return null;
  const t = String(id).trim();
  return t.length > 0 ? t : null;
}

/** Short deterministic fingerprint for logs (not for security). */
function queryTextFingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function resolveEffectiveFocusWeddingId(
  supabase: SupabaseClient,
  photographerId: string,
  requested: string | null,
): Promise<string | null> {
  if (!requested) return null;
  const { data, error } = await supabase
    .from("weddings")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("id", requested)
    .maybeSingle();
  if (error) {
    throw new Error(`buildAssistantContext: focus wedding verify failed: ${error.message}`);
  }
  return data?.id != null ? String(data.id) : null;
}

async function resolveEffectiveFocusPersonId(
  supabase: SupabaseClient,
  photographerId: string,
  requested: string | null,
): Promise<string | null> {
  if (!requested) return null;
  const { data, error } = await supabase
    .from("people")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("id", requested)
    .maybeSingle();
  if (error) {
    throw new Error(`buildAssistantContext: focus person verify failed: ${error.message}`);
  }
  return data?.id != null ? String(data.id) : null;
}

/**
 * Photographer-facing assistant retrieval (V3 memory plan Mode B). **Not** for reply-in-thread.
 *
 * - Default memory scope: studio only (plus explicit `focusedWeddingId` / `focusedPersonId` expansion).
 * - Does not use `buildDecisionContext` or reply-mode memory headers.
 * - Output is marked `clientFacingForbidden: true` — do not pass into client-facing writers.
 */
export async function buildAssistantContext(
  supabase: SupabaseClient,
  photographerId: string,
  input: BuildAssistantContextInput,
): Promise<AssistantContext> {
  const tenantPhotographerId = assertResolvedTenantPhotographerId(photographerId);
  const queryText = String(input.queryText ?? "");

  const weddingIdRequested = normalizeOptionalUuid(input.focusedWeddingId ?? null);
  const personIdRequested = normalizeOptionalUuid(input.focusedPersonId ?? null);

  const [weddingIdEffective, personIdEffective] = await Promise.all([
    resolveEffectiveFocusWeddingId(supabase, tenantPhotographerId, weddingIdRequested),
    resolveEffectiveFocusPersonId(supabase, tenantPhotographerId, personIdRequested),
  ]);

  const scopesQueried: AssistantRetrievalLog["scopesQueried"] = [
    "playbook",
    "crm_digest",
    "studio_memory",
    "knowledge_base",
  ];
  if (weddingIdEffective) scopesQueried.push("project_memory");
  if (personIdEffective) scopesQueried.push("person_memory");

  const [
    rawPlaybookRules,
    authorizedCaseExceptions,
    crmDigest,
    memoryHeaders,
    globalKnowledge,
  ] = await Promise.all([
    fetchActivePlaybookRulesForDecisionContext(supabase, tenantPhotographerId),
    fetchAuthorizedCaseExceptionsForDecisionContext(
      supabase,
      tenantPhotographerId,
      weddingIdEffective,
      null,
    ),
    fetchAssistantCrmDigest(supabase, tenantPhotographerId),
    fetchAssistantMemoryHeaders(supabase, tenantPhotographerId, weddingIdEffective, personIdEffective),
    fetchRelevantGlobalKnowledgeForDecisionContext(
      supabase,
      {
        photographerId: tenantPhotographerId,
        rawMessage: queryText,
        threadSummary: null,
        replyChannel: "web",
      },
      { maxRows: MAX_GLOBAL_KNOWLEDGE_ROWS_ASSISTANT },
    ),
  ]);

  const playbookRules = deriveEffectivePlaybook(rawPlaybookRules, authorizedCaseExceptions);

  const memoryIds = selectAssistantMemoryIdsDeterministic({
    queryText,
    memoryHeaders,
    focusedWeddingId: weddingIdEffective,
    focusedPersonId: personIdEffective,
  });

  const selectedMemories =
    memoryIds.length > 0
      ? await fetchSelectedMemoriesFull(supabase, tenantPhotographerId, memoryIds)
      : [];

  const retrievalLog: AssistantRetrievalLog = {
    mode: "assistant_query",
    queryDigest: {
      charLength: queryText.length,
      fingerprint: queryTextFingerprint(queryText),
    },
    scopesQueried,
    focus: {
      weddingIdRequested,
      weddingIdEffective,
      personIdRequested,
      personIdEffective,
    },
    queryTextScopeExpansion: "none",
    memoryHeaderCount: memoryHeaders.length,
    selectedMemoryIds: memoryIds,
    globalKnowledgeRowCount: globalKnowledge.length,
  };

  console.log(
    JSON.stringify({
      type: "assistant_context_retrieval",
      photographerId: tenantPhotographerId,
      ...retrievalLog,
    }),
  );

  const headerOut = memoryHeaders.map((h) => ({
    id: h.id,
    wedding_id: h.wedding_id,
    person_id: h.person_id,
    scope: h.scope,
    type: h.type,
    title: h.title,
    summary: h.summary,
  }));

  return {
    clientFacingForbidden: true,
    photographerId: tenantPhotographerId,
    queryText,
    focusedWeddingId: weddingIdEffective,
    focusedPersonId: personIdEffective,
    playbookRules,
    rawPlaybookRules,
    authorizedCaseExceptions,
    crmDigest,
    memoryHeaders: headerOut,
    selectedMemories,
    globalKnowledge,
    retrievalLog,
  };
}
