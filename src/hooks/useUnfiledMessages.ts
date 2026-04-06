import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type AiRoutingMetadata = {
  suggested_wedding_id: string | null;
  confidence_score: number;
  reasoning: string;
  classified_intent: string;
};

export type UnfiledThread = {
  id: string;
  title: string;
  last_activity_at: string;
  ai_routing_metadata: AiRoutingMetadata | null;
  messages: { id: string; sender: string; body: string; sent_at: string }[];
};

export function useUnfiledMessages() {
  const [threads, setThreads] = useState<UnfiledThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    supabase
      .from("threads")
      .select("id, title, last_activity_at, ai_routing_metadata, messages(id, sender, body, sent_at)")
      .is("wedding_id", null)
      .order("last_activity_at", { ascending: false })
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useUnfiledMessages error:", error.message);
          setThreads([]);
          setIsLoading(false);
          return;
        }

        const mapped: UnfiledThread[] = (rows ?? []).map((row: Record<string, unknown>) => {
          const meta = row.ai_routing_metadata as AiRoutingMetadata | null;
          const msgs = (row.messages ?? []) as Record<string, unknown>[];
          return {
            id: row.id as string,
            title: row.title as string,
            last_activity_at: row.last_activity_at as string,
            ai_routing_metadata: meta,
            messages: msgs.map((m) => ({
              id: m.id as string,
              sender: m.sender as string,
              body: m.body as string,
              sent_at: m.sent_at as string,
            })),
          };
        });

        setThreads(mapped);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  async function linkThread(threadId: string, weddingId: string) {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));

    const { data: wedding, error: wErr } = await supabase
      .from("weddings")
      .select("photographer_id")
      .eq("id", weddingId)
      .single();

    if (wErr || !wedding) {
      console.error("linkThread wedding error:", wErr?.message);
      refetch();
      return;
    }

    const { error } = await supabase
      .from("threads")
      .update({
        wedding_id: weddingId,
        ai_routing_metadata: null,
        photographer_id: wedding.photographer_id as string,
      })
      .eq("id", threadId);

    if (error) {
      console.error("linkThread error:", error.message);
      refetch();
    }
  }

  return { threads, isLoading, linkThread, refetch };
}
