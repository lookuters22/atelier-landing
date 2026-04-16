import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nextWeddingTimelineThreadId } from "./weddingTimelineThreadSelection";
import { messageFoldKey, type WeddingThread, type WeddingThreadMessage } from "../data/weddingThreads";
import type { Tables } from "../types/database.types";
import type { ThreadWithDrafts } from "./useWeddingProject";
import { supabase } from "../lib/supabase";
import {
  enqueueDraftApprovedForOutbound,
  humanizeDraftApprovalInvokeError,
} from "../lib/draftApprovalClient";
import { fireDataChanged } from "../lib/events";
import { isGmailImportedLatestMessage } from "../lib/gmailInboxLabels";

/** Pipeline / wedding timeline reply surface — avoids flashing legacy footer before Gmail mode is known. */
export type ThreadReplyComposerMode = "gmail" | "legacy" | "pending";

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
  liveThreads,
  showToast,
  /** Inbox draft deep link: canonical URL `threadId` — wins over default `threads[0]` when present in list. */
  preferredTimelineThreadId,
  /** From `useWeddingProject.timelineFetchEpoch` — refetch messages when timeline reloads (drafts, etc.). */
  timelineFetchEpoch = 0,
}: {
  weddingId: string;
  /** Retained for call-site parity; not used in this hook today. */
  photographerId: string;
  liveThreads: DbThread[];
  showToast: (message: string) => void;
  preferredTimelineThreadId?: string | null;
  timelineFetchEpoch?: number;
}) {
  const threads = useMemo(() => liveThreads.map(mapThread), [liveThreads]);

  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [draftPendingByThread, setDraftPendingByThread] = useState<Record<string, boolean>>({});
  const [messageExpanded, setMessageExpanded] = useState<Record<string, boolean>>({});
  const [draftExpanded, setDraftExpanded] = useState(true);
  /** After approve succeeds, hide pending card + show synthetic outbound until DB catches up. */
  const [optimisticOutboundApproval, setOptimisticOutboundApproval] = useState<{
    draftId: string;
    threadId: string;
    body: string;
    tempMessageId: string;
  } | null>(null);
  /**
   * Draft ids the user successfully approved locally. Drives `showDraft` until `liveThreads` no longer
   * lists that draft as `pending_approval` — avoids flashing the pending card when messages refetch before drafts.
   */
  const [locallyApprovedPendingDraftIds, setLocallyApprovedPendingDraftIds] = useState(() => new Set<string>());
  /** True after we picked `threads[0]` while URL preferred a thread not yet present in `liveThreads`. */
  const didAutoPickFirstAwaitingPreferredRef = useRef(false);

  useEffect(() => {
    setMessageExpanded({});
    setDraftPendingByThread({});
    setOptimisticOutboundApproval(null);
    setLocallyApprovedPendingDraftIds(new Set());
    didAutoPickFirstAwaitingPreferredRef.current = false;
  }, [weddingId]);

  useEffect(() => {
    const threadIds = threads.map((t) => t.id);
    const next = nextWeddingTimelineThreadId(
      threadIds,
      selectedThreadId,
      preferredTimelineThreadId,
      didAutoPickFirstAwaitingPreferredRef.current,
    );
    if (!next) return;
    setSelectedThreadId(next.selected);
    didAutoPickFirstAwaitingPreferredRef.current = next.markAwaitingPreferred;
  }, [threads, selectedThreadId, preferredTimelineThreadId]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? threads[0],
    [threads, selectedThreadId],
  );

  /** A1: one thread’s messages at a time — not nested in `useWeddingProject`. */
  const [activeThreadMessages, setActiveThreadMessages] = useState<Tables<"messages">[]>([]);
  const [messagesRefreshNonce, setMessagesRefreshNonce] = useState(0);

  const refreshActiveThreadMessages = useCallback(() => {
    setMessagesRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const tid = activeThread?.id;
    if (!tid) {
      setActiveThreadMessages([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("messages")
      .select("*")
      .eq("thread_id", tid)
      .order("sent_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("useWeddingThreads messages:", error.message);
          setActiveThreadMessages([]);
          return;
        }
        const rows = data ?? [];
        setActiveThreadMessages([...rows].reverse());
      });
    return () => {
      cancelled = true;
    };
  }, [activeThread?.id, timelineFetchEpoch, messagesRefreshNonce]);

  const dbMappedMessages = useMemo(() => {
    if (!activeThread?.id) return [];
    return activeThreadMessages.map((m, idx) => mapMessage(m, idx));
  }, [activeThread?.id, activeThreadMessages]);

  const allMessages = useMemo(() => {
    if (!optimisticOutboundApproval || activeThread?.id !== optimisticOutboundApproval.threadId) {
      return dbMappedMessages;
    }
    const dup = dbMappedMessages.some(
      (m) =>
        m.direction === "out" &&
        typeof m.body === "string" &&
        m.body.trim() === optimisticOutboundApproval.body.trim(),
    );
    if (dup) return dbMappedMessages;
    return [
      ...dbMappedMessages,
      {
        id: optimisticOutboundApproval.tempMessageId,
        threadId: optimisticOutboundApproval.threadId,
        direction: "out" as const,
        sender: "You",
        meta: "Sending…",
        time: formatTime(new Date().toISOString()),
        body: optimisticOutboundApproval.body,
        daySegment: "today" as const,
        sortOrder: dbMappedMessages.length,
      },
    ];
  }, [dbMappedMessages, optimisticOutboundApproval, activeThread?.id]);

  /** Remove local approval dismissals once server no longer exposes that draft as pending (reconciled). */
  useEffect(() => {
    setLocallyApprovedPendingDraftIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const draftId of prev) {
        const stillPending = liveThreads.some((t) =>
          t.drafts?.some((d) => d.id === draftId && d.status === "pending_approval"),
        );
        if (!stillPending) next.delete(draftId);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [liveThreads]);

  /**
   * Drop synthetic "Sending…" row only when outbound exists **and** draft status caught up — not on message-alone timing.
   */
  useEffect(() => {
    setOptimisticOutboundApproval((prev) => {
      if (!prev) return null;
      const bodyTrim = prev.body.trim();
      const stillPending = liveThreads.some(
        (t) =>
          t.id === prev.threadId &&
          t.drafts?.some((d) => d.id === prev.draftId && d.status === "pending_approval"),
      );
      const hasOutbound = activeThreadMessages.some(
        (m) =>
          m.thread_id === prev.threadId &&
          m.direction === "out" &&
          typeof m.body === "string" &&
          m.body.trim() === bodyTrim,
      );
      if (hasOutbound && !stillPending) return null;
      return prev;
    });
  }, [activeThreadMessages, liveThreads]);

  /** Bounded reconciliation poll after approve: refresh messages + drafts until optimistic clears or timeout. */
  useEffect(() => {
    if (!optimisticOutboundApproval) return;
    const tick = () => {
      refreshActiveThreadMessages();
      fireDataChanged("drafts");
    };
    const id = setInterval(tick, 2000);
    const stop = setTimeout(() => clearInterval(id), 8000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [optimisticOutboundApproval?.draftId, optimisticOutboundApproval?.threadId, refreshActiveThreadMessages]);

  /** Clear optimistic row when switching threads within the same wedding. */
  useEffect(() => {
    setOptimisticOutboundApproval((prev) => {
      if (!prev) return null;
      if (!activeThread?.id) return null;
      return prev.threadId === activeThread.id ? prev : null;
    });
  }, [activeThread?.id]);

  /** Newest messages in thread order (default expanded in Gmail-style feed). */
  const defaultExpandedIds = useMemo(() => {
    const ids = allMessages.map((m) => m.id);
    if (ids.length === 0) return new Set<string>();
    return new Set(ids.slice(-2));
  }, [allMessages]);

  /**
   * Which composer to show. Messages fetch wins when loaded; until then, `usesGmailInlineReplyFromTimeline`
   * from `useWeddingProject` + `v_threads_inbox_latest_message` selects Gmail vs legacy without flashing the wrong footer.
   */
  const replyComposerMode = useMemo((): ThreadReplyComposerMode => {
    const tid = activeThread?.id;
    if (!tid) return "pending";
    if (activeThreadMessages.length > 0) {
      const last = activeThreadMessages[activeThreadMessages.length - 1];
      return isGmailImportedLatestMessage(last?.metadata) ? "gmail" : "legacy";
    }
    const row = liveThreads.find((t) => t.id === tid);
    if (row?.usesGmailInlineReplyFromTimeline === true) return "gmail";
    if (row?.usesGmailInlineReplyFromTimeline === false) return "legacy";
    return "pending";
  }, [activeThread?.id, activeThreadMessages, liveThreads]);

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

  /**
   * Pending card: server says pending **and** this draft id was not already approved locally (still awaiting CRM sync).
   * Decoupled from optimistic outbound row — `locallyApprovedPendingDraftIds` is the source of truth for hiding actions.
   */
  const showDraft =
    pendingDraft !== null && !locallyApprovedPendingDraftIds.has(pendingDraft.id);
  const draftDefault = pendingDraft?.body ?? null;

  function toggleMessage(foldKey: string) {
    setMessageExpanded((prev) => {
      const tid = activeThread?.id;
      if (!tid) return prev;
      const msg = allMessages.find((m) => messageFoldKey(tid, m.id) === foldKey);
      const def = msg ? defaultExpandedIds.has(msg.id) : false;
      const cur = prev[foldKey] ?? def;
      return { ...prev, [foldKey]: !cur };
    });
  }

  function defaultExpandedForMessage(msg: WeddingThreadMessage): boolean {
    return defaultExpandedIds.has(msg.id);
  }

  function toggleDraftExpanded() {
    setDraftExpanded((expanded) => !expanded);
  }

  const [approvingDraftId, setApprovingDraftId] = useState<string | null>(null);

  async function approveDraft() {
    if (!activeThread || !pendingDraft) return;
    const draftId = pendingDraft.id;
    const threadId = activeThread.id;
    const body = pendingDraft.body ?? "";
    setApprovingDraftId(draftId);
    try {
      await enqueueDraftApprovedForOutbound(draftId);
      setDraftPendingByThread((prev) => ({ ...prev, [threadId]: false }));
      setLocallyApprovedPendingDraftIds((prev) => new Set(prev).add(draftId));
      setOptimisticOutboundApproval({
        draftId,
        threadId,
        body,
        tempMessageId: `opt-out-${draftId}`,
      });
      showToast("Message approved and queued for sending.");
      fireDataChanged("drafts");
      fireDataChanged("weddings");
      fireDataChanged("inbox");
      refreshActiveThreadMessages();
    } catch (err) {
      console.error("approveDraft failed:", err);
      setOptimisticOutboundApproval(null);
      setLocallyApprovedPendingDraftIds((prev) => {
        if (!prev.has(draftId)) return prev;
        const next = new Set(prev);
        next.delete(draftId);
        return next;
      });
      const msg = await humanizeDraftApprovalInvokeError(err);
      showToast(msg);
    } finally {
      setApprovingDraftId(null);
    }
  }

  return {
    threads,
    selectedThreadId,
    setSelectedThreadId,
    activeThread,
    replyComposerMode,
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
    refreshActiveThreadMessages,
  };
}
