import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import { PERSONA_CONTEXT_RECENT_MESSAGE_LIMIT } from "./buildPersonaRawFacts.ts";
import { fetchMemoryHeaders } from "./fetchMemoryHeaders.ts";
import { fetchThreadSummary } from "./fetchThreadSummary.ts";

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
): Promise<AgentContext> {
  const [memoryHeaders, threadSummary, crmSnapshot, recentMessages] = await Promise.all([
    fetchMemoryHeaders(supabase, photographerId, weddingId),
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
    memoryHeaders,
    selectedMemories: [],
    globalKnowledge: [],
  };
}

async function loadCrmSnapshot(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
): Promise<Record<string, unknown>> {
  if (!weddingId) {
    return {};
  }

  const { data, error } = await supabase
    .from("weddings")
    .select(
      "id, couple_names, stage, wedding_date, location, balance_due, strategic_pause, compassion_pause, package_name, contract_value",
    )
    .eq("id", weddingId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) {
    throw new Error(`buildAgentContext CRM: ${error.message}`);
  }

  return data ? { ...data } : {};
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
    .order("sent_at", { ascending: false })
    .limit(PERSONA_CONTEXT_RECENT_MESSAGE_LIMIT);

  if (msgErr) {
    throw new Error(`buildAgentContext messages: ${msgErr.message}`);
  }

  const chronological = [...(rows ?? [])].reverse();
  return chronological.map((m) => ({ ...m })) as Array<Record<string, unknown>>;
}
