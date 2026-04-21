import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useGoogleConnectedAccount, useInboxGmailLabels } from "../../../hooks/useInboxGmailLabels";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { useWeddings } from "../../../hooks/useWeddings";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
} from "@/lib/pipelineWeddingListNavigation";
import { deriveInboxListHeadCounts, deriveVisibleInboxThreads } from "../../../lib/inboxVisibleThreads";
import { deriveUnreadFromGmailLabelIds } from "../../../lib/gmailInboxLabels";
import { useInboxThreadMessagesPrefetch } from "../../../hooks/useInboxThreadMessagesPrefetch";
import { useInboxMode } from "./InboxModeContext";
import { InboxListTabs } from "./InboxListTabs";
import { InboxMessageRow } from "./InboxMessageRow";

export function InboxMessageList() {
  const {
    selection,
    selectThread,
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
    gmailInboxModify,
    refetch,
  } = useUnfiledInbox();
  const { photographerId, isLoading: authLoading } = useAuth();
  const { googleAccount } = useGoogleConnectedAccount(photographerId ?? null);
  const { gmailLabels } = useInboxGmailLabels(photographerId ?? null, googleAccount ?? null);
  const { drafts: pendingApprovalDrafts } = usePendingApprovals();
  const { data: weddings, isLoading: weddingsLoading, error: weddingsError } = useWeddings(photographerId ?? "");

  const { prefetchThreadMessages, scheduleHoverPrefetch, cancelHoverPrefetch } = useInboxThreadMessagesPrefetch();

  const weddingNamesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of weddings ?? []) m.set(w.id, w.couple_names);
    return m;
  }, [weddings]);

  const weddingStageById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of weddings ?? []) {
      if (w.stage) m.set(w.id, w.stage);
    }
    return m;
  }, [weddings]);

  const draftThreadIds = useMemo(
    () => new Set(pendingApprovalDrafts.map((d) => d.thread_id)),
    [pendingApprovalDrafts],
  );

  const [refreshing, setRefreshing] = useState(false);

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

  const listHeadCounts = useMemo(
    () =>
      deriveInboxListHeadCounts({
        inboxThreads,
        inboxFolder,
        projectFilterWeddingId,
        gmailLabelFilterId,
      }),
    [inboxThreads, inboxFolder, projectFilterWeddingId, gmailLabelFilterId],
  );

  const visibleThreads = derived.threads;
  const orderedThreadIds = useMemo(() => visibleThreads.map((t) => t.id), [visibleThreads]);
  const selectedThreadId = selection.kind === "thread" ? selection.thread.id : null;

  const listScrollRef = useRef<HTMLUListElement>(null);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const listMetaLeft = useMemo(() => {
    const n = visibleThreads.length;
    const unread = visibleThreads.filter((t) => deriveUnreadFromGmailLabelIds(t.gmailLabelIds)).length;
    if (n === 0) return "No threads in view";
    return `${n} thread${n === 1 ? "" : "s"} · ${unread} unread`;
  }, [visibleThreads]);

  const dataLoadError = [inboxLoadError, weddingsError].filter(Boolean).join(" · ") || null;
  const tabsDisabled = projectFilterWeddingId != null;

  return (
    <div className="inbox-message-list-col">
      <div className="list-head">
        <InboxListTabs
          listTab={listTab}
          onChange={setListTab}
          disabled={tabsDisabled}
          counts={
            listHeadCounts.unsupported
              ? { all: 0, unread: 0, needs_reply: 0 }
              : { all: listHeadCounts.all, unread: listHeadCounts.unread, needs_reply: listHeadCounts.needs_reply }
          }
        />
        {!threadsLoading && !weddingsLoading && !derived.gmailLabelFilterUnsupported ? (
          <>
            <div className="list-meta">
              <div className="left">{listMetaLeft}</div>
              <button type="button" className="act" disabled={refreshing} onClick={() => void handleRefresh()}>
                ↻ Sync
              </button>
            </div>
          </>
        ) : null}
      </div>

      <ul ref={listScrollRef} className="list">
        {!authLoading && !photographerId ? (
          <li className="list-note" data-tone="warn" role="alert">
            Sign in to load inbox.
          </li>
        ) : null}
        {dataLoadError ? (
          <li className="list-note" data-tone="err" role="alert">
            {dataLoadError}
          </li>
        ) : null}

        {derived.gmailLabelFilterUnsupported ? (
          <li className="list-note" role="status">
            No threads match this label until Gmail label ids sync on messages. Clear the label filter in the sidebar.
          </li>
        ) : null}

        {!derived.gmailLabelFilterUnsupported ? (
          threadsLoading || weddingsLoading ? (
            <li className="list-note" role="status">
              Loading…
            </li>
          ) : visibleThreads.length === 0 ? (
            <li className="list-note" role="status">
              {derived.folderUsesGmailLabelMetadata
                ? "No threads in this folder with synced Gmail labels yet."
                : "No messages match the current filters."}
            </li>
          ) : (
            visibleThreads.map((t) => (
              <InboxMessageRow
                key={t.id}
                thread={t}
                selected={selection.kind === "thread" && selection.thread.id === t.id}
                onSelect={() => {
                  void prefetchThreadMessages(t.id);
                  selectThread(t);
                }}
                googleConnectedAccountId={googleAccount?.id ?? null}
                onGmailModify={(action) =>
                  gmailInboxModify(t.id, action, googleAccount?.id ?? null, t.latestProviderMessageId)
                }
                onHoverPrefetch={() => scheduleHoverPrefetch(t.id)}
                onHoverPrefetchCancel={cancelHoverPrefetch}
                onRowFocusPrefetch={() => void prefetchThreadMessages(t.id)}
                gmailLabelCatalog={gmailLabels}
                linkedCoupleNames={t.weddingId ? weddingNamesById.get(t.weddingId) ?? null : null}
                linkedWeddingStage={t.weddingId ? weddingStageById.get(t.weddingId) ?? null : null}
                hasPendingDraft={draftThreadIds.has(t.id)}
              />
            ))
          )
        ) : null}
      </ul>
    </div>
  );
}
