import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AssistantCrmDigest } from "../../../../src/types/assistantContext.types.ts";

const RECENT_WEDDINGS_LIMIT = 12;
const RECENT_PEOPLE_LIMIT = 15;

/**
 * Bounded CRM digest for assistant Mode B — recent projects and contacts, tenant-scoped.
 */
export async function fetchAssistantCrmDigest(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<AssistantCrmDigest> {
  const [weddingsRes, peopleRes] = await Promise.all([
    supabase
      .from("weddings")
      .select("id, couple_names, stage, wedding_date")
      .eq("photographer_id", photographerId)
      .order("wedding_date", { ascending: false })
      .order("id", { ascending: true })
      .limit(RECENT_WEDDINGS_LIMIT),
    supabase
      .from("people")
      .select("id, display_name, kind")
      .eq("photographer_id", photographerId)
      .order("display_name", { ascending: true })
      .order("id", { ascending: true })
      .limit(RECENT_PEOPLE_LIMIT),
  ]);

  if (weddingsRes.error) {
    throw new Error(`fetchAssistantCrmDigest weddings: ${weddingsRes.error.message}`);
  }
  if (peopleRes.error) {
    throw new Error(`fetchAssistantCrmDigest people: ${peopleRes.error.message}`);
  }

  const recentWeddings = (weddingsRes.data ?? []).map((r) => ({
    id: String(r.id ?? ""),
    couple_names: String(r.couple_names ?? ""),
    stage: String(r.stage ?? ""),
    wedding_date: r.wedding_date != null ? String(r.wedding_date) : null,
  }));

  const recentPeople = (peopleRes.data ?? []).map((r) => ({
    id: String(r.id ?? ""),
    display_name: String(r.display_name ?? ""),
    kind: String(r.kind ?? ""),
  }));

  return { recentWeddings, recentPeople };
}
