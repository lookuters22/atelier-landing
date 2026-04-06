import type { AgentContext } from "../../../../src/types/agent.types.ts";

/**
 * execute_v3 Phase 6.5 Step 6.5F — default orchestrator **system** prompt must not include unrestricted
 * high-risk PII surfaces (full thread bodies, memory full text, unbounded knowledge blobs).
 *
 * Tool calls and the user turn still carry operational text where needed; this trims what the system
 * preamble embeds. Document / restricted sends remain verifier + approval flows (doc §6.5F).
 */

const MAX_THREAD_SUMMARY_CHARS = 800;
const MAX_MEMORY_SUMMARY_CHARS = 200;
const MAX_GLOBAL_KNOWLEDGE_PREVIEW_CHARS = 500;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

/** CRM fields already loaded by `buildAgentContext` — allowlist only (no arbitrary JSON dump). */
function pickCrmSnapshot(snap: Record<string, unknown>): Record<string, unknown> {
  const keys = ["id", "couple_names", "stage", "wedding_date", "location"] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in snap) out[k] = snap[k];
  }
  return out;
}

/**
 * Shape safe for a normal orchestrator system preamble — **no** raw message bodies, **no** `full_content`.
 */
export function sanitizeAgentContextForOrchestratorPrompt(ctx: AgentContext): Record<string, unknown> {
  const threadSummary =
    ctx.threadSummary === null || ctx.threadSummary === undefined
      ? null
      : truncate(String(ctx.threadSummary), MAX_THREAD_SUMMARY_CHARS);

  const recentMessages = ctx.recentMessages.map((m) => {
    const row = m as Record<string, unknown>;
    return {
      id: row.id,
      direction: row.direction,
      sender: row.sender,
      sent_at: row.sent_at,
      body_omitted: true as const,
    };
  });

  const memoryHeaders = ctx.memoryHeaders.map((h) => ({
    id: h.id,
    type: h.type,
    title: h.title,
    summary: truncate(h.summary, MAX_MEMORY_SUMMARY_CHARS),
  }));

  const selectedMemories = ctx.selectedMemories.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    summary: truncate(s.summary, MAX_MEMORY_SUMMARY_CHARS),
    full_content_omitted: true as const,
  }));

  const globalKnowledge = ctx.globalKnowledge.map((row, i) => ({
    index: i,
    preview: truncate(JSON.stringify(row), MAX_GLOBAL_KNOWLEDGE_PREVIEW_CHARS),
  }));

  return {
    photographerId: ctx.photographerId,
    weddingId: ctx.weddingId,
    threadId: ctx.threadId,
    replyChannel: ctx.replyChannel,
    crmSnapshot: pickCrmSnapshot(ctx.crmSnapshot),
    recentMessages,
    threadSummary,
    memoryHeaders,
    selectedMemories,
    globalKnowledge,
  };
}
