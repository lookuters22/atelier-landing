import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ENTITY_PEOPLE_INDEX_LIMIT,
  ENTITY_WEDDINGS_INDEX_LIMIT,
} from "./resolveOperatorQueryEntitiesFromIndex.ts";
import type {
  AssistantQueryEntityPersonIndexRow,
  AssistantQueryEntityWeddingIndexRow,
} from "./resolveOperatorQueryEntitiesFromIndex.ts";

/**
 * Capped, tenant-scoped index rows for `resolveOperatorQueryEntitiesFromIndex` (same order as recent CRM, deterministic).
 */
export async function fetchAssistantQueryEntityIndex(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<{
  weddings: AssistantQueryEntityWeddingIndexRow[];
  people: AssistantQueryEntityPersonIndexRow[];
}> {
  const [weddingsRes, peopleRes] = await Promise.all([
    supabase
      .from("weddings")
      .select("id, couple_names, location, stage, project_type, wedding_date")
      .eq("photographer_id", photographerId)
      .order("wedding_date", { ascending: false })
      .order("id", { ascending: true })
      .limit(ENTITY_WEDDINGS_INDEX_LIMIT),
    supabase
      .from("people")
      .select("id, display_name, kind")
      .eq("photographer_id", photographerId)
      .order("display_name", { ascending: true })
      .order("id", { ascending: true })
      .limit(ENTITY_PEOPLE_INDEX_LIMIT),
  ]);

  if (weddingsRes.error) {
    throw new Error(`fetchAssistantQueryEntityIndex weddings: ${weddingsRes.error.message}`);
  }
  if (peopleRes.error) {
    throw new Error(`fetchAssistantQueryEntityIndex people: ${peopleRes.error.message}`);
  }

  const weddings: AssistantQueryEntityWeddingIndexRow[] = (weddingsRes.data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      couple_names: String(x.couple_names ?? ""),
      location: String(x.location ?? ""),
      stage: String(x.stage ?? ""),
      project_type: String(x.project_type ?? ""),
      wedding_date: x.wedding_date != null ? String(x.wedding_date) : null,
    };
  });

  const people: AssistantQueryEntityPersonIndexRow[] = (peopleRes.data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id ?? ""),
      display_name: String(x.display_name ?? ""),
      kind: String(x.kind ?? ""),
    };
  });

  return { weddings, people };
}
