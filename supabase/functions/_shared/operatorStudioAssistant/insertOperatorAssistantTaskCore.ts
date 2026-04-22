/**
 * Service-role insert into `tasks` only (Slice 7). No playbook or durable note writes.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { ValidatedOperatorAssistantTaskPayload } from "./validateOperatorAssistantTaskPayload.ts";
import { recordOperatorAssistantWriteAudit } from "./recordOperatorAssistantWriteAudit.ts";

export async function insertTaskForOperatorAssistant(
  supabase: SupabaseClient,
  photographerId: string,
  body: ValidatedOperatorAssistantTaskPayload,
): Promise<{ id: string; auditId: string }> {
  if (body.weddingId) {
    const { data, error } = await supabase
      .from("weddings")
      .select("id")
      .eq("id", body.weddingId)
      .eq("photographer_id", photographerId)
      .maybeSingle();
    if (error) {
      throw new Error(`wedding verify failed: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error("wedding not found for tenant");
    }
  }

  const insertRow: Database["public"]["Tables"]["tasks"]["Insert"] = {
    photographer_id: photographerId,
    title: body.title,
    due_date: body.dueDateNormalized,
    wedding_id: body.weddingId ?? null,
    thread_id: null,
    status: "open",
  };

  const { data: row, error: insErr } = await supabase.from("tasks").insert(insertRow).select("id").single();

  if (insErr) {
    throw new Error(insErr.message);
  }
  if (!row?.id) {
    throw new Error("insert did not return id");
  }
  const id = String(row.id);
  const { auditId } = await recordOperatorAssistantWriteAudit(supabase, photographerId, {
    operation: "task_create",
    entityTable: "tasks",
    entityId: id,
    detail: {
      title: body.title,
      dueDate: body.dueDateNormalized,
      weddingId: body.weddingId ?? null,
    },
  });
  return { id, auditId };
}
