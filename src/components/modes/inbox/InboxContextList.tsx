import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, FileEdit, Inbox, PenSquare, Send, Star, Tag } from "lucide-react";
import {
  ContextPaneRoot,
  PaneCountBadge,
  PaneHeaderStrip,
  PaneNavRow,
  PanePrimaryAction,
  PaneScrollRegion,
  PaneSearchInput,
  PaneSectionToggle,
} from "@/components/panes";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { fetchThreadMessagesForInbox, inboxThreadMessagesQueryKey } from "../../../hooks/useThreadMessagesForInbox";
import { useWeddings } from "../../../hooks/useWeddings";
import { useInboxSearchInput } from "../../../hooks/useInboxSearchInput";
import { useGoogleConnectedAccount, useInboxGmailLabels } from "../../../hooks/useInboxGmailLabels";
import { buildInboxSearchPlaceholder } from "../../../lib/inboxSearchPlaceholder";
import { ACTIVE_STAGES, INQUIRY_STAGES } from "../../../lib/inboxVisibleThreads";

const RAIL_HOVER_PREFETCH_MS = 220;
import { useInboxMode } from "./InboxModeContext";
import type { InboxFolder } from "../../../lib/inboxVisibleThreads";

const FOLDERS: { id: InboxFolder; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileEdit },
];

export function InboxContextList() {
  const {
    inboxFolder,
    setInboxFolder,
    listTab,
    setListTab,
    projectFilterWeddingId,
    setProjectFilterWeddingId,
    gmailLabelFilterId,
    setGmailLabelFilterId,
    setScratchComposeOpen,
    backToList,
  } = useInboxMode();

  const { inboxThreads, isLoading: threadsLoading, loadError: inboxLoadError } = useUnfiledInbox();
  const queryClient = useQueryClient();
  const railHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { photographerId, isLoading: authLoading } = useAuth();
  const { data: weddings, isLoading: weddingsLoading, error: weddingsError } = useWeddings(photographerId ?? "");
  const { googleAccount } = useGoogleConnectedAccount(photographerId ?? null);
  const {
    gmailLabels,
    gmailLabelsLoading,
    gmailLabelsFriendlyError,
    gmailLabelsCacheError,
    gmailLabelCacheRefreshing,
    gmailLabelsCacheReadError,
    googleNeedsReconnect,
    refreshGmailLabels,
  } = useInboxGmailLabels(photographerId ?? null, googleAccount ?? null);

  const [inquiriesOpen, setInquiriesOpen] = useState(false);
  const [weddingsOpen, setWeddingsOpen] = useState(true);
  const [labelsOpen, setLabelsOpen] = useState(true);

  const { inputValue, setInputValue, clearSearch, onSearchBlur, urlHasActiveSearch } = useInboxSearchInput();

  const searchPlaceholder = useMemo(
    () =>
      buildInboxSearchPlaceholder({
        inboxFolder,
        gmailLabelFilterId,
        gmailLabels,
        projectFilterWeddingId,
      }),
    [inboxFolder, gmailLabelFilterId, gmailLabels, projectFilterWeddingId],
  );

  const showSearchClear = inputValue.trim().length > 0;

  const dataLoadError = [inboxLoadError, weddingsError].filter(Boolean).join(" · ") || null;

  const inquiries = useMemo(
    () => weddings.filter((w) => INQUIRY_STAGES.has(w.stage)),
    [weddings],
  );

  const active = useMemo(
    () => weddings.filter((w) => ACTIVE_STAGES.has(w.stage)),
    [weddings],
  );

  const threadCount = inboxThreads.length;

  const cancelRailHoverPrefetch = useCallback(() => {
    if (railHoverTimerRef.current !== null) {
      clearTimeout(railHoverTimerRef.current);
      railHoverTimerRef.current = null;
    }
  }, []);

  /** Prefetch one thread’s messages for a likely next open (filter list → read a thread in that project). */
  const prefetchLikelyThreadForWedding = useCallback(
    (weddingId: string) => {
      const first = inboxThreads.find((th) => th.weddingId === weddingId);
      if (!first) return;
      void queryClient.prefetchQuery({
        queryKey: inboxThreadMessagesQueryKey(first.id),
        queryFn: () => fetchThreadMessagesForInbox(first.id),
      });
    },
    [inboxThreads, queryClient],
  );

  const scheduleRailPrefetchForWedding = useCallback(
    (weddingId: string) => {
      if (railHoverTimerRef.current !== null) clearTimeout(railHoverTimerRef.current);
      railHoverTimerRef.current = setTimeout(() => {
        railHoverTimerRef.current = null;
        prefetchLikelyThreadForWedding(weddingId);
      }, RAIL_HOVER_PREFETCH_MS);
    },
    [prefetchLikelyThreadForWedding],
  );

  const onInquiriesNav = useCallback(() => {
    /** Sidebar “Inquiries”: global inquiry list — clear wedding filter so tab semantics apply. */
    backToList();
    setProjectFilterWeddingId(null);
    setGmailLabelFilterId(null);
    setInboxFolder("inbox");
    setListTab("inquiries");
  }, [backToList, setProjectFilterWeddingId, setGmailLabelFilterId, setInboxFolder, setListTab]);

  const onPickFolder = useCallback(
    (id: InboxFolder) => {
      backToList();
      setInboxFolder(id);
      // Mailbox switch: reset secondary filters so folder nav stays the single source of truth.
      setListTab("all");
      setProjectFilterWeddingId(null);
      setGmailLabelFilterId(null);
    },
    [backToList, setInboxFolder, setListTab, setProjectFilterWeddingId, setGmailLabelFilterId],
  );

  const onPickProjectFilter = useCallback(
    (weddingId: string) => {
      backToList();
      setInboxFolder("inbox");
      setGmailLabelFilterId(null);
      setProjectFilterWeddingId((prev) => (prev === weddingId ? null : weddingId));
    },
    [backToList, setInboxFolder, setGmailLabelFilterId, setProjectFilterWeddingId],
  );

  const onPickLabel = useCallback(
    (labelId: string | null) => {
      backToList();
      setInboxFolder("inbox");
      setGmailLabelFilterId(labelId);
    },
    [backToList, setInboxFolder, setGmailLabelFilterId],
  );

  return (
    <ContextPaneRoot withRightBorder={false}>
      <PaneHeaderStrip variant="inbox">
        <PanePrimaryAction icon={PenSquare} onClick={() => setScratchComposeOpen(true)}>
          Compose
        </PanePrimaryAction>
        <PaneSearchInput
          value={inputValue}
          onChange={setInputValue}
          onBlur={onSearchBlur}
          placeholder={searchPlaceholder}
          showClear={showSearchClear}
          onClear={clearSearch}
          padRightForAux={urlHasActiveSearch && !showSearchClear}
          aria-label={searchPlaceholder}
        />
      </PaneHeaderStrip>

      <PaneScrollRegion>
        {!authLoading && !photographerId ? (
          <div
            className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-950 dark:text-amber-100/95"
            role="alert"
          >
            <p className="font-medium">Not signed in</p>
            <p className="mt-1 text-[11px] opacity-90">Sign in to load inbox data.</p>
          </div>
        ) : null}
        {dataLoadError ? (
          <div
            className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-300/95"
            role="alert"
          >
            <p className="font-medium">Could not load data</p>
            <p className="mt-1 font-mono text-[11px] leading-snug break-words">{dataLoadError}</p>
          </div>
        ) : null}

        <nav className="space-y-1" aria-label="Inbox folders">
          {FOLDERS.map(({ id, label, icon: Icon }) => {
            const folderActive = inboxFolder === id;
            return (
              <PaneNavRow
                key={id}
                active={folderActive}
                icon={Icon}
                onClick={() => onPickFolder(id)}
                endAdornment={
                  id === "inbox" && !threadsLoading ? <PaneCountBadge>{threadCount}</PaneCountBadge> : undefined
                }
              >
                {label}
              </PaneNavRow>
            );
          })}
        </nav>

        <div className="mt-5 flex flex-col gap-5">
        <div>
          <PaneSectionToggle open={inquiriesOpen} onOpenChange={setInquiriesOpen}>
            Inquiries
          </PaneSectionToggle>
          {inquiriesOpen ? (
            <>
              <PaneNavRow
                variant="sub"
                active={
                  listTab === "inquiries" &&
                  !projectFilterWeddingId &&
                  inboxFolder === "inbox" &&
                  !gmailLabelFilterId
                }
                onClick={onInquiriesNav}
              >
                All inquiries
              </PaneNavRow>
              {weddingsLoading ? (
                <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>
              ) : inquiries.length === 0 ? (
                <p className="px-3 py-1 text-[12px] text-muted-foreground">No inquiry-stage weddings</p>
              ) : (
                <ul className="mt-0.5 space-y-0.5">
                  {inquiries.map((w) => (
                    <li key={w.id} className="flex items-center gap-0.5">
                      <PaneNavRow
                        variant="nested"
                        active={projectFilterWeddingId === w.id}
                        onClick={() => {
                          prefetchLikelyThreadForWedding(w.id);
                          onPickProjectFilter(w.id);
                        }}
                        onPointerEnter={() => scheduleRailPrefetchForWedding(w.id)}
                        onPointerLeave={cancelRailHoverPrefetch}
                      >
                        {w.couple_names}
                      </PaneNavRow>
                      <Link
                        to={`/pipeline/${w.id}`}
                        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="Open in pipeline"
                        aria-label={`Open ${w.couple_names} in pipeline`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>

        <div>
          <PaneSectionToggle open={weddingsOpen} onOpenChange={setWeddingsOpen}>
            Weddings
          </PaneSectionToggle>
          {weddingsOpen ? (
            weddingsLoading ? (
              <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>
            ) : active.length === 0 ? (
              <p className="px-3 py-1 text-[12px] text-muted-foreground">No active weddings</p>
            ) : (
              <ul className="space-y-0.5">
                {active.map((w) => (
                  <li key={w.id} className="flex items-center gap-0.5">
                    <PaneNavRow
                      variant="nested"
                      active={projectFilterWeddingId === w.id}
                      onClick={() => {
                        prefetchLikelyThreadForWedding(w.id);
                        onPickProjectFilter(w.id);
                      }}
                      onPointerEnter={() => scheduleRailPrefetchForWedding(w.id)}
                      onPointerLeave={cancelRailHoverPrefetch}
                    >
                      {w.couple_names}
                    </PaneNavRow>
                    <Link
                      to={`/pipeline/${w.id}`}
                      className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Open in pipeline"
                      aria-label={`Open ${w.couple_names} in pipeline`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>

        <div>
          <PaneSectionToggle open={labelsOpen} onOpenChange={setLabelsOpen}>
            Labels
          </PaneSectionToggle>
          {labelsOpen ? (
            !googleAccount ? (
              <p className="px-2 py-2 text-[11px] leading-snug text-muted-foreground">
                Connect Google in Settings to load Gmail labels here.
              </p>
            ) : gmailLabelsLoading && gmailLabels.length === 0 && !gmailLabelsCacheReadError ? (
              <p className="px-2 py-2 text-[12px] text-muted-foreground">Loading labels…</p>
            ) : (
              <>
                {googleNeedsReconnect ? (
                  <div className="mb-2 space-y-1 px-2">
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Reconnect Google in Settings to sync Gmail labels.
                      {googleAccount.sync_error_summary ? (
                        <span className="mt-1 block text-[10px] opacity-90">
                          Last error: {googleAccount.sync_error_summary}
                        </span>
                      ) : null}
                    </p>
                    {gmailLabels.length > 0 ? (
                      <p className="text-[10px] text-muted-foreground">Showing cached labels below.</p>
                    ) : null}
                  </div>
                ) : null}
                {gmailLabelsCacheReadError ? (
                  <p className="mb-2 px-2 text-[11px] leading-snug text-muted-foreground">{gmailLabelsCacheReadError}</p>
                ) : null}
                {gmailLabelCacheRefreshing ? (
                  <p className="mb-2 px-2 text-[11px] text-muted-foreground">Label refresh queued or in progress…</p>
                ) : null}
                {gmailLabelsFriendlyError ? (
                  <div className="mb-2 space-y-1.5 px-2 py-1">
                    <p className="text-[11px] leading-snug text-muted-foreground">{gmailLabelsFriendlyError}</p>
                    <button
                      type="button"
                      onClick={() => refreshGmailLabels()}
                      className="text-[11px] font-medium text-foreground underline underline-offset-2"
                    >
                      Retry refresh
                    </button>
                  </div>
                ) : null}
                {!gmailLabelsFriendlyError && gmailLabelsCacheError ? (
                  <p className="px-2 py-1 text-[11px] text-muted-foreground">Last sync note: {gmailLabelsCacheError}</p>
                ) : null}
                {gmailLabels.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-muted-foreground">
                    {gmailLabelsFriendlyError
                      ? "No labels could be loaded from this refresh."
                      : gmailLabelsCacheReadError
                        ? "No labels in cache yet."
                        : googleNeedsReconnect
                          ? "No labels cached yet."
                          : "No labels in cache yet. If you just connected Google, wait a minute or open Settings and run a label sync."}
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                    <li>
                      <PaneNavRow
                        variant="label"
                        active={gmailLabelFilterId === null}
                        onClick={() => onPickLabel(null)}
                      >
                        All labels
                      </PaneNavRow>
                    </li>
                    {gmailLabels.map((lb) => (
                      <li key={lb.id}>
                        <PaneNavRow
                          variant="label"
                          icon={Tag}
                          active={gmailLabelFilterId === lb.id}
                          onClick={() => onPickLabel(lb.id)}
                        >
                          {lb.name}
                        </PaneNavRow>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          ) : null}
        </div>
        </div>
      </PaneScrollRegion>
    </ContextPaneRoot>
  );
}
