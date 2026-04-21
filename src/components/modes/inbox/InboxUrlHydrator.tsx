import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { findDraftForInboxHydration } from "../../../lib/todayActionFeed";
import {
  INBOX_UNRESOLVED_DRAFT_MESSAGE,
  hasThreadBackedDraftHandoff,
  hasUsableDraftWeddingId,
} from "../../../lib/inboxDraftDeepLink";
import { resolveInboxDeepLinkPayload, clearPersistedInboxDeepLink } from "../../../lib/inboxDeepLinkPersistence";
import {
  shouldSkipInboxHydrationApply,
  shouldStripInboxUrlAfterDraftReviewHydration,
  shouldStripInboxUrlAfterUnfiledThreadHydration,
  signatureForInboxDeepLinkPayload,
} from "../../../lib/inboxUrlHydrationPolicy";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { fetchThreadRowForEscalationDeepLink } from "../../../lib/inboxEscalationDeepLink";
import { stripInboxThreadDeepLinkParams } from "../../../lib/inboxUrlInboxParams";
import { useInboxMode } from "./InboxModeContext";

export function InboxUrlHydrator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectThread, selectProject, setPendingInboxPipelineThreadId, setInboxUrlNotice } = useInboxMode();
  const { inboxThreads, isLoading: threadsLoading } = useUnfiledInbox();
  const { drafts, isLoading: draftsLoading, error: draftsError } = usePendingApprovals();
  /** Same URL must not re-apply project + pending handoff on every drafts rerender (collapses selection to first thread). */
  const processedDeepLinkSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const payload = resolveInboxDeepLinkPayload(searchParams);
    if (!payload?.threadId) {
      processedDeepLinkSignatureRef.current = null;
      return;
    }

    const payloadSignature = signatureForInboxDeepLinkPayload(payload);

    /** Strip thread deep-link keys only (preserves `q` and unrelated params). */
    const stripDeepLinkFromUrlAndSession = () => {
      queueMicrotask(() => {
        if (cancelled) return;
        clearPersistedInboxDeepLink();
        setSearchParams(
          (prev) => stripInboxThreadDeepLinkParams(prev),
          { replace: true },
        );
      });
    };

    const isDraftReview = payload.action === "review_draft";

    if (isDraftReview) {
      if (draftsLoading) return;

      if (draftsError) {
        setInboxUrlNotice(`Could not load pending drafts: ${draftsError}`);
        processedDeepLinkSignatureRef.current = null;
        stripDeepLinkFromUrlAndSession();
        return () => {
          cancelled = true;
        };
      }

      const draft = findDraftForInboxHydration(drafts, {
        threadId: payload.threadId,
        draftId: payload.draftId,
      });
      const hasWedding = draft ? hasUsableDraftWeddingId(draft.wedding_id) : false;
      const hasThreadHandoff = hasThreadBackedDraftHandoff(draft ?? null, payload.threadId);

      if (
        shouldStripInboxUrlAfterDraftReviewHydration({
          draftsFetchError: false,
          draftFound: Boolean(draft),
          hasUsableWeddingId: hasWedding,
          hasThreadBackedHandoff: hasThreadHandoff,
        })
      ) {
        setInboxUrlNotice(INBOX_UNRESOLVED_DRAFT_MESSAGE);
        processedDeepLinkSignatureRef.current = null;
        stripDeepLinkFromUrlAndSession();
        return () => {
          cancelled = true;
        };
      }

      if (!hasWedding && threadsLoading) {
        return () => {
          cancelled = true;
        };
      }

      if (shouldSkipInboxHydrationApply(processedDeepLinkSignatureRef.current, payloadSignature)) {
        return () => {
          cancelled = true;
        };
      }
      processedDeepLinkSignatureRef.current = payloadSignature;

      if (hasWedding) {
        selectProject(draft!.wedding_id, draft!.couple_names);
        const pendingTid = draft!.thread_id?.trim() || payload.threadId?.trim() || null;
        if (pendingTid) {
          setPendingInboxPipelineThreadId(pendingTid);
        }
        return () => {
          cancelled = true;
        };
      }

      const unfiledTid = draft!.thread_id?.trim() || payload.threadId?.trim() || "";
      if (!unfiledTid) {
        setInboxUrlNotice(INBOX_UNRESOLVED_DRAFT_MESSAGE);
        processedDeepLinkSignatureRef.current = null;
        stripDeepLinkFromUrlAndSession();
        return () => {
          cancelled = true;
        };
      }

      const thread = inboxThreads.find((t) => t.id === unfiledTid);
      if (!thread) {
        void (async () => {
          const mapped = await fetchThreadRowForEscalationDeepLink(unfiledTid);
          if (cancelled) return;
          if (!mapped) {
            processedDeepLinkSignatureRef.current = null;
            setInboxUrlNotice(INBOX_UNRESOLVED_DRAFT_MESSAGE);
            stripDeepLinkFromUrlAndSession();
            return;
          }
          selectThread(mapped);
        })();
        return () => {
          cancelled = true;
        };
      }

      if (shouldStripInboxUrlAfterUnfiledThreadHydration(Boolean(thread))) {
        processedDeepLinkSignatureRef.current = null;
        stripDeepLinkFromUrlAndSession();
        return () => {
          cancelled = true;
        };
      }

      selectThread(thread);
      return () => {
        cancelled = true;
      };
    }

    if (threadsLoading) return;

    const thread = inboxThreads.find((t) => t.id === payload.threadId);

    if (!thread) {
      if (shouldSkipInboxHydrationApply(processedDeepLinkSignatureRef.current, payloadSignature)) {
        return () => {
          cancelled = true;
        };
      }
      processedDeepLinkSignatureRef.current = payloadSignature;
      void (async () => {
        const mapped = await fetchThreadRowForEscalationDeepLink(payload.threadId);
        if (cancelled) return;
        if (!mapped) {
          processedDeepLinkSignatureRef.current = null;
          stripDeepLinkFromUrlAndSession();
          return;
        }
        selectThread(mapped);
      })();
      return () => {
        cancelled = true;
      };
    }

    if (shouldStripInboxUrlAfterUnfiledThreadHydration(Boolean(thread))) {
      processedDeepLinkSignatureRef.current = null;
      stripDeepLinkFromUrlAndSession();
      return () => {
        cancelled = true;
      };
    }

    if (shouldSkipInboxHydrationApply(processedDeepLinkSignatureRef.current, payloadSignature)) {
      return () => {
        cancelled = true;
      };
    }
    processedDeepLinkSignatureRef.current = payloadSignature;
    if (!thread) {
      return () => {
        cancelled = true;
      };
    }
    selectThread(thread);

    return () => {
      cancelled = true;
    };
  }, [
    searchParams,
    setSearchParams,
    inboxThreads,
    threadsLoading,
    drafts,
    draftsLoading,
    draftsError,
    selectThread,
    selectProject,
    setPendingInboxPipelineThreadId,
    setInboxUrlNotice,
  ]);

  return null;
}
