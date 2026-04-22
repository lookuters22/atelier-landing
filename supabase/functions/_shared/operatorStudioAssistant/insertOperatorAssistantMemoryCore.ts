/**
 * Service-role insert into `memories` only. No playbook or task writes.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { ValidatedOperatorAssistantMemoryPayload } from "./validateOperatorAssistantMemoryPayload.ts";
import { recordOperatorAssistantWriteAudit } from "./recordOperatorAssistantWriteAudit.ts";

export async function insertMemoryForOperatorAssistant(
  supabase: SupabaseClient,
  photographerId: string,
  body: ValidatedOperatorAssistantMemoryPayload,
): Promise<{ id: string; auditId: string }> {
  if (body.memoryScope === "project" && body.weddingId) {
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

  if (body.memoryScope === "person" && body.personId) {
    const { data, error } = await supabase
      .from("people")
      .select("id")
      .eq("id", body.personId)
      .eq("photographer_id", photographerId)
      .maybeSingle();
    if (error) {
      throw new Error(`person verify failed: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error("person not found for tenant");
    }
  }

  const insertRow: Database["public"]["Tables"]["memories"]["Insert"] = {
    photographer_id: photographerId,
    scope: body.memoryScope,
    wedding_id: body.memoryScope === "project" ? body.weddingId : null,
    person_id: body.memoryScope === "person" ? body.personId : null,
    type: "operator_assistant_note",
    title: body.title,
    summary: body.summary,
    full_content: body.fullContent,
  };

  const { data: row, error: insErr } = await supabase.from("memories").insert(insertRow).select("id").single();

  if (insErr) {
    throw new Error(insErr.message);
  }
  if (!row?.id) {
    throw new Error("insert did not return id");
  }
  const id = String(row.id);
  const { auditId } = await recordOperatorAssistantWriteAudit(supabase, photographerId, {
    operation: "memory_create",
    entityTable: "memories",
    entityId: id,
    detail: {
      memoryScope: body.memoryScope,
      title: body.title,
      weddingId: body.weddingId ?? null,
      personId: body.personId ?? null,
    },
  });
  return { id, auditId };
}
