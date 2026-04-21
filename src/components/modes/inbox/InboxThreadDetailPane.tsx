import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useThreadMessagesForInbox } from "../../../hooks/useThreadMessagesForInbox";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { useWeddings } from "../../../hooks/useWeddings";
import { useAuth } from "../../../context/AuthContext";
import { useGoogleConnectedAccount } from "../../../hooks/useInboxGmailLabels";
import { extractCoupleNamesForNewInquiry } from "../../../lib/inquiryCoupleNameExtract";
import { deriveStarredFromGmailLabelIds } from "../../../lib/gmailInboxLabels";
import { useInboxMode } from "./InboxModeContext";
import { ConversationFeed } from "../../chat/ConversationFeed";
import { GmailThreadInlineReplyDock, type GmailThreadInlineReplyDockHandle } from "./GmailThreadInlineReplyDock";
import { routingConfidencePercent } from "../../../lib/aiRoutingFormat";
import { InboxReplyActions } from "./InboxReplyActions";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";
import { selectPendingDraftForInboxThread } from "../../../lib/inboxUnfiledPendingDraft";
import { messageFoldKey } from "../../../data/weddingThreads";
import {
  REDESIGN_CRUMB_BOOK,
  REDESIGN_CRUMB_INTENT,
  REDESIGN_CRUMB_MESSAGES,
  REDESIGN_CRUMB_SENDER_LINE,
  REDESIGN_THREAD_H1_FALLBACK,
} from "./inboxRedesignLiterals";

export function InboxThreadDetailPane({ thread }: { thread: UnfiledThread }) {
  return <InboxThreadDetailContent key={thread.id} thread={thread} />;
}

function splitDraftBodyToParagraphs(body: string): string[] {
  const t = body.trim();
  if (!t) return [];
  const byBlank = t
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function formatDraftedAgoFooter(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `drafted ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `drafted ${hrs}h ago`;
  return `drafted ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

function playbookPolicyFooterSlot(reasoning: string | undefined, maxLen: number): string | null {
  const t = reasoning?.trim() ?? "";
  if (!t) return null;
  return t.length <= maxLen ? t : `${t.slice(0, maxLen - 1)}…`;
}

function InboxThreadDetailContent({ thread }: { thread: UnfiledThread }) {
  const navigate = useNavigate();
  const { collapseThreadDetail } = useInboxMode();
  const { refetch, convertThreadToInquiry, gmailInboxModify } = useUnfiledInbox();
  const { photographerId } = useAuth();
  const { googleAccount } = useGoogleConnectedAccount(photographerId ?? null);
  const { data: weddings } = useWeddings(photographerId ?? "");
  const [searchParams] = useSearchParams();
  const { drafts: pendingDrafts } = usePendingApprovals();
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [starBusy, setStarBusy] = useState(false);
  /** Gmail-style: headers toggle message body; only the latest message expanded by default. */
  const [messageExpanded, setMessageExpanded] = useState<Record<string, boolean>>({});
  const gmailDockRef = useRef<GmailThreadInlineReplyDockHandle | null>(null);

  const reviewDraftIdFromUrl =
    searchParams.get("action") === "review_draft" ? searchParams.get("draftId") : null;

  const pendingDraftForThread = useMemo(
    () => selectPendingDraftForInboxThread(pendingDrafts, thread.id, reviewDraftIdFromUrl),
    [pendingDrafts, thread.id, reviewDraftIdFromUrl],
  );

  const linkedWedding = useMemo(() => {
    if (!thread.weddingId || !weddings) return null;
    return weddings.find((w) => w.id === thread.weddingId) ?? null;
  }, [thread.weddingId, weddings]);

  const draftParagraphsLive = useMemo(
    () => splitDraftBodyToParagraphs(pendingDraftForThread?.body ?? ""),
    [pendingDraftForThread?.body],
  );

  const draftRecipientLineLive = useMemo(() => {
    const fromDraft = pendingDraftForThread?.couple_names?.trim() ?? "";
    if (fromDraft && fromDraft.toLowerCase() !== "unknown") return fromDraft;
    if (linkedWedding?.couple_names) return linkedWedding.couple_names;
    const sender = thread.sender?.trim();
    if (sender) {
      const bare = sender.replace(/\s*<[^>]+>\s*$/, "").trim();
      return bare || sender;
    }
    return null;
  }, [pendingDraftForThread, linkedWedding, thread.sender]);

  const intentChip = thread.ai_routing_metadata?.classified_intent?.trim() || "";

  const {
    chatMessages,
    latestProviderMessageId: latestProviderMessageIdFromHistory,
    loading: historyLoading,
    error: historyError,
  } = useThreadMessagesForInbox(thread.id);

  const lastExpandedMessageId = useMemo(() => chatMessages.at(-1)?.id ?? null, [chatMessages]);

  const toggleMessage = useCallback(
    (foldKey: string) => {
      setMessageExpanded((prev) => {
        const msg = chatMessages.find((m) => messageFoldKey(thread.id, m.id) === foldKey);
        const def =
          msg != null && lastExpandedMessageId != null ? msg.id === lastExpandedMessageId : true;
        const cur = prev[foldKey] ?? def;
        return { ...prev, [foldKey]: !cur };
      });
    },
    [chatMessages, lastExpandedMessageId, thread.id],
  );

  const starred = deriveStarredFromGmailLabelIds(thread.gmailLabelIds) ?? false;

  const handleConvert = useCallback(async () => {
    setConvertError(null);
    setConverting(true);
    const extracted = extractCoupleNamesForNewInquiry({
      threadTitle: thread.title,
      latestInboundBody: thread.latestMessageBody,
      snippet: thread.snippet,
      sender: thread.sender,
    });
    const result = await convertThreadToInquiry(thread.id, {
      coupleNames: extracted.coupleNames,
      leadClientName: extracted.leadClientName,
    });
    setConverting(false);
    if (!result.ok) setConvertError(result.error);
  }, [convertThreadToInquiry, thread]);

  const handleStar = useCallback(async () => {
    if (!googleAccount?.id || !thread.latestProviderMessageId) return;
    setStarBusy(true);
    await gmailInboxModify(thread.id, starred ? "unstar" : "star", googleAccount.id, thread.latestProviderMessageId);
    await refetch();
    setStarBusy(false);
  }, [gmailInboxModify, googleAccount, refetch, starred, thread.id, thread.latestProviderMessageId]);

  const draftFooterConfLive = (() => {
    const pct =
      thread.ai_routing_metadata != null
        ? routingConfidencePercent(thread.ai_routing_metadata.confidence_score)
        : null;
    return pct != null ? `${pct}% confidence` : null;
  })();

  const draftFooterAgoLive = formatDraftedAgoFooter(pendingDraftForThread?.created_at);
  const draftFooterPlaybookLive = playbookPolicyFooterSlot(thread.ai_routing_metadata?.reasoning, 48);

  const perMessageReplyFooter = useCallback(
    () => (
      <InboxReplyActions
        onReply={() => gmailDockRef.current?.openReply()}
        onForward={() => gmailDockRef.current?.openForward()}
        variant="inline"
        anaVisuals
      />
    ),
    [],
  );

  const reviewDraftActive = Boolean(
    pendingDraftForThread && reviewDraftIdFromUrl === pendingDraftForThread.id,
  );

  /** `v_pending_approval_drafts` row for this thread — only then show the Ana draft card. */
  const hasAnaDraft = Boolean(pendingDraftForThread);

  const draftWhoForCard = draftRecipientLineLive?.trim() || "Unknown";
  const footConf = draftFooterConfLive ?? "";
  const footAgo = draftFooterAgoLive ?? "";
  const footPlay = draftFooterPlaybookLive ?? "";

  const anaDraftInThreadSlot = hasAnaDraft ? (
    <div className="ana-draft" role="status" data-review-draft={reviewDraftActive ? "true" : undefined}>
      <div className="ana-draft-head">
        <div className="left">
          <div className="badge">
            <span className="dot" />
            Ana drafted · in Elena&apos;s voice
          </div>
          <div className="who-for">
            for <b>{draftWhoForCard}</b>
          </div>
        </div>
        <button type="button" className="btn-ghostline" style={{ fontSize: 11, padding: "4px 8px" }}>
          Regenerate
        </button>
      </div>
      <div className="ana-draft-body">
        {draftParagraphsLive.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <div className="ana-draft-foot">
        <div className="left">
          <span className="conf">{footConf}</span>
          <span>{footAgo}</span>
          <span>{footPlay}</span>
        </div>
        <div className="actions">
          <button type="button" className="btn-ghostline" onClick={() => navigate("/today")}>
            Edit
          </button>
          <button type="button" className="btn-ghostline">
            Schedule
          </button>
          <button type="button" className="btn-send" onClick={() => navigate("/today")}>
            Send &amp; file →
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const senderLine = thread.sender?.trim() ?? "";
  const h1Text = thread.title?.trim() || REDESIGN_THREAD_H1_FALLBACK;
  const crumbIntent = intentChip || REDESIGN_CRUMB_INTENT;
  const crumbBook = linkedWedding?.couple_names?.trim() || REDESIGN_CRUMB_BOOK;
  const crumbSender = senderLine || REDESIGN_CRUMB_SENDER_LINE;
  const crumbMessages =
    chatMessages.length > 0 ? `${chatMessages.length} messages` : REDESIGN_CRUMB_MESSAGES;

  return (
    <div className="thread">
      <header className="thread-head">
        <button type="button" className="back" onClick={collapseThreadDetail} aria-label="Back to inbox list">
          ← back to inbox
        </button>
        <h1>{h1Text}</h1>
        <div className="crumbs">
          <span className="chip-sm">{crumbIntent}</span>
          <span className="chip-sm book">{crumbBook}</span>
          <span>·</span>
          <span>{crumbSender}</span>
          <span>·</span>
          <span>{crumbMessages}</span>
        </div>
        <div className="thread-head-actions">
          <button type="button" className="t-action" disabled={converting || Boolean(thread.weddingId)} onClick={() => void handleConvert()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {converting ? "Creating…" : "Convert to project"}
          </button>
          <button type="button" className="t-action" title="Use Context panel to link to a project">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l1-1" />
            </svg>
            Link
          </button>
          <button
            type="button"
            className="t-action"
            disabled={starBusy || !thread.latestProviderMessageId || !googleAccount?.id}
            onClick={() => void handleStar()}
          >
            <svg viewBox="0 0 24 24" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5 12 2" />
            </svg>
            Star
          </button>
          <button type="button" className="t-action" title="Archive (coming soon)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <rect x="3" y="6" width="18" height="15" rx="1" />
              <path d="M8 6V3h8v3" />
            </svg>
            Archive
          </button>
        </div>
        {convertError ? (
          <p className="convert-err" role="alert">
            {convertError}
          </p>
        ) : null}
      </header>

      {historyError ? <p className="thread-banner-err">Could not load full conversation: {historyError}</p> : null}

      <div className="thread-feed-col">
        <ConversationFeed
          threadSurface="inboxAna"
          earlierMessages={chatMessages}
          todayMessages={[]}
          foldable
          expandedMap={messageExpanded}
          defaultExpanded={(msg) =>
            lastExpandedMessageId != null ? msg.id === lastExpandedMessageId : true
          }
          onToggle={toggleMessage}
          getFoldKey={(msg) => messageFoldKey(thread.id, msg.id)}
          emptyText={historyLoading ? "Loading conversation…" : "No messages in this thread yet."}
          bottomSlot={anaDraftInThreadSlot}
          messageFooter={perMessageReplyFooter}
        />
        <GmailThreadInlineReplyDock
          ref={gmailDockRef}
          threadId={thread.id}
          threadTitle={thread.title}
          hasGmailImport={thread.hasGmailImport}
          latestProviderMessageIdHint={thread.latestProviderMessageId}
          aiRoutingMetadata={thread.ai_routing_metadata}
          afterSuccessfulSend={async () => {
            await refetch();
          }}
          conversationPreload={{
            chatMessages,
            latestProviderMessageIdFromHistory,
            historyLoading,
          }}
          suppressIdleReplyActions
          suppressAiRouting
          anaVisuals
        />
      </div>
    </div>
  );
}
