import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { onDataChanged } from "../lib/events";
import { isGmailImportedLatestMessage } from "../lib/gmailInboxLabels";
import type { Tables } from "../types/database.types";

export type ThreadWithDrafts = Tables<"threads"> & {
  messages: Tables<"messages">[];
  drafts: Tables<"drafts">[];
  /**
   * From `v_threads_inbox_latest_message.latest_message_metadata` — whether the latest message looks Gmail-imported
   * (same signal as inbox `hasGmailImport`), so Pipeline/Wedding detail can pick reply UI before per-thread history loads.
   * `undefined` = thread row missing from the view (treat as unknown until messages load).
   */
  usesGmailInlineReplyFromTimeline?: boolean | undefined;
};

export type WeddingProject = Tables<"weddings"> & {
  clients: Tables<"clients">[];
};

export type ProjectTask = {
  id: string;
  title: string;
  due_date: string;
  status: string;
};

export function useWeddingProject(weddingId: string | undefined) {
  const [project, setProject] = useState<WeddingProject | null>(null);
  const [timeline, setTimeline] = useState<ThreadWithDrafts[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** True while a background refetch runs (same wedding already rendered — do not full-page skeleton). */
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  /** Last `weddingId` for which a fetch completed successfully; used to tell initial load from `fetchKey` bump. */
  const fetchCompletedForWeddingIdRef = useRef<string | null>(null);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(
    () =>
      onDataChanged(refetch, {
        scopes: ["weddings", "inbox", "drafts", "tasks", "all"],
      }),
    [refetch],
  );

  useEffect(() => {
    if (!weddingId) {
      setProject(null);
      setTimeline([]);
      setTasks([]);
      setIsLoading(false);
      setIsRefreshing(false);
      fetchCompletedForWeddingIdRef.current = null;
      return;
    }

    let cancelled = false;
    const isBackgroundRefresh = fetchCompletedForWeddingIdRef.current === weddingId;

    if (isBackgroundRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
      setIsRefreshing(false);
    }
    setError(null);

    const q1 = supabase
      .from("weddings")
      .select("*, clients(*)")
      .eq("id", weddingId)
      .single();

    /** A1: thread + drafts only — messages load per selected thread in `useWeddingThreads` (avoids N× full history). */
    const q2 = supabase
      .from("threads")
      .select("*, drafts(*)")
      .eq("wedding_id", weddingId)
      .order("last_activity_at", { ascending: false });

    const q3 = supabase
      .from("tasks")
      .select("id, title, due_date, status")
      .eq("wedding_id", weddingId)
      .eq("status", "open")
      .order("due_date", { ascending: true });

    const q4 = supabase
      .from("v_threads_inbox_latest_message")
      .select("id, latest_message_metadata")
      .eq("wedding_id", weddingId);

    Promise.all([q1, q2, q3, q4]).then(([r1, r2, r3, r4]) => {
      if (cancelled) return;

      if (r1.error) {
        setError(r1.error.message);
        setProject(null);
        setIsLoading(false);
        setIsRefreshing(false);
        fetchCompletedForWeddingIdRef.current = null;
        return;
      }

      setProject(r1.data as unknown as WeddingProject);
      fetchCompletedForWeddingIdRef.current = weddingId;

      const viewByThreadId = new Map<string, Tables<"messages">["metadata"] | null>();
      if (!r4.error && r4.data) {
        for (const row of r4.data as { id: string | null; latest_message_metadata: Tables<"messages">["metadata"] | null }[]) {
          if (row.id) viewByThreadId.set(row.id, row.latest_message_metadata);
        }
      }

      setTimeline(
        ((r2.data ?? []) as unknown as ThreadWithDrafts[]).map((t) => {
          const meta = viewByThreadId.has(t.id) ? viewByThreadId.get(t.id) ?? null : undefined;
          const usesGmailInlineReplyFromTimeline =
            meta === undefined ? undefined : isGmailImportedLatestMessage(meta);
          return {
            ...t,
            messages: [],
            drafts: t.drafts ?? [],
            usesGmailInlineReplyFromTimeline,
          };
        }),
      );

      setTasks(
        (r3.data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          title: row.title as string,
          due_date: row.due_date as string,
          status: row.status as string,
        })),
      );

      setIsLoading(false);
      setIsRefreshing(false);
    });

    return () => {
      cancelled = true;
    };
  }, [weddingId, fetchKey]);

  return {
    project,
    timeline,
    tasks,
    isLoading,
    isRefreshing,
    error,
    refetch,
    timelineFetchEpoch: fetchKey,
  };
}
