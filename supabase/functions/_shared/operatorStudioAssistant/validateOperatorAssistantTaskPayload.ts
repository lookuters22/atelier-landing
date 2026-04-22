/**
 * Validation for task proposals + confirm path (Slice 7). Aligned with `tasks` insert.
 */
import type {
  InsertOperatorAssistantTaskBody,
  OperatorAssistantProposedActionTask,
} from "../../../../src/types/operatorAssistantProposedAction.types.ts";

const MAX_TITLE = 500;

export type ValidatedOperatorAssistantTaskPayload = InsertOperatorAssistantTaskBody & {
  /** Normalized for `tasks.due_date` (YYYY-MM-DD). */
  dueDateNormalized: string;
};

function trimTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_TITLE ? t.slice(0, MAX_TITLE) : t;
}

/**
 * Produces a calendar date string (UTC) suitable for `tasks.due_date`.
 */
export function normalizeTaskDueDateForDb(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const t = input.trim();
  if (!t) return { ok: false, error: "dueDate is required" };
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) {
    return { ok: false, error: "dueDate is not a parseable date" };
  }
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return { ok: true, value: `${y}-${m}-${day}` };
}

export function validateOperatorAssistantTaskPayload(
  raw: unknown,
): { ok: true; value: ValidatedOperatorAssistantTaskPayload } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "payload must be an object" };
  }
  const o = raw as Record<string, unknown>;
  const title = trimTitle(o.title);
  if (!title) return { ok: false, error: "title is required" };

  const dueRaw = typeof o.dueDate === "string" ? o.dueDate : typeof o.due_date === "string" ? o.due_date : null;
  if (!dueRaw) return { ok: false, error: "dueDate is required" };
  const n = normalizeTaskDueDateForDb(dueRaw);
  if (!n.ok) return n;

  let weddingId: string | null = null;
  if (o.weddingId != null) {
    if (typeof o.weddingId !== "string" || o.weddingId.trim().length === 0) {
      return { ok: false, error: "weddingId must be a non-empty string when set" };
    }
    weddingId = o.weddingId.trim();
  }

  return {
    ok: true,
    value: {
      title,
      dueDate: dueRaw.trim(),
      dueDateNormalized: n.value,
      weddingId,
    },
  };
}

export function tryParseLlmProposedTask(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionTask }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "task") {
    return { ok: false, reason: "not a task" };
  }
  const v = validateOperatorAssistantTaskPayload(item);
  if (!v.ok) return { ok: false, reason: v.error };
  return {
    ok: true,
    value: {
      kind: "task",
      title: v.value.title,
      dueDate: v.value.dueDateNormalized,
      weddingId: v.value.weddingId,
    },
  };
}
