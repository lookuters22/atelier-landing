/**
 * P4: bounded undo for calendar_event_create (delete row) and calendar_event_reschedule (restore prior times).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json } from "../../../../src/types/database.types.ts";

function jsonObject(j: Json): Record<string, unknown> {
  return j != null && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}

function stringField(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export type UndoOperatorAssistantWriteResult =
  | { ok: true; kind: "calendar_event_deleted" | "calendar_event_times_restored" }
  | { ok: false; error: string; status: number };

export async function undoOperatorAssistantWrite(
  supabase: SupabaseClient,
  photographerId: string,
  auditId: string,
): Promise<UndoOperatorAssistantWriteResult> {
  const { data: row, error: selErr } = await supabase
    .from("operator_assistant_write_audit")
    .select("id, photographer_id, operation, entity_id, detail, undone_at")
    .eq("id", auditId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (selErr) {
    return { ok: false, error: selErr.message, status: 500 };
  }
  if (!row?.id) {
    return { ok: false, error: "audit record not found", status: 404 };
  }

  const undoneAt = (row as { undone_at?: string | null }).undone_at;
  if (undoneAt != null && String(undoneAt).length > 0) {
    return { ok: false, error: "already undone", status: 409 };
  }

  const operation = String((row as { operation: string }).operation);
  const entityId = String((row as { entity_id: string }).entity_id);
  const detail = (row as { detail: Json }).detail;

  if (operation === "calendar_event_create") {
    const { data: existing, error: exErr } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("id", entityId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (exErr) {
      return { ok: false, error: exErr.message, status: 500 };
    }
    if (!existing?.id) {
      return { ok: false, error: "calendar event not found or already removed", status: 404 };
    }

    const { error: delErr } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", entityId)
      .eq("photographer_id", photographerId);

    if (delErr) {
      return { ok: false, error: delErr.message, status: 500 };
    }
  } else if (operation === "calendar_event_reschedule") {
    const d = jsonObject(detail);
    const before = jsonObject(detail && typeof detail === "object" && "before" in d ? d.before as Json : null);
    const start = stringField(before, "startTime");
    const end = stringField(before, "endTime");
    if (start == null || end == null) {
      return { ok: false, error: "audit detail missing before.startTime / before.endTime", status: 400 };
    }

    const { error: updErr } = await supabase
      .from("calendar_events")
      .update({ start_time: start, end_time: end })
      .eq("id", entityId)
      .eq("photographer_id", photographerId);

    if (updErr) {
      return { ok: false, error: updErr.message, status: 500 };
    }
  } else {
    return { ok: false, error: `operation does not support undo: ${operation}`, status: 400 };
  }

  const now = new Date().toISOString();
  const { error: markErr } = await supabase
    .from("operator_assistant_write_audit")
    .update({ undone_at: now, undone_by: photographerId })
    .eq("id", auditId)
    .eq("photographer_id", photographerId);

  if (markErr) {
    return { ok: false, error: `undo applied but failed to mark audit: ${markErr.message}`, status: 500 };
  }

  return {
    ok: true,
    kind: operation === "calendar_event_create" ? "calendar_event_deleted" : "calendar_event_times_restored",
  };
}
