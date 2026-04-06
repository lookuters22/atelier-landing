import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fireDataChanged } from "../lib/events";

export type AiRoutingMeta = {
  suggested_wedding_id: string | null;
  confidence_score: number;
  reasoning: string;
  classified_intent: string;
};

export type UnfiledThread = {
  id: string;
  title: string;
  last_activity_at: string;
  ai_routing_metadata: AiRoutingMeta | null;
  snippet: string;
  sender: string;
};

export type ActiveWedding = {
  id: string;
  couple_names: string;
};

export function useUnfiledInbox() {
  const [unfiledThreads, setUnfiledThreads] = useState<UnfiledThread[]>([]);
  const [activeWeddings, setActiveWeddings] = useState<ActiveWedding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const q1 = supabase
      .from("threads")
      .select("id, title, last_activity_at, ai_routing_metadata, messages(sender, body, sent_at)")
      .is("wedding_id", null)
      .neq("kind", "other")
      .order("last_activity_at", { ascending: false });

    const q2 = supabase
      .from("weddings")
      .select("id, couple_names")
      .neq("stage", "archived")
      .order("couple_names", { ascending: true });

    Promise.all([q1, q2]).then(([r1, r2]) => {
      if (cancelled) return;

      if (r1.error) {
        console.error("useUnfiledInbox threads error:", r1.error.message);
      }
      if (r2.error) {
        console.error("useUnfiledInbox weddings error:", r2.error.message);
      }

      const threads: UnfiledThread[] = (r1.data ?? []).map((row: Record<string, unknown>) => {
        const meta = row.ai_routing_metadata as AiRoutingMeta | null;
        const msgs = (row.messages ?? []) as Record<string, unknown>[];
        const sorted = [...msgs].sort(
          (a, b) => new Date(b.sent_at as string).getTime() - new Date(a.sent_at as string).getTime(),
        );
        const latest = sorted[0];
        return {
          id: row.id as string,
          title: row.title as string,
          last_activity_at: row.last_activity_at as string,
          ai_routing_metadata: meta,
          snippet: latest ? (latest.body as string).slice(0, 160) : "",
          sender: latest ? (latest.sender as string) : "",
        };
      });

      const weddings: ActiveWedding[] = (r2.data ?? []).map((w: Record<string, unknown>) => ({
        id: w.id as string,
        couple_names: w.couple_names as string,
      }));

      setUnfiledThreads(threads);
      setActiveWeddings(weddings);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  async function linkThread(threadId: string, weddingId: string) {
    setUnfiledThreads((prev) => prev.filter((t) => t.id !== threadId));

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
    } else {
      fireDataChanged();
    }
  }

  async function deleteThread(threadId: string) {
    setUnfiledThreads((prev) => prev.filter((t) => t.id !== threadId));

    const { error } = await supabase.from("threads").delete().eq("id", threadId);

    if (error) {
      console.error("deleteThread error:", error.message);
      refetch();
    } else {
      fireDataChanged();
    }
  }

  return { unfiledThreads, activeWeddings, isLoading, linkThread, deleteThread, refetch };
}
