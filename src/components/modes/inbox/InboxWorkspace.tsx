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
  const { selection, inboxUrlNotice, setInboxUrlNotice, scratchComposeOpen } = useInboxMode();
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
    <div className="flex h-full min-h-0 flex-col bg-background">
      {inboxUrlNotice ? (
        <div
          role="status"
          className="shrink-0 border-b border-amber-200/90 bg-amber-50 px-4 py-2.5 text-[12px] leading-snug text-amber-950"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{inboxUrlNotice}</span>
            <button
              type="button"
              className="shrink-0 text-[12px] font-medium text-amber-900 underline underline-offset-2"
              onClick={() => setInboxUrlNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
    </div>
  );

  if (selection.kind === "none") {
    if (scratchComposeOpen) return shell(<InboxScratchCompose />);
    return shell(<InboxMessageList />);
  }
  if (selection.kind === "thread") return shell(<InboxThreadDetailPane thread={selection.thread} />);
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

  /** Layout phase so target thread wins before `useWeddingThreads`’s effect can default to `threads[0]`. */
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
      <div className="flex h-full items-center justify-center bg-background">
        <span className="text-[13px] text-muted-foreground">Loading wedding…</span>
      </div>
    );
  }
  return <PipelineTimelinePane />;
}
