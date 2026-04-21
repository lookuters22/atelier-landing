/**
 * Bounded tenant-wide `knowledge_base` retrieval for `DecisionContext.globalKnowledge` (V3 memory slice 2).
 * Call only after `decideGlobalKnowledgeBaseQuery` passes — `buildDecisionContext` skips this entirely when gated off.
 *
 * **Truth hierarchy:** `playbook_rules` remain primary structured policy. `globalKnowledge` is supporting
 * studio-wide guidance only; it does **not** override playbook instructions.
 *
 * **Scope:** Always `.eq("photographer_id", …)` via `match_knowledge` — cross-tenant rows cannot be selected.
 *
 * **Retrieval strategy (Slice 2):**
 * - Embed the turn blob (`rawMessage` + `threadSummary`) with `text-embedding-3-small` (bounded).
 * - Call Postgres `match_knowledge` (pgvector cosine similarity, tenant-scoped) — no bulk table scan.
 * - Fetch at most {@link MATCH_KNOWLEDGE_RPC_LIMIT} candidates; apply reply-channel tie-break in-process; return top {@link MAX_GLOBAL_KNOWLEDGE_ROWS}.
 * - Rows without `embedding` are invisible to `match_knowledge` (see migration).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import { generateTextEmbeddingSmall } from "../embeddings/generateTextEmbeddingSmall.ts";
import { truncateRagEmbeddingQuery } from "../tools/ragA5Budget.ts";

/** Hard cap on `globalKnowledge` rows attached per turn (orchestrator payload bound). */
export const MAX_GLOBAL_KNOWLEDGE_ROWS = 3;

/** Assistant Mode B default — plan §3 (can override per call via options). */
export const MAX_GLOBAL_KNOWLEDGE_ROWS_ASSISTANT = 5;

/** RPC candidate cap — small, deterministic; ranking finishes in TS (channel preference only). */
const MATCH_KNOWLEDGE_RPC_LIMIT = 24;

/** Minimum cosine similarity (1 - distance) for RPC; tuned for recall on short turn blobs. */
const MATCH_KNOWLEDGE_THRESHOLD = 0.35;

type KbMatchRow = {
  id: string;
  document_type: string;
  content: string;
  metadata: Database["public"]["Tables"]["knowledge_base"]["Row"]["metadata"];
  created_at: string | null;
  similarity: number;
};

export type FetchRelevantGlobalKnowledgeInput = {
  photographerId: string;
  rawMessage: string;
  threadSummary: string | null;
  replyChannel: AgentContext["replyChannel"];
};

export type FetchRelevantGlobalKnowledgeOptions = {
  /** When set, caps returned rows (reply mode defaults to {@link MAX_GLOBAL_KNOWLEDGE_ROWS}). */
  maxRows?: number;
};

function preferredDocumentTypesForChannel(
  replyChannel: AgentContext["replyChannel"],
): readonly string[] {
  switch (replyChannel) {
    case "email":
      return ["past_email"];
    case "whatsapp":
      return ["brand_voice"];
    case "web":
      return ["brand_voice", "contract"];
  }
}

function channelTypeBoost(documentType: string, replyChannel: AgentContext["replyChannel"]): number {
  const prefs = preferredDocumentTypesForChannel(replyChannel);
  const idx = prefs.indexOf(documentType);
  return idx === -1 ? 0 : prefs.length - idx;
}

function compareCreatedAt(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

/**
 * Loads up to {@link MAX_GLOBAL_KNOWLEDGE_ROWS} relevant `knowledge_base` rows for the tenant via pgvector RPC.
 */
export async function fetchRelevantGlobalKnowledgeForDecisionContext(
  supabase: SupabaseClient,
  input: FetchRelevantGlobalKnowledgeInput,
  options?: FetchRelevantGlobalKnowledgeOptions,
): Promise<Array<Record<string, unknown>>> {
  const maxRows = options?.maxRows ?? MAX_GLOBAL_KNOWLEDGE_ROWS;
  const turnBlob = truncateRagEmbeddingQuery(`${input.rawMessage}\n${input.threadSummary ?? ""}`);
  if (!turnBlob.trim()) {
    return [];
  }

  let embedding: number[];
  try {
    embedding = await generateTextEmbeddingSmall(turnBlob);
  } catch (e) {
    console.warn(
      JSON.stringify({
        type: "global_knowledge_embed_skipped",
        reason: e instanceof Error ? e.message : String(e),
      }),
    );
    return [];
  }

  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    match_threshold: MATCH_KNOWLEDGE_THRESHOLD,
    match_count: MATCH_KNOWLEDGE_RPC_LIMIT,
    p_photographer_id: input.photographerId,
    p_document_type: null,
  });

  if (error) {
    throw new Error(`fetchRelevantGlobalKnowledgeForDecisionContext: ${error.message}`);
  }

  const rows = (data ?? []) as KbMatchRow[];
  if (rows.length === 0) {
    return [];
  }

  const scored = rows.map((row) => {
    const similarity = Number(row.similarity);
    const channelBoost = channelTypeBoost(row.document_type, input.replyChannel);
    return { row, similarity, channelBoost };
  });

  scored.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    if (b.channelBoost !== a.channelBoost) return b.channelBoost - a.channelBoost;
    const ct = compareCreatedAt(a.row.created_at, b.row.created_at);
    if (ct !== 0) return ct;
    return String(a.row.id).localeCompare(String(b.row.id));
  });

  const picked = scored.slice(0, maxRows);

  return picked.map(({ row, similarity, channelBoost }) => ({
    id: row.id,
    document_type: row.document_type,
    content: row.content,
    metadata: row.metadata,
    created_at: row.created_at,
    retrieval_signals: {
      similarity,
      replyChannel: input.replyChannel,
      channelBoost,
    },
  }));
}
