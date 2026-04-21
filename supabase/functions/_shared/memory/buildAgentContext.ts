import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import type { CrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import { emptyCrmSnapshot, parsePackageInclusions } from "../../../../src/types/crmSnapshot.types.ts";
import {
  fetchMessageIdsWithStructuredAttachments,
  redactMessageBodyForModelContext,
} from "./attachmentSafetyForModelContext.ts";
import { PERSONA_CONTEXT_RECENT_MESSAGE_LIMIT } from "./buildPersonaRawFacts.ts";
import { fetchMemoryHeaders } from "./fetchMemoryHeaders.ts";
import { fetchThreadSummary } from "./fetchThreadSummary.ts";
import { sanitizeInboundTextForModelContext } from "./sanitizeInboundTextForModelContext.ts";

export type BuildAgentContextOptions = {
  /**
   * Distinct `people.id` from `thread_participants` for this thread — passed through to memory header scan
   * (`fetchMemoryHeaders`) and reply-mode selection. Usually supplied by `buildDecisionContext` only.
   */
  replyModeParticipantPersonIds?: string[] | null;
};

function normalizeReplyModeParticipantPersonIds(ids?: string[] | null): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.map((id) => String(id).trim()).filter((id) => id.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Assembles tenant-scoped `AgentContext` before Orchestrator reasoning (ARCHITECTURE.md §5).
 */
export async function buildAgentContext(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
  replyChannel: AgentContext["replyChannel"],
  rawMessage: string,
  options?: BuildAgentContextOptions,
): Promise<AgentContext> {
  const replyModeParticipantPersonIds = normalizeReplyModeParticipantPersonIds(
    options?.replyModeParticipantPersonIds,
  );

  const [memoryHeaders, threadSummary, crmSnapshot, recentMessages] = await Promise.all([
    fetchMemoryHeaders(supabase, photographerId, weddingId, {
      replyModeParticipantPersonIds,
    }),
    threadId
      ? fetchThreadSummary(supabase, photographerId, threadId)
      : Promise.resolve(null as string | null),
    loadCrmSnapshot(supabase, photographerId, weddingId),
    loadRecentMessages(supabase, photographerId, threadId),
  ]);

  return {
    photographerId,
    weddingId,
    threadId,
    replyChannel,
    rawMessage,
    crmSnapshot,
    recentMessages,
    threadSummary,
    replyModeParticipantPersonIds,
    memoryHeaders,
    selectedMemories: [],
    globalKnowledge: [],
  };
}

async function loadCrmSnapshot(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
): Promise<CrmSnapshot> {
  if (!weddingId) {
    return emptyCrmSnapshot();
  }

  const { data, error } = await supabase
    .from("weddings")
    .select(
      "id, couple_names, stage, wedding_date, location, balance_due, strategic_pause, compassion_pause, package_name, contract_value, package_inclusions",
    )
    .eq("id", weddingId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    throw new Error(`buildAgentContext CRM: ${error.message}`);
  }

  if (!data) {
    return emptyCrmSnapshot();
  }

  const row = data as Record<string, unknown>;
  const package_inclusions = parsePackageInclusions(row.package_inclusions);
  return {
    ...data,
    package_inclusions,
  } as CrmSnapshot;
}

async function loadRecentMessages(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string | null,
): Promise<Array<Record<string, unknown>>> {
  if (!threadId) {
    return [];
  }

  const { data: threadRow, error: threadErr } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (threadErr) {
    throw new Error(`buildAgentContext thread check: ${threadErr.message}`);
  }
  if (!threadRow) {
    return [];
  }

  const { data: rows, error: msgErr } = await supabase
    .from("messages")
    .select("id, thread_id, direction, sender, body, sent_at")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId)
    .order("sent_at", { ascending: false })
    .limit(PERSONA_CONTEXT_RECENT_MESSAGE_LIMIT);

  if (msgErr) {
    throw new Error(`buildAgentContext messages: ${msgErr.message}`);
  }

  const chronological = [...(rows ?? [])].reverse();
  const ids = chronological.map((m) => m.id as string).filter(Boolean);
  const withAttachments = await fetchMessageIdsWithStructuredAttachments(
    supabase,
    photographerId,
    ids,
  );

  return chronological.map((m) => {
    const id = m.id as string;
    const rawBody = String(m.body ?? "");
    const layered = redactMessageBodyForModelContext(rawBody, {
      hasStructuredAttachments: withAttachments.has(id),
    });
    return {
      ...m,
      body: sanitizeInboundTextForModelContext(layered),
    };
  }) as Array<Record<string, unknown>>;
}
