/**
 * Service-role insert into `memories` only (Slice 8). No playbook or task writes.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { ValidatedOperatorAssistantMemoryPayload } from "./validateOperatorAssistantMemoryPayload.ts";

export async function insertMemoryForOperatorAssistant(
  supabase: SupabaseClient,
  photographerId: string,
  body: ValidatedOperatorAssistantMemoryPayload,
): Promise<{ id: string }> {
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

  const insertRow: Database["public"]["Tables"]["memories"]["Insert"] = {
    photographer_id: photographerId,
    scope: body.memoryScope,
    wedding_id: body.memoryScope === "project" ? body.weddingId : null,
    person_id: null,
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
  return { id: String(row.id) };
}
