import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EscalationResolutionPanel } from "../../escalations/EscalationResolutionPanel";
import { useAuth } from "../../../context/AuthContext";
import { useThreadMessagesForInbox } from "../../../hooks/useThreadMessagesForInbox";
import { useGoogleConnectedAccount } from "../../../hooks/useInboxGmailLabels";
import { fireDataChanged } from "../../../lib/events";
import { invokeGmailInboxSendReply } from "../../../lib/gmailInboxSend";
import { findMostRecentReplyableExternalParticipant } from "../../../lib/inboxReplyRecipient";
import {
  extractFirstMailboxFromRecipientField,
  mailboxesAreSameMailbox,
  normalizeMailboxForComparison,
} from "../../../lib/mailboxNormalize";
import {
  clearInboxInlineReplyDraft,
  readInboxInlineReplyDraft,
  writeInboxInlineReplyDraft,
  type InboxInlineReplyDraftV1,
} from "../../../lib/inboxInlineReplyDraftStorage";
import type { ChatMessage } from "../../chat/ConversationFeed";
import { InboxInlineReplyComposer } from "./InboxInlineReplyComposer";
import { InboxReplyActions } from "./InboxReplyActions";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";

const DRAFT_SAVE_MS = 400;

type ComposeMode = "idle" | "reply" | "forward";

function emptyDraft(): InboxInlineReplyDraftV1 {
  return {
    body: "",
    to: "",
    cc: "",
    bcc: "",
    showCc: false,
    showBcc: false,
    composeMode: "idle",
  };
}

function initComposeFromThreadId(threadId: string): { mode: ComposeMode; draft: InboxInlineReplyDraftV1 } {
  const saved = readInboxInlineReplyDraft(threadId);
  if (saved) {
    const mode: ComposeMode =
      saved.composeMode === "reply" || saved.composeMode === "forward" ? saved.composeMode : "idle";
    return {
      mode,
      draft: {
        body: saved.body,
        to: saved.to ?? "",
        cc: saved.cc,
        bcc: saved.bcc,
        showCc: saved.showCc,
        showBcc: saved.showBcc,
        composeMode: saved.composeMode,
      },
    };
  }
  return { mode: "idle", draft: emptyDraft() };
}

export type GmailThreadInlineReplyDockProps = {
  threadId: string;
  threadTitle: string;
  hasGmailImport: boolean;
  /** Optional: inbox list projection may know provider id before history loads. */
  latestProviderMessageIdHint?: string | null;
  aiRoutingMetadata?: UnfiledThread["ai_routing_metadata"] | null;
  /** Defaults to `fireDataChanged("inbox")` plus this callback after a successful send. */
  afterSuccessfulSend?: () => void | Promise<void>;
  /**
   * When set (Inbox thread detail), avoids a second `useThreadMessagesForInbox` fetch in the dock.
   * When omitted (Pipeline timeline), the dock loads history itself.
   */
  conversationPreload?: {
    chatMessages: ChatMessage[];
    latestProviderMessageIdFromHistory: string | null;
    historyLoading: boolean;
  };
  /**
   * When true, spacing matches the thread message column (inside `ConversationFeed` last row) instead of a feed footer.
   */
  inlineMessageLayout?: boolean;
  /**
   * When true, idle Reply | Forward is not rendered here — use per-message actions + `ref.openReply()` / `openForward()`.
   */
  suppressIdleReplyActions?: boolean;
};

export type GmailThreadInlineReplyDockHandle = {
  openReply: () => void;
  openForward: () => void;
};

/**
 * Shared Gmail inline reply (reply / forward / compose) used by Inbox thread detail and Pipeline timeline
 * for Gmail-imported threads — same UX as inbox.
 */
export const GmailThreadInlineReplyDock = forwardRef<GmailThreadInlineReplyDockHandle, GmailThreadInlineReplyDockProps>(
  function GmailThreadInlineReplyDock(props, ref) {
    return <GmailThreadInlineReplyDockInner ref={ref} key={props.threadId} {...props} />;
  },
);

const GmailThreadInlineReplyDockInner = forwardRef<GmailThreadInlineReplyDockHandle, GmailThreadInlineReplyDockProps>(
  function GmailThreadInlineReplyDockInner(
    {
      threadId,
      threadTitle,
      hasGmailImport,
      latestProviderMessageIdHint = null,
      aiRoutingMetadata,
      afterSuccessfulSend,
      conversationPreload,
      inlineMessageLayout = false,
      suppressIdleReplyActions = false,
    },
    ref,
  ) {
  const { photographerId } = useAuth();
  const { googleAccount } = useGoogleConnectedAccount(photographerId ?? null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const escalationId = searchParams.get("escalationId");

  const fetched = useThreadMessagesForInbox(conversationPreload ? null : threadId);
  const chatMessages = conversationPreload?.chatMessages ?? fetched.chatMessages;
  const historyLatestProviderMessageId =
    conversationPreload?.latestProviderMessageIdFromHistory ?? fetched.latestProviderMessageId;
  const historyLoading = conversationPreload?.historyLoading ?? fetched.loading;

  const effectiveLatestProviderMessageId =
    historyLatestProviderMessageId ?? latestProviderMessageIdHint ?? null;

  const replyableParticipant = useMemo(
    () => findMostRecentReplyableExternalParticipant(chatMessages, googleAccount?.email ?? null),
    [chatMessages, googleAccount?.email],
  );

  const [seed] = useState(() => initComposeFromThreadId(threadId));
  const [composeMode, setComposeMode] = useState<ComposeMode>(seed.mode);
  const [body, setBody] = useState(seed.draft.body);
  const [to, setTo] = useState(seed.draft.to);
  const [cc, setCc] = useState(seed.draft.cc);
  const [bcc, setBcc] = useState(seed.draft.bcc);
  const [showCc, setShowCc] = useState(seed.draft.showCc);
  const [showBcc, setShowBcc] = useState(seed.draft.showBcc);
  const [lastAutoReplyTo, setLastAutoReplyTo] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      openReply: () => setComposeMode("reply"),
      openForward: () => setComposeMode("forward"),
    }),
    [],
  );

  /* Sync reply "To" with best replyable external participant (same behavior as legacy InboxThreadDetailPane). */
  useEffect(() => {
    const next = replyableParticipant;
    const connected = googleAccount?.email?.trim() ?? "";

    if (!next) {
      return;
    }

    const curNormRaw = extractFirstMailboxFromRecipientField(to);
    const normalizedTo = curNormRaw ? normalizeMailboxForComparison(curNormRaw) : "";

    if (!to.trim()) {
      queueMicrotask(() => {
        setTo(next.displayTo);
        setLastAutoReplyTo(next.normalizedMailbox);
      });
      return;
    }

    if (connected && lastAutoReplyTo === null && mailboxesAreSameMailbox(to, connected)) {
      queueMicrotask(() => {
        setTo(next.displayTo);
        setLastAutoReplyTo(next.normalizedMailbox);
      });
      return;
    }

    if (lastAutoReplyTo === null) {
      return;
    }

    if (normalizedTo !== lastAutoReplyTo) {
      return;
    }

    if (next.normalizedMailbox === lastAutoReplyTo) {
      return;
    }

    queueMicrotask(() => {
      setTo(next.displayTo);
      setLastAutoReplyTo(next.normalizedMailbox);
    });
  }, [replyableParticipant, googleAccount?.email, threadId, to, lastAutoReplyTo]);

  const draftPayload = useMemo(
    (): InboxInlineReplyDraftV1 => ({
      body,
      to,
      cc,
      bcc,
      showCc,
      showBcc,
      composeMode,
    }),
    [body, to, cc, bcc, showCc, showBcc, composeMode],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      writeInboxInlineReplyDraft(threadId, draftPayload);
    }, DRAFT_SAVE_MS);
    return () => window.clearTimeout(t);
  }, [threadId, draftPayload]);

  const replySubject = useMemo(
    () => (threadTitle.startsWith("Re:") ? threadTitle : `Re: ${threadTitle}`),
    [threadTitle],
  );

  const gmailReplyReady = useMemo(() => {
    if (!hasGmailImport || !effectiveLatestProviderMessageId) return false;
    if (!googleAccount?.id) return false;
    const st = googleAccount.sync_status;
    return st === "connected" || st === "syncing";
  }, [hasGmailImport, effectiveLatestProviderMessageId, googleAccount]);

  const sendDisabledReason = useMemo(() => {
    if (composeMode === "forward") return "Forward is not yet sent from Gmail.";
    if (historyLoading && hasGmailImport) return "Loading conversation…";
    if (!googleAccount) return "Connect Google in Settings to send mail.";
    const st = googleAccount.sync_status;
    if (st === "error" || st === "disconnected") {
      return "Reconnect Google in Settings to send mail.";
    }
    if (!hasGmailImport) return "Only Gmail-imported threads can send via Gmail.";
    if (!effectiveLatestProviderMessageId) {
      return "Missing Gmail message id on the latest message — sync or backfill required.";
    }
    if (!historyLoading && chatMessages.length > 0 && !replyableParticipant) {
      return "No replyable external address on this thread — set To manually or wait for sync.";
    }
    return undefined;
  }, [
    composeMode,
    googleAccount,
    hasGmailImport,
    effectiveLatestProviderMessageId,
    historyLoading,
    chatMessages.length,
    replyableParticipant,
  ]);

  const handleDiscard = useCallback(() => {
    clearInboxInlineReplyDraft(threadId);
    const next = findMostRecentReplyableExternalParticipant(chatMessages, googleAccount?.email ?? null);
    setComposeMode("idle");
    setBody("");
    setTo(next?.displayTo ?? "");
    setLastAutoReplyTo(next?.normalizedMailbox ?? null);
    setCc("");
    setBcc("");
    setShowCc(false);
    setShowBcc(false);
    setSendError(null);
  }, [threadId, chatMessages, googleAccount?.email]);

  const handleSend = useCallback(async () => {
    if (composeMode === "forward") return;
    setSendError(null);
    if (!photographerId || !googleAccount?.id) {
      setSendError("Sign in and connect Google to send.");
      return;
    }
    if (!gmailReplyReady) {
      setSendError(sendDisabledReason ?? "Cannot send.");
      return;
    }
    if (!effectiveLatestProviderMessageId) return;
    if (!to.trim()) {
      setSendError("Add a recipient in To.");
      return;
    }
    const bodyText = body.trim();
    if (!bodyText) {
      setSendError("Write a message.");
      return;
    }
    setSending(true);
    const result = await invokeGmailInboxSendReply({
      connectedAccountId: googleAccount.id,
      threadId,
      to: to.trim(),
      cc: cc.trim(),
      bcc: bcc.trim(),
      subject: replySubject,
      body: bodyText,
      inReplyToProviderMessageId: effectiveLatestProviderMessageId,
    });
    setSending(false);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    fireDataChanged("inbox");
    await afterSuccessfulSend?.();
    handleDiscard();
  }, [
    body,
    cc,
    bcc,
    composeMode,
    gmailReplyReady,
    googleAccount,
    handleDiscard,
    photographerId,
    replySubject,
    sendDisabledReason,
    threadId,
    effectiveLatestProviderMessageId,
    to,
    afterSuccessfulSend,
  ]);

  const gutter = inlineMessageLayout ? "px-0" : "mx-5";

  return (
    <>
      {aiRoutingMetadata ? (
        <div className={`${gutter} mb-2 rounded-lg border border-border bg-accent/50 p-3`}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">AI Routing</p>
          <p className="text-[12px] text-muted-foreground">
            Intent: {aiRoutingMetadata.classified_intent} &middot;{" "}
            {Math.round(aiRoutingMetadata.confidence_score * 100)}% confidence
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">{aiRoutingMetadata.reasoning}</p>
        </div>
      ) : null}

      {escalationId ? (
        <div className={`${gutter} mb-3`}>
          <EscalationResolutionPanel
            escalationId={escalationId}
            onResolved={() => {
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("escalationId");
                  return next;
                },
                { replace: true },
              );
            }}
          />
        </div>
      ) : null}

      {composeMode === "idle" ? (
        suppressIdleReplyActions ? null : (
          <InboxReplyActions
            onReply={() => setComposeMode("reply")}
            onForward={() => setComposeMode("forward")}
            variant={inlineMessageLayout ? "inline" : "feed"}
          />
        )
      ) : (
        <>
          {sendError ? (
            <p
              className="mx-5 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
              role="alert"
              aria-live="polite"
            >
              {sendError}
            </p>
          ) : null}
          <InboxInlineReplyComposer
            layout={inlineMessageLayout ? "message" : "feed"}
            variant={composeMode === "forward" ? "forward" : "reply"}
            threadId={threadId}
            to={to}
            onToChange={setTo}
            cc={cc}
            onCcChange={setCc}
            bcc={bcc}
            onBccChange={setBcc}
            showCc={showCc}
            showBcc={showBcc}
            onToggleCc={() => setShowCc((s) => !s)}
            onToggleBcc={() => setShowBcc((s) => !s)}
            body={body}
            onBodyChange={setBody}
            onDiscard={handleDiscard}
            onSend={handleSend}
            sendDisabled={composeMode === "forward" || !gmailReplyReady || Boolean(sendDisabledReason)}
            sendDisabledReason={sendDisabledReason}
            sending={sending}
          />
        </>
      )}
    </>
  );
  },
);
