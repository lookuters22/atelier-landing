import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { onDataChanged } from "../lib/events";

export type UpcomingWedding = {
  id: string;
  couple_names: string;
  wedding_date: string | null;
  location: string;
  stage: string;
};

export function useUpcomingWeddings(photographerId: string, limit = 4) {
  const [weddings, setWeddings] = useState<UpcomingWedding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => onDataChanged(refetch, { scopes: ["weddings", "all"] }), [refetch]);

  useEffect(() => {
    if (!photographerId) {
      setWeddings([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const today = new Date().toISOString();

    supabase
      .from("weddings")
      .select("id, couple_names, wedding_date, location, stage")
      .eq("photographer_id", photographerId)
      .not("wedding_date", "is", null)
      .gte("wedding_date", today)
      .order("wedding_date", { ascending: true })
      .limit(limit)
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useUpcomingWeddings error:", error.message);
          setWeddings([]);
          setIsLoading(false);
          return;
        }

        const mapped: UpcomingWedding[] = (rows ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          couple_names: row.couple_names as string,
          wedding_date: row.wedding_date as string,
          location: row.location as string,
          stage: row.stage as string,
        }));

        setWeddings(mapped);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [photographerId, limit, fetchKey]);

  return { weddings, isLoading, refetch };
}
