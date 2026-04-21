import { useMemo } from "react";
import {
  buildTodayActionsFromSources,
  countTodayActionsByZenTab,
  type TodayAction,
} from "../lib/todayActionFeed";
import { deriveInboxThreadBucket, isSuppressedInboxThread } from "../lib/inboxThreadBucket";
import { INQUIRY_STAGES } from "../lib/inboxVisibleThreads";
import { usePendingApprovals } from "./usePendingApprovals";
import { useUnfiledInbox } from "./useUnfiledInbox";
import { useTasks } from "./useTasks";
import { useOpenEscalations } from "./useOpenEscalations";
import { useWeddings } from "./useWeddings";
import { useAuth } from "../context/AuthContext";

/**
 * Aggregates drafts, inbox threads, open tasks, and open escalations into one read model (no storage merge).
 */
export function useTodayActions() {
  const { photographerId } = useAuth();
  const { drafts, isLoading: ld } = usePendingApprovals();
  const { inboxThreads, todayPriorityUnlinkedThreads, unfiledThreads, isLoading: lu } =
    useUnfiledInbox();
  const { data: weddings, isLoading: lw } = useWeddings(photographerId ?? "");
  const { tasks, isLoading: lt } = useTasks();
  const { escalations, isLoading: le } = useOpenEscalations();

  const stageByWeddingId = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of weddings) {
      if (w.stage) m.set(w.id, w.stage);
    }
    return m;
  }, [weddings]);

  const coupleNamesByWeddingId = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of weddings) {
      m.set(w.id, w.couple_names);
    }
    return m;
  }, [weddings]);

  const linkedLeadThreads = useMemo(() => {
    return inboxThreads.filter((t) => {
      if (!t.weddingId || isSuppressedInboxThread(t)) return false;
      const stage = stageByWeddingId.get(t.weddingId);
      return stage != null && INQUIRY_STAGES.has(stage);
    });
  }, [inboxThreads, stageByWeddingId]);

  const getLinkedLeadSubtitle = useMemo(
    () => (t: (typeof inboxThreads)[number]) => {
      const wid = t.weddingId;
      if (!wid) return "Open lead";
      return coupleNamesByWeddingId.get(wid)?.trim() || "Open lead";
    },
    [coupleNamesByWeddingId],
  );

  const inboxBucketTallies = useMemo(() => {
    const tallies = { inquiry: 0, unfiled: 0, operator_review: 0, suppressed: 0 };
    for (const t of unfiledThreads) {
      tallies[deriveInboxThreadBucket(t)]++;
    }
    return tallies;
  }, [unfiledThreads]);

  const allActions = useMemo(
    () =>
      buildTodayActionsFromSources({
        drafts,
        unfiledThreads: todayPriorityUnlinkedThreads,
        linkedLeadThreads,
        getLinkedLeadSubtitle,
        tasks,
        escalations,
      }),
    [drafts, todayPriorityUnlinkedThreads, linkedLeadThreads, getLinkedLeadSubtitle, tasks, escalations],
  );

  const zenTabCounts = useMemo(() => countTodayActionsByZenTab(allActions), [allActions]);

  const byType = useMemo(() => {
    const draftActions = allActions.filter((a) => a.action_type === "draft_approval");
    const unfiledActions = allActions.filter(
      (a) => a.action_type === "unfiled_thread" || a.action_type === "linked_lead_thread",
    );
    const taskActions = allActions.filter((a) => a.action_type === "open_task");
    const escalationActions = allActions.filter((a) => a.action_type === "open_escalation");
    return { draftActions, unfiledActions, taskActions, escalationActions };
  }, [allActions]);

  return {
    allActions,
    ...byType,
    isLoading: ld || lu || lw || lt || le,
    counts: {
      drafts: drafts.length,
      /** Unlinked threads excluding deterministic suppression (Today + dock inbox badge). */
      unfiled: todayPriorityUnlinkedThreads.length,
      unlinkedTotal: unfiledThreads.length,
      inboxInquiryUnlinked: inboxBucketTallies.inquiry,
      inboxNeedsFilingUnlinked: inboxBucketTallies.unfiled,
      inboxOperatorReviewUnlinked: inboxBucketTallies.operator_review,
      inboxSuppressedUnlinked: inboxBucketTallies.suppressed,
      tasks: tasks.length,
      escalations: escalations.length,
      /** Leads tab = unlinked inquiry threads + linked pre-booking threads (`zenTabCounts.leads`). */
      leads: zenTabCounts.leads,
      zenTabCounts,
    },
  };
}

export type { TodayAction, TodayActionResolution } from "../lib/todayActionFeed";
