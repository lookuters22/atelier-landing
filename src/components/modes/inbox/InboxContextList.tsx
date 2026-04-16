import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileEdit,
  Inbox,
  PenSquare,
  Search,
  Send,
  Star,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

  /**
   * “Open in inbox” (list): filter threads by wedding and stay in the standard inbox list/detail — not `selectProject` pipeline timeline.
   * Full CRM timeline remains via `/pipeline/:id` links in the sidebar.
   */
  const onOpenProjectInInboxList = useCallback(
    (weddingId: string) => {
      backToList();
      setInboxFolder("inbox");
      setGmailLabelFilterId(null);
      setListTab("all");
      setProjectFilterWeddingId(weddingId);
    },
    [backToList, setInboxFolder, setGmailLabelFilterId, setListTab, setProjectFilterWeddingId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col text-[13px] text-foreground">
      <div className="shrink-0 space-y-2 border-b border-border/60 p-2">
        <button
          type="button"
          onClick={() => setScratchComposeOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-2.5 text-[13px] font-semibold text-background shadow-sm transition hover:opacity-90"
        >
          <PenSquare className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Compose
        </button>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={onSearchBlur}
            placeholder={searchPlaceholder}
            className={cn(
              "w-full rounded-md border border-border bg-background py-1.5 pl-8 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring",
              showSearchClear || urlHasActiveSearch ? "pr-8" : "pr-2.5",
            )}
            aria-label={searchPlaceholder}
          />
          {showSearchClear ? (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
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
              <button
                key={id}
                type="button"
                onClick={() => onPickFolder(id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] transition-colors",
                  folderActive
                    ? "bg-foreground/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1">{label}</span>
                {id === "inbox" && !threadsLoading ? (
                  <span className="text-[11px] tabular-nums text-muted-foreground">{threadCount}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="mt-5">
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inquiries
          </p>
          <button
            type="button"
            onClick={onInquiriesNav}
            className={cn(
              "flex w-full items-center rounded-full px-3 py-2 text-left text-[13px] transition-colors",
              listTab === "inquiries" && !projectFilterWeddingId && inboxFolder === "inbox" && !gmailLabelFilterId
                ? "bg-foreground/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
            )}
          >
            All inquiries
          </button>
          {weddingsLoading ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>
          ) : inquiries.length === 0 ? (
            <p className="px-3 py-1 text-[12px] text-muted-foreground">No inquiry-stage weddings</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {inquiries.map((w) => (
                <li key={w.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      prefetchLikelyThreadForWedding(w.id);
                      onPickProjectFilter(w.id);
                    }}
                    onPointerEnter={() => scheduleRailPrefetchForWedding(w.id)}
                    onPointerLeave={cancelRailHoverPrefetch}
                    className={cn(
                      "min-w-0 flex-1 rounded-full px-3 py-1.5 text-left text-[12px] transition-colors",
                      projectFilterWeddingId === w.id
                        ? "bg-foreground/10 font-medium text-foreground"
                        : "text-foreground/90 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="truncate">{w.couple_names}</span>
                  </button>
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
        </div>

        <div className="mt-5">
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Weddings
          </p>
          {weddingsLoading ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>
          ) : active.length === 0 ? (
            <p className="px-3 py-1 text-[12px] text-muted-foreground">No active weddings</p>
          ) : (
            <ul className="space-y-0.5">
              {active.map((w) => (
                <li key={w.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      prefetchLikelyThreadForWedding(w.id);
                      onPickProjectFilter(w.id);
                    }}
                    onPointerEnter={() => scheduleRailPrefetchForWedding(w.id)}
                    onPointerLeave={cancelRailHoverPrefetch}
                    className={cn(
                      "min-w-0 flex-1 rounded-full px-3 py-1.5 text-left text-[12px] transition-colors",
                      projectFilterWeddingId === w.id
                        ? "bg-foreground/10 font-medium text-foreground"
                        : "text-foreground/90 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="truncate">{w.couple_names}</span>
                  </button>
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
        </div>

        <div className="mt-5 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setLabelsOpen((o) => !o)}
            className="mb-1 flex w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            aria-expanded={labelsOpen}
          >
            {labelsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            )}
            Labels
          </button>
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
                      <button
                        type="button"
                        onClick={() => onPickLabel(null)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left text-[12px]",
                          gmailLabelFilterId === null
                            ? "bg-foreground/10 font-medium"
                            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                        )}
                      >
                        All labels
                      </button>
                    </li>
                    {gmailLabels.map((lb) => (
                      <li key={lb.id}>
                        <button
                          type="button"
                          onClick={() => onPickLabel(lb.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left text-[12px]",
                            gmailLabelFilterId === lb.id
                              ? "bg-foreground/10 font-medium"
                              : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                          )}
                        >
                          <Tag className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
                          <span className="min-w-0 truncate">{lb.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          ) : null}
        </div>

        <div className="mt-6 border-t border-border/60 pt-3">
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Open in inbox
          </p>
          <p className="px-2 pb-2 text-[11px] leading-snug text-muted-foreground">
            Filter the thread list to this project. For the full CRM timeline and pipeline tools, use{" "}
            <span className="font-medium text-foreground/90">Open in pipeline</span> beside each name above.
          </p>
          {weddingsLoading ? null : (
            <ul className="space-y-0.5">
              {[...inquiries, ...active]
                .filter((w, i, arr) => arr.findIndex((x) => x.id === w.id) === i)
                .slice(0, 8)
                .map((w) => (
                  <li key={`open-${w.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        prefetchLikelyThreadForWedding(w.id);
                        onOpenProjectInInboxList(w.id);
                      }}
                      onPointerEnter={() => scheduleRailPrefetchForWedding(w.id)}
                      onPointerLeave={cancelRailHoverPrefetch}
                      className={cn(
                        "w-full rounded-full px-3 py-1.5 text-left text-[12px] transition-colors",
                        projectFilterWeddingId === w.id
                          ? "bg-foreground/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]",
                      )}
                    >
                      {w.couple_names}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
