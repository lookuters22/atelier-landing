import { useEffect, useMemo, useState } from "react";
import type { WeddingThread, WeddingThreadMessage } from "../data/weddingThreads";
import type { Tables } from "../types/database.types";
import type { ThreadWithDrafts } from "./useWeddingProject";
import { supabase } from "../lib/supabase";
import { fireDraftsChanged } from "../lib/events";

type DbThread = ThreadWithDrafts;

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(iso)) {
    return `Today \u00b7 ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} \u00b7 ${time}`;
}

function mapThread(t: DbThread): WeddingThread {
  return {
    id: t.id,
    weddingId: t.wedding_id ?? "",
    title: t.title,
    participantHint: "",
    kind: t.kind,
    lastActivityLabel: t.last_activity_at ? formatTime(t.last_activity_at) : "No activity",
  };
}

function mapMessage(m: Tables<"messages">, idx: number): WeddingThreadMessage {
  return {
    id: m.id,
    threadId: m.thread_id,
    direction: m.direction === "internal" ? "out" : m.direction,
    sender: m.sender,
    meta: m.direction === "internal" ? "Internal note" : undefined,
    time: formatTime(m.sent_at),
    body: m.body,
    daySegment: isToday(m.sent_at) ? "today" : "earlier",
    sortOrder: idx,
  };
}

export function useWeddingThreads({
  weddingId,
  photographerId,
  liveThreads,
  showToast,
}: {
  weddingId: string;
  photographerId: string;
  liveThreads: DbThread[];
  showToast: (message: string) => void;
}) {
  const threads = useMemo(() => liveThreads.map(mapThread), [liveThreads]);

  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [draftPendingByThread, setDraftPendingByThread] = useState<Record<string, boolean>>({});
  const [messageExpanded, setMessageExpanded] = useState<Record<string, boolean>>({});
  const [draftExpanded, setDraftExpanded] = useState(true);

  useEffect(() => {
    setMessageExpanded({});
    setDraftPendingByThread({});
  }, [weddingId]);

  useEffect(() => {
    if (threads.length > 0 && !threads.some((t) => t.id === selectedThreadId)) {
      setSelectedThreadId(threads[0].id);
    }
  }, [threads, selectedThreadId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? threads[0],
    [threads, selectedThreadId],
  );

  const allMessages = useMemo(() => {
    const dbThread = liveThreads.find((t) => t.id === activeThread?.id);
    if (!dbThread) return [];
    const sorted = [...dbThread.messages].sort(
      (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
    );
    return sorted.map(mapMessage);
  }, [liveThreads, activeThread]);

  const earlierMessages = useMemo(
    () => allMessages.filter((msg) => msg.daySegment === "earlier"),
    [allMessages],
  );
  const todayMessages = useMemo(
    () => allMessages.filter((msg) => msg.daySegment === "today"),
    [allMessages],
  );

  const pendingDraft = useMemo(() => {
    const dbThread = liveThreads.find((t) => t.id === activeThread?.id);
    if (!dbThread?.drafts) return null;
    return dbThread.drafts.find((d) => d.status === "pending_approval") ?? null;
  }, [liveThreads, activeThread]);

  const showDraft = pendingDraft !== null;
  const draftDefault = pendingDraft?.body ?? null;

  function toggleMessage(foldKey: string) {
    setMessageExpanded((prev) => ({ ...prev, [foldKey]: !prev[foldKey] }));
  }

  function defaultExpandedForMessage(msg: WeddingThreadMessage): boolean {
    return msg.daySegment === "today";
  }

  function toggleDraftExpanded() {
    setDraftExpanded((expanded) => !expanded);
  }

  const [approvingDraftId, setApprovingDraftId] = useState<string | null>(null);

  async function approveDraft() {
    if (!activeThread || !pendingDraft) return;
    setApprovingDraftId(pendingDraft.id);
    try {
      const { error } = await supabase.functions.invoke("webhook-approval", {
        body: {
          draft_id: pendingDraft.id,
        },
      });
      if (error) throw error;
      setDraftPendingByThread((prev) => ({ ...prev, [activeThread.id]: false }));
      showToast("Message approved and queued for sending.");
      fireDraftsChanged();
    } catch (err) {
      console.error("approveDraft failed:", err);
      showToast("Failed to approve draft. Please try again.");
    } finally {
      setApprovingDraftId(null);
    }
  }

  return {
    threads,
    selectedThreadId,
    setSelectedThreadId,
    activeThread,
    earlierMessages,
    todayMessages,
    draftPendingByThread,
    showDraft,
    draftDefault,
    messageExpanded,
    toggleMessage,
    defaultExpandedForMessage,
    draftExpanded,
    toggleDraftExpanded,
    approveDraft,
    approvingDraftId,
  };
}
