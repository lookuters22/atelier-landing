import { useCallback, useEffect, useMemo, useRef, useState, type SVGProps } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useInboxSearchInput } from "../../../hooks/useInboxSearchInput";
import { useGoogleConnectedAccount, useInboxGmailLabels } from "../../../hooks/useInboxGmailLabels";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { buildInboxSearchPlaceholder } from "../../../lib/inboxSearchPlaceholder";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { fetchThreadMessagesForInbox, inboxThreadMessagesQueryKey } from "../../../hooks/useThreadMessagesForInbox";
import { useWeddings } from "../../../hooks/useWeddings";
import { useInboxMode } from "./InboxModeContext";
import type { InboxFolder } from "../../../lib/inboxVisibleThreads";
import {
  GMAIL_LABEL_DRAFT,
  GMAIL_LABEL_INBOX,
  GMAIL_LABEL_SENT,
  GMAIL_LABEL_STARRED,
} from "../../../lib/gmailInboxLabels";
import { anaInboxRailGmailLabelSwatch, anaInboxRailProjectSwatch } from "../../../lib/anaInboxRailSwatches";
import { REDESIGN_CTX_GMAIL_LABELS, REDESIGN_CTX_PROJECTS } from "./inboxRedesignLiterals";
import { PaneSectionToggle } from "../../panes/PaneSectionToggle";

const RAIL_HOVER_PREFETCH_MS = 220;

function IconInboxPrimary(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M4 4h16v16H4z" />
      <path d="M4 13h5l2 3h2l2-3h5" />
    </svg>
  );
}
function IconStarred(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5 12 2" />
    </svg>
  );
}
function IconDrafts(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
    </svg>
  );
}
function IconSent(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}
function IconAllMail(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 10l4 4 8-8" />
    </svg>
  );
}

export function InboxContextList() {
  const [projectsRailOpen, setProjectsRailOpen] = useState(true);
  /** Gmail labels collapsed by default; expand when user picks a label filter (see effects below). */
  const [gmailLabelsRailOpen, setGmailLabelsRailOpen] = useState(false);
  const navigate = useNavigate();
  const {
    inboxFolder,
    setInboxFolder,
    projectFilterWeddingId,
    setProjectFilterWeddingId,
    gmailLabelFilterId,
    setGmailLabelFilterId,
    inboxMailScope,
    setInboxMailScope,
    backToList,
  } = useInboxMode();

  useEffect(() => {
    if (projectFilterWeddingId) setProjectsRailOpen(true);
  }, [projectFilterWeddingId]);
  useEffect(() => {
    if (gmailLabelFilterId) setGmailLabelsRailOpen(true);
  }, [gmailLabelFilterId]);

  const { inboxThreads, isLoading: threadsLoading, loadError: inboxLoadError } = useUnfiledInbox();
  const queryClient = useQueryClient();
  const railHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { photographerId, isLoading: authLoading } = useAuth();
  const { data: weddings, isLoading: weddingsLoading, error: weddingsError } = useWeddings(photographerId ?? "");
  const { googleAccount } = useGoogleConnectedAccount(photographerId ?? null);
  const { gmailLabels } = useInboxGmailLabels(photographerId ?? null, googleAccount ?? null);
  const { drafts: pendingApprovalDrafts, isLoading: pendingDraftsLoading } = usePendingApprovals();

  const { inputValue, setInputValue, onSearchBlur, urlHasActiveSearch } = useInboxSearchInput();

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

  const dataLoadError = [inboxLoadError, weddingsError].filter(Boolean).join(" · ") || null;

  const totalCountLabel = useMemo(
    () => (threadsLoading ? "…" : inboxThreads.length.toLocaleString("en-US")),
    [inboxThreads.length, threadsLoading],
  );

  const countLabel = useCallback(
    (n: number) => (threadsLoading ? "…" : n.toLocaleString("en-US")),
    [threadsLoading],
  );

  const primaryInboxCount = useMemo(() => {
    return inboxThreads.filter((t) => {
      if (!t.gmailLabelIds?.length) return true;
      return t.gmailLabelIds.includes(GMAIL_LABEL_INBOX);
    }).length;
  }, [inboxThreads]);

  const starredCount = useMemo(
    () => inboxThreads.filter((t) => t.gmailLabelIds?.includes(GMAIL_LABEL_STARRED)).length,
    [inboxThreads],
  );
  const draftsCount = useMemo(
    () => inboxThreads.filter((t) => t.gmailLabelIds?.includes(GMAIL_LABEL_DRAFT)).length,
    [inboxThreads],
  );
  const sentCount = useMemo(
    () => inboxThreads.filter((t) => t.gmailLabelIds?.includes(GMAIL_LABEL_SENT)).length,
    [inboxThreads],
  );

  const userGmailLabels = useMemo(() => gmailLabels.filter((l) => l.type === "user"), [gmailLabels]);

  const sortedWeddings = useMemo(
    () =>
      [...(weddings ?? [])].sort((a, b) =>
        a.couple_names.localeCompare(b.couple_names, undefined, { sensitivity: "base" }),
      ),
    [weddings],
  );

  const anaDraftsCountLabel = pendingDraftsLoading
    ? "…"
    : pendingApprovalDrafts.length.toLocaleString("en-US");

  const cancelRailHoverPrefetch = useCallback(() => {
    if (railHoverTimerRef.current !== null) {
      clearTimeout(railHoverTimerRef.current);
      railHoverTimerRef.current = null;
    }
  }, []);

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

  const railNeutral = projectFilterWeddingId === null && gmailLabelFilterId === null;

  const onPickFolder = useCallback(
    (id: InboxFolder) => {
      backToList();
      setInboxFolder(id);
      setInboxMailScope("primary");
      setProjectFilterWeddingId(null);
      setGmailLabelFilterId(null);
    },
    [backToList, setInboxFolder, setInboxMailScope, setProjectFilterWeddingId, setGmailLabelFilterId],
  );

  const onPickPrimary = useCallback(() => {
    backToList();
    setInboxFolder("inbox");
    setInboxMailScope("primary");
    setProjectFilterWeddingId(null);
    setGmailLabelFilterId(null);
  }, [backToList, setInboxFolder, setInboxMailScope, setProjectFilterWeddingId, setGmailLabelFilterId]);

  const onPickAllMail = useCallback(() => {
    backToList();
    setInboxFolder("inbox");
    setInboxMailScope("all_mail");
    setProjectFilterWeddingId(null);
    setGmailLabelFilterId(null);
  }, [backToList, setInboxFolder, setInboxMailScope, setProjectFilterWeddingId, setGmailLabelFilterId]);

  const onPickProject = useCallback(
    (weddingId: string) => {
      backToList();
      setInboxFolder("inbox");
      setGmailLabelFilterId(null);
      setProjectFilterWeddingId(weddingId);
    },
    [backToList, setInboxFolder, setGmailLabelFilterId, setProjectFilterWeddingId],
  );

  const onPickGmailUserLabel = useCallback(
    (labelId: string) => {
      backToList();
      setInboxFolder("inbox");
      setProjectFilterWeddingId(null);
      setGmailLabelFilterId(labelId);
    },
    [backToList, setInboxFolder, setGmailLabelFilterId, setProjectFilterWeddingId],
  );

  const primaryActive = inboxFolder === "inbox" && inboxMailScope === "primary" && railNeutral;
  const allMailActive = inboxFolder === "inbox" && inboxMailScope === "all_mail" && railNeutral;

  return (
    <div className="pane ctx flex h-full min-h-0 flex-col overflow-hidden">
      <div className="pane-head">
        <h3>
          Inbox{" "}
          <button type="button" className="count">
            {totalCountLabel}
          </button>
        </h3>
        <div className="search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={onSearchBlur}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          {urlHasActiveSearch ? (
            <span className="kbd" title="Search active from URL">
              URL
            </span>
          ) : (
            <span className="kbd">⌘K</span>
          )}
        </div>
      </div>

      <nav className="ctx-nav" aria-label="Inbox navigation">
        {!authLoading && !photographerId ? (
          <div className="ctx-rail-note" data-tone="warn" role="alert">
            Sign in to load inbox.
          </div>
        ) : null}
        {dataLoadError ? (
          <div className="ctx-rail-note" data-tone="err" role="alert">
            {dataLoadError}
          </div>
        ) : null}

        <button
          type="button"
          className="ctx-item"
          data-active={primaryActive ? "true" : "false"}
          onClick={onPickPrimary}
        >
          <IconInboxPrimary strokeWidth={1.75} />
          Primary <span className="fin-n">{countLabel(primaryInboxCount)}</span>
        </button>
        <button
          type="button"
          className="ctx-item"
          data-active={inboxFolder === "starred" ? "true" : "false"}
          onClick={() => onPickFolder("starred")}
        >
          <IconStarred strokeWidth={1.75} />
          Starred <span className="n">{countLabel(starredCount)}</span>
        </button>
        <button
          type="button"
          className="ctx-item"
          data-active={inboxFolder === "drafts" ? "true" : "false"}
          onClick={() => onPickFolder("drafts")}
        >
          <IconDrafts strokeWidth={1.75} />
          Drafts <span className="fin-n">{countLabel(draftsCount)}</span>
        </button>
        <button
          type="button"
          className="ctx-item"
          data-active={inboxFolder === "sent" ? "true" : "false"}
          onClick={() => onPickFolder("sent")}
        >
          <IconSent strokeWidth={1.75} />
          Sent <span className="n">{countLabel(sentCount)}</span>
        </button>
        <button
          type="button"
          className="ctx-item"
          data-active={allMailActive ? "true" : "false"}
          onClick={onPickAllMail}
        >
          <IconAllMail strokeWidth={1.75} />
          All mail <span className="n">{countLabel(inboxThreads.length)}</span>
        </button>

        <div className="ctx-section-label">Ana routing</div>
        <button
          type="button"
          className="ctx-item"
          data-active="false"
          onClick={() => navigate("/today")}
        >
          <span className="sw" style={{ background: "var(--color-fin)" }} />
          Ana drafts <span className="fin-n">{anaDraftsCountLabel}</span>
        </button>
        <button type="button" className="ctx-item" data-active="false">
          <span className="sw" style={{ background: "var(--color-report-red)" }} />
          Escalations <span className="n">1</span>
        </button>
        <button type="button" className="ctx-item" data-active="false">
          <span className="sw" style={{ background: "var(--color-report-green)" }} />
          Auto-filed <span className="n">48</span>
        </button>

        <PaneSectionToggle
          open={projectsRailOpen}
          onOpenChange={setProjectsRailOpen}
          className="ctx-section-label-toggle"
          replaceBaseClassName
        >
          Projects
        </PaneSectionToggle>
        {projectsRailOpen ? (
          <>
            {sortedWeddings.length > 0
              ? sortedWeddings.slice(0, 24).map((w, i) => (
                  <button
                    key={w.id}
                    type="button"
                    className="ctx-label"
                    data-active={projectFilterWeddingId === w.id ? "true" : "false"}
                    onClick={() => onPickProject(w.id)}
                    onPointerEnter={() => scheduleRailPrefetchForWedding(w.id)}
                    onPointerLeave={cancelRailHoverPrefetch}
                  >
                    <span className="sw" style={{ background: anaInboxRailProjectSwatch(i) }} />
                    {w.couple_names}
                  </button>
                ))
              : !weddingsLoading
                ? REDESIGN_CTX_PROJECTS.map((row) => (
                    <button key={row.label} type="button" className="ctx-label" data-active="false" onClick={() => {}}>
                      <span className="sw" style={{ background: row.sw }} />
                      {row.label}
                    </button>
                  ))
                : null}
            {weddingsLoading ? (
              <p className="ctx-rail-hint" role="status">
                Loading projects…
              </p>
            ) : null}
          </>
        ) : null}

        <PaneSectionToggle
          open={gmailLabelsRailOpen}
          onOpenChange={setGmailLabelsRailOpen}
          className="ctx-section-label-toggle"
          replaceBaseClassName
        >
          Gmail labels
        </PaneSectionToggle>
        {gmailLabelsRailOpen ? (
          <>
            {userGmailLabels.length > 0
              ? userGmailLabels.map((l, i) => (
                  <button
                    key={l.id}
                    type="button"
                    className="ctx-label"
                    data-active={gmailLabelFilterId === l.id ? "true" : "false"}
                    onClick={() => onPickGmailUserLabel(l.id)}
                  >
                    <span className="sw" style={{ background: anaInboxRailGmailLabelSwatch(i) }} />
                    {l.name}
                  </button>
                ))
              : REDESIGN_CTX_GMAIL_LABELS.map((row) => (
                  <button key={row.label} type="button" className="ctx-label" data-active="false" onClick={() => {}}>
                    <span className="sw" style={{ background: row.sw }} />
                    {row.label}
                  </button>
                ))}
          </>
        ) : null}
      </nav>
    </div>
  );
}
