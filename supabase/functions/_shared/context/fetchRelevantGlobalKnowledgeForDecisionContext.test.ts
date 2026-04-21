import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

vi.mock("../embeddings/generateTextEmbeddingSmall.ts", () => ({
  generateTextEmbeddingSmall: vi.fn().mockResolvedValue(Array.from({ length: 1536 }, (_, i) => (i % 100) / 10_000)),
}));

import { generateTextEmbeddingSmall } from "../embeddings/generateTextEmbeddingSmall.ts";
import {
  fetchRelevantGlobalKnowledgeForDecisionContext,
  MAX_GLOBAL_KNOWLEDGE_ROWS,
  MAX_GLOBAL_KNOWLEDGE_ROWS_ASSISTANT,
} from "./fetchRelevantGlobalKnowledgeForDecisionContext.ts";

type RpcCapture = {
  name?: string;
  params?: Record<string, unknown>;
};

function rpcClient(rows: unknown[], capture: RpcCapture): SupabaseClient {
  return {
    rpc: (name: string, params: Record<string, unknown>) => {
      capture.name = name;
      capture.params = params;
      return Promise.resolve({ data: rows, error: null });
    },
  } as unknown as SupabaseClient;
}

describe("fetchRelevantGlobalKnowledgeForDecisionContext", () => {
  it("calls match_knowledge scoped to photographer_id (pgvector path)", async () => {
    const cap: RpcCapture = {};
    const supabase = rpcClient(
      [
        {
          id: "a1",
          document_type: "brand_voice",
          content: "Brand",
          metadata: null,
          created_at: "2026-01-02T00:00:00.000Z",
          similarity: 0.9,
        },
      ],
      cap,
    );
    await fetchRelevantGlobalKnowledgeForDecisionContext(supabase, {
      photographerId: "tenant-1",
      rawMessage: "brand voice tone",
      threadSummary: null,
      replyChannel: "web",
    });
    expect(cap.name).toBe("match_knowledge");
    expect(cap.params?.p_photographer_id).toBe("tenant-1");
    expect(cap.params?.p_document_type).toBeNull();
    expect(vi.mocked(generateTextEmbeddingSmall)).toHaveBeenCalled();
  });

  it("returns RPC rows ordered by similarity then channel boost", async () => {
    const supabase = rpcClient(
      [
        {
          id: "low",
          document_type: "contract",
          content: "x",
          metadata: null,
          created_at: "2026-01-01T00:00:00.000Z",
          similarity: 0.9,
        },
        {
          id: "high",
          document_type: "brand_voice",
          content: "x",
          metadata: null,
          created_at: "2026-01-01T00:00:00.000Z",
          similarity: 0.9,
        },
      ],
      {},
    );
    const out = await fetchRelevantGlobalKnowledgeForDecisionContext(supabase, {
      photographerId: "tenant-1",
      rawMessage: "wedding package",
      threadSummary: null,
      replyChannel: "web",
    });
    expect(out.map((r) => r.id)).toEqual(["high", "low"]);
  });

  it("caps at MAX_GLOBAL_KNOWLEDGE_ROWS", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `id-${i}`,
      document_type: "brand_voice",
      content: `c${i}`,
      metadata: null,
      created_at: `2026-01-0${Math.min(i + 1, 9)}T00:00:00.000Z`,
      similarity: 0.9 - i * 0.01,
    }));
    const supabase = rpcClient(rows, {});
    const out = await fetchRelevantGlobalKnowledgeForDecisionContext(supabase, {
      photographerId: "tenant-1",
      rawMessage: "destination wedding photography",
      threadSummary: null,
      replyChannel: "web",
    });
    expect(out.length).toBe(MAX_GLOBAL_KNOWLEDGE_ROWS);
  });

  it("caps at options.maxRows (assistant Mode B default constant)", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `id-${i}`,
      document_type: "brand_voice",
      content: `c${i}`,
      metadata: null,
      created_at: `2026-01-01T00:00:00.000Z`,
      similarity: 0.95 - i * 0.01,
    }));
    const supabase = rpcClient(rows, {});
    const out = await fetchRelevantGlobalKnowledgeForDecisionContext(
      supabase,
      {
        photographerId: "tenant-1",
        rawMessage: "studio assistant query",
        threadSummary: null,
        replyChannel: "web",
      },
      { maxRows: MAX_GLOBAL_KNOWLEDGE_ROWS_ASSISTANT },
    );
    expect(out.length).toBe(MAX_GLOBAL_KNOWLEDGE_ROWS_ASSISTANT);
  });

  it("returns empty when RPC returns no rows", async () => {
    const supabase = rpcClient([], {});
    const out = await fetchRelevantGlobalKnowledgeForDecisionContext(supabase, {
      photographerId: "tenant-1",
      rawMessage: "hi",
      threadSummary: null,
      replyChannel: "email",
    });
    expect(out).toEqual([]);
  });

  it("returns empty when turn blob is empty after trim", async () => {
    const supabase = rpcClient([], {});
    const out = await fetchRelevantGlobalKnowledgeForDecisionContext(supabase, {
      photographerId: "tenant-1",
      rawMessage: "   \n",
      threadSummary: null,
      replyChannel: "email",
    });
    expect(out).toEqual([]);
  });
});
