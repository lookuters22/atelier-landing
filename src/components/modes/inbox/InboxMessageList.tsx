import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useGoogleConnectedAccount } from "../../../hooks/useInboxGmailLabels";
import { useWeddings } from "../../../hooks/useWeddings";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
  weddingQueuePosition,
} from "@/lib/pipelineWeddingListNavigation";
import { deriveVisibleInboxThreads } from "../../../lib/inboxVisibleThreads";
import { useInboxThreadMessagesPrefetch } from "../../../hooks/useInboxThreadMessagesPrefetch";
import { useInboxMode } from "./InboxModeContext";
import { InboxListTabs } from "./InboxListTabs";
import { InboxMessageRow } from "./InboxMessageRow";

export function InboxMessageList() {
  const {
    selection,
    selectThread,
    backToList,
    listTab,
    setListTab,
    inboxFolder,
    projectFilterWeddingId,
    gmailLabelFilterId,
  } = useInboxMode();
  const {
    inboxThreads,
    isLoading: threadsLoading,
    loadError: inboxLoadError,
    deleteThread,
    gmailInboxModify,
    providerMessageIdColumnUnavailable,
  } = useUnfiledInbox();
  const { photographerId, isLoading: authLoading } = useAuth();
  const { googleAccount } = useGoogleConnectedAccount(photographerId ?? null);
  const { data: weddings, isLoading: weddingsLoading, error: weddingsError } = useWeddings(photographerId ?? "");

  const { prefetchThreadMessages, scheduleHoverPrefetch, cancelHoverPrefetch } = useInboxThreadMessagesPrefetch();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const derived = useMemo(
    () =>
      deriveVisibleInboxThreads({
        inboxThreads,
        weddings,
        inboxFolder,
        listTab,
        projectFilterWeddingId,
        gmailLabelFilterId,
      }),
    [inboxThreads, weddings, inboxFolder, listTab, projectFilterWeddingId, gmailLabelFilterId],
  );

  const visibleThreads = derived.threads;
  const orderedThreadIds = useMemo(() => visibleThreads.map((t) => t.id), [visibleThreads]);
  const selectedThreadId = selection.kind === "thread" ? selection.thread.id : null;

  const listScrollRef = useRef<HTMLDivElement>(null);

  const goPrevThread = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedThreadIds, selectedThreadId, -1);
    if (!id) return;
    const t = visibleThreads.find((x) => x.id === id);
    if (t) {
      void prefetchThreadMessages(t.id);
      selectThread(t);
    }
  }, [orderedThreadIds, prefetchThreadMessages, selectedThreadId, visibleThreads, selectThread]);

  const goNextThread = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedThreadIds, selectedThreadId, 1);
    if (!id) return;
    const t = visibleThreads.find((x) => x.id === id);
    if (t) {
      void prefetchThreadMessages(t.id);
      selectThread(t);
    }
  }, [orderedThreadIds, prefetchThreadMessages, selectedThreadId, visibleThreads, selectThread]);

  useEffect(() => {
    if (orderedThreadIds.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = pipelineWeddingAltVerticalDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const id = adjacentWeddingIdInOrderedList(orderedThreadIds, selectedThreadId, delta);
      if (!id) return;
      const t = visibleThreads.find((x) => x.id === id);
      if (!t) return;
      if (id === selectedThreadId) return;
      e.preventDefault();
      e.stopPropagation();
      void prefetchThreadMessages(t.id);
      selectThread(t);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderedThreadIds, prefetchThreadMessages, selectedThreadId, visibleThreads, selectThread]);

  useLayoutEffect(() => {
    if (!selectedThreadId) return;
    const root = listScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-inbox-thread-row="${CSS.escape(selectedThreadId)}"]`);
    if (!(el instanceof HTMLElement)) return;
    scrollPipelineWeddingRowIntoView(el);
  }, [selectedThreadId, orderedThreadIds]);

  const threadQueuePosition = useMemo(
    () => weddingQueuePosition(orderedThreadIds, selectedThreadId),
    [orderedThreadIds, selectedThreadId],
  );

  const handleDelete = useCallback(
    async (threadId: string) => {
      setDeletingId(threadId);
      try {
        await deleteThread(threadId);
        if (selection.kind === "thread" && selection.thread.id === threadId) {
          backToList();
        }
      } finally {
        setDeletingId(null);
      }
    },
    [deleteThread, selection, backToList],
  );

  const dataLoadError = [inboxLoadError, weddingsError].filter(Boolean).join(" · ") || null;
  const tabsDisabled = projectFilterWeddingId != null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <InboxListTabs
        listTab={listTab}
        onChange={setListTab}
        disabled={tabsDisabled}
      />
      {tabsDisabled ? (
        <p className="shrink-0 border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          Tabs apply when no wedding filter is selected. A wedding is selected — showing only threads for that
          project.
        </p>
      ) : null}
      {providerMessageIdColumnUnavailable ? (
        <div
          className="shrink-0 border-b border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground"
          role="status"
        >
          Inbox loaded without Gmail message ids (database migration pending). Star and read sync with Gmail may be
          unavailable until your environment applies migration{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">20260415120100_v_threads_inbox_latest_provider_message_id.sql</code>.
        </div>
      ) : null}

      {derived.folderUsesGmailLabelMetadata && !derived.gmailLabelFilterUnsupported ? (
        <p className="shrink-0 border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          Starred, Sent, and Drafts list threads whose latest message includes Gmail label metadata. Drafts may be rare
          in this view.
        </p>
      ) : null}

      {!threadsLoading && orderedThreadIds.length >= 2 ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            {threadQueuePosition
              ? `${threadQueuePosition.current} / ${threadQueuePosition.total} in view`
              : `${visibleThreads.length} in view`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Previous thread (Alt+↑)"
              aria-label="Previous thread in list"
              onClick={goPrevThread}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              title="Next thread (Alt+↓)"
              aria-label="Next thread in list"
              onClick={goNextThread}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {!authLoading && !photographerId ? (
          <div className="m-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-950 dark:text-amber-100/95" role="alert">
            <p className="font-medium">Not signed in</p>
          </div>
        ) : null}
        {dataLoadError ? (
          <div className="m-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600" role="alert">
            {dataLoadError}
          </div>
        ) : null}

        {derived.gmailLabelFilterUnsupported ? (
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
            <p className="text-[13px] font-medium text-foreground">No Gmail label metadata on threads yet</p>
            <p className="mt-2 max-w-sm text-[12px] text-muted-foreground">
              Label filters apply when imported or modified messages carry{" "}
              <span className="font-medium text-foreground/90">gmail_label_ids</span> on the latest message. Clear the
              label in the sidebar to return to the full list.
            </p>
          </div>
        ) : null}

        {!derived.gmailLabelFilterUnsupported ? (
          threadsLoading || weddingsLoading ? (
            <p className="px-4 py-8 text-[13px] text-muted-foreground">Loading…</p>
          ) : visibleThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <p className="text-[13px] text-muted-foreground">
                {derived.folderUsesGmailLabelMetadata
                  ? "No threads in this folder with synced Gmail labels yet."
                  : "No messages match the current filters."}
              </p>
            </div>
          ) : (
            <ul className="pb-4">
              {visibleThreads.map((t) => (
                <InboxMessageRow
                  key={t.id}
                  thread={t}
                  selected={selection.kind === "thread" && selection.thread.id === t.id}
                  onSelect={() => {
                    void prefetchThreadMessages(t.id);
                    selectThread(t);
                  }}
                  onDelete={() => void handleDelete(t.id)}
                  deleting={deletingId === t.id}
                  googleConnectedAccountId={googleAccount?.id ?? null}
                  onGmailModify={(action) =>
                    gmailInboxModify(t.id, action, googleAccount?.id ?? null, t.latestProviderMessageId)
                  }
                  onHoverPrefetch={() => scheduleHoverPrefetch(t.id)}
                  onHoverPrefetchCancel={cancelHoverPrefetch}
                  onRowFocusPrefetch={() => void prefetchThreadMessages(t.id)}
                />
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
