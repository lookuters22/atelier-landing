import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { WEDDING_THREAD_DRAFT_DEFAULT } from "../../../data/weddingThreads";
import { MotionTabContent } from "../../../components/motion-primitives";
import { getTravelForWedding } from "../../../data/weddingTravel";
import { InlineReplyFooter } from "../../../components/wedding-detail/InlineReplyFooter";
import { TimelineTab } from "../../../components/wedding-detail/TimelineTab";
import { WeddingDetailTabContent } from "../../../components/wedding-detail/WeddingDetailTabContent";
import { WeddingTabs } from "../../../components/wedding-detail/WeddingTabs";
import { WeddingComposerModal } from "../../../components/wedding-detail/WeddingComposerModal";
import { WeddingOverviewCard } from "../../../components/wedding-detail/WeddingOverviewCard";
import { WeddingPeopleCard } from "../../../components/wedding-detail/WeddingPeopleCard";
import { WeddingLogisticsCard } from "../../../components/wedding-detail/WeddingLogisticsCard";
import { StoryNotesCard } from "../../../components/wedding-detail/StoryNotesCard";
import { WeddingAttachmentsCard } from "../../../components/wedding-detail/WeddingAttachmentsCard";
import { OtherWeddingsCard } from "../../../components/wedding-detail/OtherWeddingsCard";
import { WeddingManualControlsCard } from "../../../components/wedding-detail/WeddingManualControlsCard";
import { useAuth } from "../../../context/AuthContext";
import { useTimedToast } from "../../../hooks/useTimedToast";
import { useSendMessage } from "../../../hooks/useSendMessage";
import { useWeddingProject, type ThreadWithDrafts, type ProjectTask } from "../../../hooks/useWeddingProject";
import { useWeddingComposer } from "../../../hooks/useWeddingComposer";
import { useWeddingDetailState } from "../../../hooks/useWeddingDetailState";
import { useWeddingThreads } from "../../../hooks/useWeddingThreads";
import { mapRowToEntry } from "../../../pages/WeddingDetailPage";
import type { WeddingEntry } from "../../../data/weddingCatalog";
import type { Tables } from "../../../types/database.types";
import { usePipelineMode } from "./PipelineModeContext";

const DRAFT_DEFAULT = WEDDING_THREAD_DRAFT_DEFAULT;

interface WeddingViewState {
  weddingId: string;
  entry: WeddingEntry;
  liveTasks: ProjectTask[];
  toast: string | null;
  showToast: (msg: string) => void;
  tab: string;
  setTabAndUrl: (t: string) => void;
  detailState: ReturnType<typeof useWeddingDetailState>;
  threadState: ReturnType<typeof useWeddingThreads>;
  composerState: ReturnType<typeof useWeddingComposer>;
  travelPlan: ReturnType<typeof getTravelForWedding>;
}

const Ctx = createContext<WeddingViewState | null>(null);

export function usePipelineWedding() {
  return useContext(Ctx);
}

export function PipelineWeddingProvider({ children }: { children: ReactNode }) {
  const { weddingId } = usePipelineMode();

  if (!weddingId) return <>{children}</>;

  return (
    <PipelineWeddingLoader weddingId={weddingId}>
      {children}
    </PipelineWeddingLoader>
  );
}

/** Same loader + context as pipeline, keyed by an explicit wedding id (Inbox project selection). */
export function PipelineWeddingProviderByWeddingId({
  weddingId,
  children,
}: {
  weddingId: string | null;
  children: ReactNode;
}) {
  if (!weddingId) return <>{children}</>;
  return <PipelineWeddingLoader weddingId={weddingId}>{children}</PipelineWeddingLoader>;
}

function PipelineWeddingLoader({ weddingId, children }: { weddingId: string; children: ReactNode }) {
  const { project, timeline, tasks, isLoading, error } = useWeddingProject(weddingId);
  const { toast, showToast } = useTimedToast();
  const { sendMessage } = useSendMessage();
  const [tab, setTab] = useState("timeline");
  const setTabAndUrl = useCallback((next: string) => setTab(next), []);

  if (isLoading) {
    return (
      <Ctx.Provider value={null}>
        {children}
      </Ctx.Provider>
    );
  }

  if (error || !project) {
    return (
      <Ctx.Provider value={null}>
        {children}
      </Ctx.Provider>
    );
  }

  return (
    <PipelineWeddingInner
      weddingId={weddingId}
      project={project}
      timeline={timeline}
      tasks={tasks}
      toast={toast}
      showToast={showToast}
      sendMessage={sendMessage}
      tab={tab}
      setTabAndUrl={setTabAndUrl}
    >
      {children}
    </PipelineWeddingInner>
  );
}

function PipelineWeddingInner({
  weddingId,
  project,
  timeline,
  tasks,
  toast,
  showToast,
  sendMessage,
  tab,
  setTabAndUrl,
  children,
}: {
  weddingId: string;
  project: any;
  timeline: ThreadWithDrafts[];
  tasks: ProjectTask[];
  toast: string | null;
  showToast: (msg: string) => void;
  sendMessage: ReturnType<typeof useSendMessage>["sendMessage"];
  tab: string;
  setTabAndUrl: (t: string) => void;
  children: ReactNode;
}) {
  const entry = useMemo(() => mapRowToEntry(project), [project]);
  const travelPlan = useMemo(() => getTravelForWedding(weddingId), [weddingId]);
  const detailState = useWeddingDetailState({ weddingId, entry, liveClients: project.clients, showToast });
  const threadState = useWeddingThreads({ weddingId, photographerId: project.photographer_id, liveThreads: timeline, showToast });
  const composerState = useWeddingComposer({
    activeThread: threadState.activeThread,
    people: detailState.people,
    draftPendingByThread: threadState.draftPendingByThread,
    draftDefault: threadState.draftDefault ?? DRAFT_DEFAULT,
    selectedThreadId: threadState.selectedThreadId,
    photographerId: project.photographer_id,
    sendMessage,
    showToast,
  });

  return (
    <Ctx.Provider value={{
      weddingId,
      entry,
      liveTasks: tasks,
      toast,
      showToast,
      tab,
      setTabAndUrl,
      detailState,
      threadState,
      composerState,
      travelPlan,
    }}>
      {children}
    </Ctx.Provider>
  );
}

/** Renders the center pane: tabs + timeline + composer */
export function PipelineTimelinePane() {
  const state = usePipelineWedding();
  if (!state) return null;

  const { weddingId, liveTasks, toast, showToast, tab, setTabAndUrl, threadState, composerState, travelPlan, detailState } = state;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[120] max-w-md -translate-x-1/2 rounded-full border border-border bg-surface px-5 py-2.5 text-[13px] text-foreground">
          {toast}
        </div>
      ) : null}

      <WeddingTabs tab={tab as any} setTabAndUrl={setTabAndUrl as any} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {tab === "timeline" ? (
            <MotionTabContent tabKey="timeline" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TimelineTab
                activeThread={threadState.activeThread}
                threads={threadState.threads}
                earlierMessages={threadState.earlierMessages}
                todayMessages={threadState.todayMessages}
                messageExpanded={threadState.messageExpanded}
                defaultExpandedForMessage={threadState.defaultExpandedForMessage}
                toggleMessage={threadState.toggleMessage}
                setSelectedThreadId={threadState.setSelectedThreadId}
                showDraft={threadState.showDraft}
                draftExpanded={threadState.draftExpanded}
                toggleDraftExpanded={threadState.toggleDraftExpanded}
                approveDraft={threadState.approveDraft}
                isApprovingDraft={threadState.approvingDraftId !== null}
                editDraftInComposer={composerState.editDraftInComposer}
                draftDefault={threadState.draftDefault ?? DRAFT_DEFAULT}
              />
            </MotionTabContent>
          ) : (
            <MotionTabContent tabKey={tab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <WeddingDetailTabContent
                tab={tab as any}
                threads={threadState.threads}
                setSelectedThreadId={threadState.setSelectedThreadId}
                setTabAndUrl={setTabAndUrl as any}
                showToast={showToast}
                weddingId={weddingId}
                travelPlan={travelPlan}
                tasks={liveTasks}
              />
            </MotionTabContent>
          )}
        </AnimatePresence>
      </div>

      <InlineReplyFooter
        replyMeta={composerState.replyMeta}
        replyScope={composerState.replyScope}
        applyReplyScope={composerState.applyReplyScope}
        replyAreaRef={composerState.replyAreaRef}
        replyBody={composerState.replyBody}
        setReplyBody={composerState.setReplyBody}
        submitInlineForApproval={composerState.submitInlineForApproval}
        isInternalNote={composerState.isInternalNote}
        toggleInternalNote={composerState.toggleInternalNote}
        generateInlineResponse={composerState.generateInlineResponse}
        showToast={showToast}
      />

      {composerState.composerOpen ? (
        <WeddingComposerModal
          composerKind={composerState.composerKind}
          weddingCouple={detailState.weddingFields.couple}
          closeComposer={composerState.closeComposer}
          to={composerState.to}
          setTo={composerState.setTo}
          cc={composerState.cc}
          setCc={composerState.setCc}
          subject={composerState.subject}
          setSubject={composerState.setSubject}
          body={composerState.body}
          setBody={composerState.setBody}
          requestAiDraft={composerState.requestAiDraft}
          sendComposer={composerState.sendComposer}
          showToast={showToast}
          internalBody={composerState.internalBody}
          setInternalBody={composerState.setInternalBody}
        />
      ) : null}
    </div>
  );
}

/** Renders the right pane: sidebar cards */
export function PipelineSidebarCards() {
  const state = usePipelineWedding();
  const { photographerId } = useAuth();
  if (!state) return null;

  const { weddingId, entry, detailState, setTabAndUrl } = state;

  return (
    <div className="space-y-4 p-4">
      {photographerId ? (
        <WeddingManualControlsCard weddingId={weddingId} photographerId={photographerId} />
      ) : null}
      <WeddingOverviewCard
        weddingFields={detailState.weddingFields}
        editingWedding={detailState.editingWedding}
        setWeddingFields={detailState.setWeddingFields}
        startEditWedding={detailState.startEditWedding}
        cancelEditWedding={detailState.cancelEditWedding}
        saveEditWedding={detailState.saveEditWedding}
      />
      <WeddingPeopleCard
        people={detailState.people}
        editingPeople={detailState.editingPeople}
        startEditPeople={detailState.startEditPeople}
        cancelEditPeople={detailState.cancelEditPeople}
        saveEditPeople={detailState.saveEditPeople}
        addPersonRow={detailState.addPersonRow}
        removePersonRow={detailState.removePersonRow}
        updatePerson={detailState.updatePerson}
      />
      <WeddingLogisticsCard onOpenTravel={() => setTabAndUrl("travel")} />
      <StoryNotesCard
        story={entry.story}
        summaryBusy={detailState.summaryBusy}
        regenerateSummary={detailState.regenerateSummary}
        photographerNotes={detailState.photographerNotes}
        setPhotographerNotes={detailState.setPhotographerNotes}
      />
      <WeddingAttachmentsCard />
      <OtherWeddingsCard />
    </div>
  );
}
