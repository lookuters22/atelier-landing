/**
 * Validation for memory_note proposals + confirm path (Slice 8). `project` | `studio` only.
 */
import type {
  InsertOperatorAssistantMemoryBody,
  OperatorAssistantProposedActionMemoryNote,
} from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import type { Database } from "../../../../src/types/database.types.ts";

const MAX_TITLE = 120;
const MAX_SUMMARY = 400;
const MAX_FULL = 8000;

export type ValidatedOperatorAssistantMemoryPayload = InsertOperatorAssistantMemoryBody & {
  memoryScope: Database["public"]["Enums"]["memory_scope"];
};

function trimToMax(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function validateOperatorAssistantMemoryPayload(
  raw: unknown,
):
  | { ok: true; value: ValidatedOperatorAssistantMemoryPayload }
  | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "payload must be an object" };
  }
  const o = raw as Record<string, unknown>;
  const ms = o.memoryScope;
  if (ms !== "project" && ms !== "studio") {
    return { ok: false, error: "memoryScope must be project or studio" };
  }

  const title = trimToMax(o.title, MAX_TITLE);
  if (!title) return { ok: false, error: "title is required" };

  const long = trimToMax(
    o.fullContent != null && String(o.fullContent).trim() !== "" ? o.fullContent : o.summary,
    MAX_FULL,
  );
  if (!long) return { ok: false, error: "summary or fullContent is required" };

  const summaryRaw = trimToMax(o.summary, MAX_SUMMARY);
  const summary = summaryRaw ?? (long.length > MAX_SUMMARY ? long.slice(0, MAX_SUMMARY) : long);

  let weddingId: string | null = null;
  if (o.weddingId != null) {
    if (typeof o.weddingId !== "string" || o.weddingId.trim().length === 0) {
      return { ok: false, error: "weddingId must be a non-empty string when set" };
    }
    weddingId = o.weddingId.trim();
  }

  if (ms === "project") {
    if (!weddingId) return { ok: false, error: "weddingId is required for project memory" };
  } else {
    if (weddingId) return { ok: false, error: "weddingId must be omitted for studio memory" };
  }

  return {
    ok: true,
    value: {
      memoryScope: ms,
      title,
      summary,
      fullContent: long,
      weddingId: ms === "project" ? weddingId : null,
    },
  };
}

export function tryParseLlmProposedMemoryNote(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionMemoryNote }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "memory_note") {
    return { ok: false, reason: "not a memory_note" };
  }
  const o = item as Record<string, unknown>;
  const ms = o.memoryScope;
  if (ms !== "project" && ms !== "studio") {
    return { ok: false, reason: "memoryScope must be project or studio" };
  }

  const title = trimToMax(o.title, MAX_TITLE);
  if (!title) return { ok: false, reason: "title is required" };

  const fromFull = trimToMax(o.fullContent, MAX_FULL);
  const fromSumm = trimToMax(o.summary, MAX_SUMMARY);
  const long = fromFull ?? fromSumm;
  if (!long) return { ok: false, reason: "summary or fullContent is required" };

  const summary = fromSumm ?? (long.length > MAX_SUMMARY ? long.slice(0, MAX_SUMMARY) : long);
  const fullContent = fromFull ?? long;
  if (!summary.trim() || !fullContent.trim()) {
    return { ok: false, reason: "summary or fullContent is required" };
  }

  let weddingId: string | null = null;
  if (o.weddingId != null) {
    if (typeof o.weddingId !== "string" || o.weddingId.trim().length === 0) {
      return { ok: false, reason: "invalid weddingId" };
    }
    weddingId = o.weddingId.trim();
  }
  if (ms === "project" && !weddingId) {
    return { ok: false, reason: "weddingId required for project memory" };
  }
  if (ms === "studio" && weddingId) {
    return { ok: false, reason: "weddingId must be omitted for studio memory" };
  }

  return {
    ok: true,
    value: {
      kind: "memory_note",
      memoryScope: ms,
      title,
      summary: summary.length > MAX_SUMMARY ? summary.slice(0, MAX_SUMMARY) : summary,
      fullContent: fullContent.length > MAX_FULL ? fullContent.slice(0, MAX_FULL) : fullContent,
      weddingId: ms === "project" ? weddingId : null,
    },
  };
}
