import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { fireDataChanged } from "../lib/events";
import type { Tables } from "../types/database.types";

type Wedding = Tables<"weddings">;

export function weddingsByPhotographerQueryKey(photographerId: string) {
  return ["weddings", "by-photographer", photographerId] as const;
}

async function fetchWeddingsForPhotographer(photographerId: string): Promise<Wedding[]> {
  const { data: rows, error: err } = await supabase
    .from("weddings")
    .select("*")
    .eq("photographer_id", photographerId)
    .order("wedding_date", { ascending: false })
    .limit(500);

  if (err) {
    throw new Error(err.message);
  }
  return rows ?? [];
}

export function useWeddings(photographerId: string) {
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: photographerId ? weddingsByPhotographerQueryKey(photographerId) : ["weddings", "by-photographer", "none"],
    queryFn: () => fetchWeddingsForPhotographer(photographerId),
    enabled: Boolean(photographerId),
  });

  const data = q.data ?? [];
  const isLoading = Boolean(photographerId && q.isLoading);
  const error = q.error ? q.error.message : null;

  async function deleteWedding(weddingId: string) {
    queryClient.setQueryData<Wedding[] | undefined>(weddingsByPhotographerQueryKey(photographerId), (prev) =>
      prev ? prev.filter((w) => w.id !== weddingId) : prev,
    );

    const { error: delErr } = await supabase.from("weddings").delete().eq("id", weddingId);

    if (delErr) {
      console.error("deleteWedding error:", delErr.message);
      await q.refetch();
    } else {
      fireDataChanged("weddings");
    }
  }

  return { data, isLoading, error, deleteWedding, refetch: q.refetch };
}
