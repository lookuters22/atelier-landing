import { useLayoutEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useGoogleConnectedAccount } from "../../../hooks/useInboxGmailLabels";
import { useInboxAutoMarkReadOnOpen } from "../../../hooks/useInboxAutoMarkReadOnOpen";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import {
  INBOX_DRAFT_THREAD_NOT_ON_TIMELINE_MESSAGE,
  resolvePendingThreadHandoff,
} from "../../../lib/inboxDraftDeepLink";
import { useInboxMode } from "./InboxModeContext";
import {
  PipelineTimelinePane,
  PipelineWeddingProviderByWeddingId,
  usePipelineWedding,
} from "../pipeline/PipelineWeddingContext";
import { InboxMessageList } from "./InboxMessageList";
import { InboxScratchCompose } from "./InboxScratchCompose";
import { InboxThreadDetailPane } from "./InboxThreadDetailPane";

export function InboxWorkspace() {
  const { selection, inboxUrlNotice, setInboxUrlNotice, scratchComposeOpen, threadDetailOpen } = useInboxMode();
  const listPlusThread = selection.kind === "none" || selection.kind === "thread";
  const twoColumnListCenter = selection.kind === "thread" && threadDetailOpen;
  const { photographerId } = useAuth();
  const { inboxThreads, gmailInboxModify } = useUnfiledInbox();
  const { googleAccount } = useGoogleConnectedAccount(photographerId ?? null);

  useInboxAutoMarkReadOnOpen({
    selection,
    inboxThreads,
    photographerId,
    googleAccountId: googleAccount?.id ?? null,
    gmailInboxModify,
  });

  const [searchParams] = useSearchParams();
  const preferredTimelineThreadId =
    searchParams.get("action") === "review_draft" ? searchParams.get("threadId") : null;

  const shell = (body: ReactNode) => (
    <div className="inbox-workspace-col">
      {inboxUrlNotice ? (
        <div role="status" className="inbox-url-notice">
          <div className="inbox-url-notice-inner">
            <span>{inboxUrlNotice}</span>
            <button type="button" className="inbox-url-notice-dismiss" onClick={() => setInboxUrlNotice(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div
        className={
          listPlusThread && !scratchComposeOpen
            ? twoColumnListCenter
              ? "ana-inbox-center inbox-workspace-center"
              : "ana-inbox-center ana-inbox-center-list-full inbox-workspace-center"
            : "inbox-workspace-center-plain"
        }
      >
        {body}
      </div>
    </div>
  );

  if (selection.kind === "none") {
    if (scratchComposeOpen) return shell(<InboxScratchCompose />);
    return shell(<InboxMessageList />);
  }
  if (selection.kind === "thread") {
    if (!threadDetailOpen) {
      return shell(<InboxMessageList />);
    }
    return shell(
      <>
        <InboxMessageList />
        <InboxThreadDetailPane thread={selection.thread} />
      </>,
    );
  }
  return shell(
    <PipelineWeddingProviderByWeddingId
      weddingId={selection.projectId}
      preferredTimelineThreadId={preferredTimelineThreadId}
    >
      <InboxProjectPipelineChat />
    </PipelineWeddingProviderByWeddingId>,
  );
}

/** Matches Pipeline center pane: tabs, TimelineTab, draft approval, inline reply, composer modal. */
function InboxProjectPipelineChat() {
  const { pendingInboxPipelineThreadId, setPendingInboxPipelineThreadId, setInboxUrlNotice } = useInboxMode();
  const state = usePipelineWedding();

  useLayoutEffect(() => {
    if (!state || !pendingInboxPipelineThreadId) return;
    const { threadState } = state;
    const timelineIds = threadState.threads.map((t) => t.id);
    const outcome = resolvePendingThreadHandoff(pendingInboxPipelineThreadId, timelineIds);
    if (!outcome) {
      setPendingInboxPipelineThreadId(null);
      return;
    }
    if (outcome.kind === "abandon_with_notice") {
      setInboxUrlNotice(INBOX_DRAFT_THREAD_NOT_ON_TIMELINE_MESSAGE);
      setPendingInboxPipelineThreadId(null);
      return;
    }
    threadState.setSelectedThreadId(outcome.threadId);
    setPendingInboxPipelineThreadId(null);
  }, [state, pendingInboxPipelineThreadId, setPendingInboxPipelineThreadId, setInboxUrlNotice]);

  if (!state) {
    return (
      <div className="inbox-pipeline-loading">
        <span>Loading project…</span>
      </div>
    );
  }
  return <PipelineTimelinePane />;
}
