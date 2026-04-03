import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { useInboxMode } from "./InboxModeContext";

export function InboxUrlHydrator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectThread, selectProject } = useInboxMode();
  const { unfiledThreads, isLoading: threadsLoading } = useUnfiledInbox();
  const { drafts, isLoading: draftsLoading } = usePendingApprovals();
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;

    const threadId = searchParams.get("threadId");
    if (!threadId) return;

    const action = searchParams.get("action");
    const isDraftReview = action === "review_draft";

    if (isDraftReview) {
      if (draftsLoading) return;

      const draft = drafts.find((d) => d.id === threadId);
      if (draft) {
        selectProject(draft.wedding_id, draft.couple_names);
      }
    } else {
      if (threadsLoading) return;

      const thread = unfiledThreads.find((t) => t.id === threadId);
      if (thread) {
        selectThread(thread);
      }
    }

    hydrated.current = true;
    setSearchParams({}, { replace: true });
  }, [
    searchParams,
    setSearchParams,
    unfiledThreads,
    threadsLoading,
    drafts,
    draftsLoading,
    selectThread,
    selectProject,
  ]);

  return null;
}
