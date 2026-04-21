import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { WEDDING_THREAD_DRAFT_DEFAULT, getMessagesForThread } from "../../../data/weddingThreads";
import { getTravelForWedding, type WeddingTravelPlan } from "../../../data/weddingTravel";
import { InlineReplyFooter } from "../../../components/wedding-detail/InlineReplyFooter";
import { WeddingComposerModal } from "../../../components/wedding-detail/WeddingComposerModal";
import { TravelTabPanel } from "../../../components/TravelTabPanel";
import { WeddingFinancialsPanel } from "../../../components/WeddingFinancialsPanel";
import { snippetForThreadRow } from "../../../lib/threadMessageSnippet";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTimedToast } from "../../../hooks/useTimedToast";
import { useSendMessage } from "../../../hooks/useSendMessage";
import { useWeddingProject, type ThreadWithDrafts, type ProjectTask } from "../../../hooks/useWeddingProject";
import { useWeddingComposer } from "../../../hooks/useWeddingComposer";
import { useWeddingDetailState } from "../../../hooks/useWeddingDetailState";
import { useWeddingThreads } from "../../../hooks/useWeddingThreads";
import { mapRowToEntry } from "../../../pages/WeddingDetailPage";
import type { WeddingEntry } from "../../../data/weddingCatalog";
import { EscalationResolutionPanel } from "../../escalations/EscalationResolutionPanel";
import { fireDataChanged } from "../../../lib/events";
import { GmailThreadInlineReplyDock, type GmailThreadInlineReplyDockHandle } from "../inbox/GmailThreadInlineReplyDock";
import { usePipelineMode } from "./PipelineModeContext";
import { PipelineUrlHydrator } from "./PipelineUrlHydrator";
import { PipelineCenterTimeline, stageRailSteps } from "./PipelineCenterTimeline";
import { isNonWeddingProjectType, projectTypeBadgeLabel } from "@/lib/projectTypeDisplay";

const DRAFT_DEFAULT = WEDDING_THREAD_DRAFT_DEFAULT;

export const PIPELINE_TAB_IDS = [
  "overview",
  "threads",
  "tasks",
  "files",
  "finance",
  "travel",
  "event",
  "people",
] as const;

export type PipelineWorkspaceTabId = (typeof PIPELINE_TAB_IDS)[number];

const LEGACY_PIPELINE_TAB: Record<string, PipelineWorkspaceTabId> = {
  timeline: "overview",
  thread: "threads",
  financials: "finance",
};

export function normalizePipelineTab(raw: string | null): PipelineWorkspaceTabId {
  if (!raw) return "overview";
  const v = raw.trim().toLowerCase();
  if (v in LEGACY_PIPELINE_TAB) return LEGACY_PIPELINE_TAB[v]!;
  if ((PIPELINE_TAB_IDS as readonly string[]).includes(v)) return v as PipelineWorkspaceTabId;
  return "overview";
}

function formatPipelineStageLabel(stage: string): string {
  return stage.replace(/_/g, " ");
}

function taskIsDone(t: ProjectTask): boolean {
  return /done|complete/i.test(t.status);
}

function taskDueSoon(iso: string): boolean {
  const due = new Date(iso).getTime();
  const now = Date.now();
  return due - now < 1000 * 60 * 60 * 72 && due > now;
}

function formatTaskDueShort(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay.getTime() === todayStart.getTime()) return "Today";
  if (dueDay.getTime() < todayStart.getTime()) return "Overdue";
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntilFromWhenLabel(when: string | undefined): number | null {
  if (!when || when === "—") return null;
  const parsed = Date.parse(when);
  if (Number.isNaN(parsed)) return null;
  return Math.ceil((parsed - Date.now()) / 86400000);
}

function travelSegmentCount(plan: WeddingTravelPlan | null): number {
  if (!plan) return 0;
  const itin =
    plan.itineraryDays?.reduce((acc, d) => acc + d.segments.length, 0) ?? 0;
  return plan.flights.length + plan.hotels.length + plan.ground.length + itin;
}

interface WeddingViewState {
  weddingId: string;
  entry: WeddingEntry;
  /** Row classification (`weddings.project_type`); `wedding` is the default first-class wedding lead. */
  projectType: string;
  liveTasks: ProjectTask[];
  toast: string | null;
  showToast: (msg: string) => void;
  tab: PipelineWorkspaceTabId;
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
  const [searchParams] = useSearchParams();
  const preferredTimelineThreadId = weddingId ? searchParams.get("threadId") : null;

  if (!weddingId) return <>{children}</>;

  return (
    <PipelineWeddingLoader weddingId={weddingId} preferredTimelineThreadId={preferredTimelineThreadId}>
      {children}
    </PipelineWeddingLoader>
  );
}

/** Same loader + context as pipeline, keyed by an explicit wedding id (Inbox project selection). */
export function PipelineWeddingProviderByWeddingId({
  weddingId,
  preferredTimelineThreadId = null,
  children,
}: {
  weddingId: string | null;
  /** Inbox `?threadId=` for `review_draft` — honored over blind first-thread selection in `useWeddingThreads`. */
  preferredTimelineThreadId?: string | null;
  children: ReactNode;
}) {
  if (!weddingId) return <>{children}</>;
  return (
    <PipelineWeddingLoader weddingId={weddingId} preferredTimelineThreadId={preferredTimelineThreadId}>
      {children}
    </PipelineWeddingLoader>
  );
}

function PipelineWeddingLoader({
  weddingId,
  preferredTimelineThreadId = null,
  children,
}: {
  weddingId: string;
  preferredTimelineThreadId?: string | null;
  children: ReactNode;
}) {
  const { project, timeline, tasks, error, timelineFetchEpoch } = useWeddingProject(weddingId);
  const { toast, showToast } = useTimedToast();
  const { sendMessage } = useSendMessage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<PipelineWorkspaceTabId>(() => normalizePipelineTab(searchParams.get("tab")));
  const setTabAndUrl = useCallback(
    (next: string) => {
      const t = normalizePipelineTab(next);
      setTab(t);
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("tab", t);
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /** First load only — background refetch keeps `project` so context stays mounted (matches `WeddingDetailPage`). */
  if (!project && !error) {
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
      preferredTimelineThreadId={preferredTimelineThreadId}
      timelineFetchEpoch={timelineFetchEpoch}
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
  preferredTimelineThreadId = null,
  timelineFetchEpoch,
  children,
}: {
  weddingId: string;
  project: any;
  timeline: ThreadWithDrafts[];
  tasks: ProjectTask[];
  toast: string | null;
  showToast: (msg: string) => void;
  sendMessage: ReturnType<typeof useSendMessage>["sendMessage"];
  tab: PipelineWorkspaceTabId;
  setTabAndUrl: (t: string) => void;
  preferredTimelineThreadId?: string | null;
  timelineFetchEpoch: number;
  children: ReactNode;
}) {
  const entry = useMemo(() => mapRowToEntry(project), [project]);
  const travelPlan = useMemo(() => getTravelForWedding(weddingId), [weddingId]);
  const detailState = useWeddingDetailState({ weddingId, entry, liveClients: project.clients, showToast });
  const threadState = useWeddingThreads({
    weddingId,
    photographerId: project.photographer_id,
    liveThreads: timeline,
    showToast,
    preferredTimelineThreadId,
    timelineFetchEpoch,
  });
  const composerState = useWeddingComposer({
    activeThread: threadState.activeThread,
    people: detailState.people,
    draftPendingByThread: threadState.draftPendingByThread,
    draftDefault: threadState.draftDefault ?? DRAFT_DEFAULT,
    selectedThreadId: threadState.selectedThreadId,
    photographerId: project.photographer_id,
    sendMessage,
    showToast,
    onAfterMessageSent: threadState.refreshActiveThreadMessages,
  });

  return (
    <Ctx.Provider value={{
      weddingId,
      entry,
      projectType: project.project_type ?? "wedding",
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
      <PipelineUrlHydrator />
      {children}
    </Ctx.Provider>
  );
}

type PipelineFileFolderId =
  | "all"
  | "contracts"
  | "inspiration"
  | "timelines"
  | "invoices"
  | "shotlist"
  | "custom";

const FILES_FOLDER_TITLE: Record<PipelineFileFolderId, string> = {
  all: "Contracts",
  contracts: "Contracts",
  inspiration: "Inspiration & references",
  timelines: "Timelines & plans",
  invoices: "Invoices & receipts",
  shotlist: "Shot list",
  custom: "Custom",
};

/** Full Ana Dashboard–style Files browser (demo dataset + real toast actions). */
function PipelineFilesTabPanel({ showToast }: { showToast: (msg: string) => void }) {
  const [folder, setFolder] = useState<PipelineFileFolderId>("all");

  const headKmono = FILES_FOLDER_TITLE[folder];

  return (
    <div className="files-wrap">
      <div className="files-side">
        <div className="kmono">Folders</div>
        <button
          type="button"
          className="file-folder"
          data-active={folder === "all" ? "true" : undefined}
          onClick={() => setFolder("all")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M3 7l3-3h5l2 2h8v13H3z" />
          </svg>
          All<span className="n">34</span>
        </button>
        <button
          type="button"
          className="file-folder"
          data-active={folder === "contracts" ? "true" : undefined}
          onClick={() => setFolder("contracts")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M14 3H5v18h14V8l-5-5z" />
            <path d="M14 3v5h5" />
          </svg>
          Contracts<span className="n">4</span>
        </button>
        <button
          type="button"
          className="file-folder"
          data-active={folder === "inspiration" ? "true" : undefined}
          onClick={() => setFolder("inspiration")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          Inspiration<span className="n">12</span>
        </button>
        <button
          type="button"
          className="file-folder"
          data-active={folder === "timelines" ? "true" : undefined}
          onClick={() => setFolder("timelines")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="1" />
            <path d="M3 9h18" />
          </svg>
          Timelines<span className="n">6</span>
        </button>
        <button
          type="button"
          className="file-folder"
          data-active={folder === "invoices" ? "true" : undefined}
          onClick={() => setFolder("invoices")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M3 7h18M5 7v13h14V7M9 7V4h6v3" />
          </svg>
          Invoices<span className="n">7</span>
        </button>
        <button
          type="button"
          className="file-folder"
          data-active={folder === "shotlist" ? "true" : undefined}
          onClick={() => setFolder("shotlist")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M4 4h16v16H4z" />
            <path d="M4 10h16M10 4v16" />
          </svg>
          Shot list<span className="n">3</span>
        </button>
        <button
          type="button"
          className="file-folder"
          data-active={folder === "custom" ? "true" : undefined}
          onClick={() => setFolder("custom")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Custom<span className="n">2</span>
        </button>
      </div>

      <div className="files-main">
        <div className="files-head">
          <div className="kmono">{headKmono}</div>
          <div className="files-actions">
            <button
              type="button"
              className="t-action"
              onClick={() => showToast("Upload dialog would open here (demo).")}
            >
              Upload
            </button>
            <button type="button" className="t-action" onClick={() => showToast("New folder — coming soon.")}>
              New folder
            </button>
          </div>
        </div>
        <div className="file-list">
          <div className="file-row file-grp-head">
            <span>Name</span>
            <span>Type</span>
            <span>Size</span>
            <span>From</span>
            <span>Added</span>
          </div>

          {(folder === "all" || folder === "contracts") && (
            <>
              <button
                type="button"
                className="file-row"
                onClick={() => showToast("Open file (demo).")}
              >
                <span className="f-name">
                  <span className="f-ico pdf">PDF</span>
                  <b>Hartwell-Beaumont-Photography-Contract-signed.pdf</b>
                </span>
                <span>Contract</span>
                <span>1.8 MB</span>
                <span>Clara Hartwell</span>
                <span>Dec 04</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico pdf">PDF</span>
                  <b>Villa-Astor-Vendor-Agreement.pdf</b>
                </span>
                <span>Contract</span>
                <span>620 KB</span>
                <span>Giulia · Villa Astor</span>
                <span>Jan 18</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico pdf">PDF</span>
                  <b>Leo-Iskander-Second-Shooter-NDA.pdf</b>
                </span>
                <span>Contract</span>
                <span>440 KB</span>
                <span>Leo Iskander</span>
                <span>Apr 02</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico pdf">PDF</span>
                  <b>Giada-HMUA-Service-Agreement.pdf</b>
                </span>
                <span>Contract</span>
                <span>380 KB</span>
                <span>Giada · HMUA</span>
                <span>Mar 28</span>
              </button>
            </>
          )}

          {(folder === "all" || folder === "timelines") && (
            <>
              <div className="file-row file-grp-head file-grp-section">
                <span style={{ gridColumn: "1 / -1" }}>Timelines &amp; plans</span>
              </div>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico doc">DOC</span>
                  <b>Minute-by-minute · Saturday 6 June · v3.docx</b>
                </span>
                <span>Timeline</span>
                <span>92 KB</span>
                <span>Ana · drafted</span>
                <span>Apr 20</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico img">IMG</span>
                  <b>Seating-chart-v3.png</b>
                </span>
                <span>Plan</span>
                <span>1.2 MB</span>
                <span>Margaret Hartwell</span>
                <span>Mar 28</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico doc">DOC</span>
                  <b>Shot-list · heritage details &amp; terrace.md</b>
                </span>
                <span>Shot list</span>
                <span>24 KB</span>
                <span>You</span>
                <span>Mar 15</span>
              </button>
            </>
          )}

          {folder === "shotlist" && (
            <>
              <div className="file-row file-grp-head file-grp-section">
                <span style={{ gridColumn: "1 / -1" }}>Shot list</span>
              </div>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico doc">DOC</span>
                  <b>Shot-list · heritage details &amp; terrace.md</b>
                </span>
                <span>Shot list</span>
                <span>24 KB</span>
                <span>You</span>
                <span>Mar 15</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico img">IMG</span>
                  <b>Terrace-processional-angles-v2.png</b>
                </span>
                <span>Reference</span>
                <span>890 KB</span>
                <span>You</span>
                <span>Mar 10</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico pdf">PDF</span>
                  <b>Family-groupings-shot-checklist.pdf</b>
                </span>
                <span>Checklist</span>
                <span>120 KB</span>
                <span>Ana</span>
                <span>Feb 02</span>
              </button>
            </>
          )}

          {(folder === "all" || folder === "inspiration") && (
            <>
              <div className="file-row file-grp-head file-grp-section">
                <span style={{ gridColumn: "1 / -1" }}>Inspiration &amp; references</span>
              </div>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico img">IMG</span>
                  <b>Loggia-golden-hour-reference-01.jpg</b>
                </span>
                <span>Reference</span>
                <span>3.4 MB</span>
                <span>You</span>
                <span>Feb 11</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico img">IMG</span>
                  <b>Heritage-mehndi-detail-references.zip</b>
                </span>
                <span>Archive</span>
                <span>18 MB</span>
                <span>Clara Hartwell</span>
                <span>Jan 22</span>
              </button>
            </>
          )}

          {(folder === "all" || folder === "invoices") && (
            <>
              <div className="file-row file-grp-head file-grp-section">
                <span style={{ gridColumn: "1 / -1" }}>Invoices &amp; receipts</span>
              </div>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico pdf">PDF</span>
                  <b>INV-2406-HTW-001 · deposit.pdf</b>
                </span>
                <span>Invoice</span>
                <span>84 KB</span>
                <span>You</span>
                <span>Dec 04</span>
              </button>
              <button type="button" className="file-row" onClick={() => showToast("Open file (demo).")}>
                <span className="f-name">
                  <span className="f-ico pdf">PDF</span>
                  <b>INV-2406-HTW-002 · prep milestone.pdf</b>
                </span>
                <span>Invoice</span>
                <span>88 KB</span>
                <span>You</span>
                <span>Mar 15</span>
              </button>
            </>
          )}

          {folder === "custom" && (
            <div className="file-row file-grp-head file-grp-section">
              <span style={{ gridColumn: "1 / -1" }}>Custom</span>
            </div>
          )}
          {folder === "custom" && (
            <p className="px-4 py-6 text-[13px] text-[var(--fg-3)]">
              No custom folders yet — use New folder to add one (demo).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders the center pane: Ana pipeline workspace (thread list + detail) + composer */
export function PipelineTimelinePane() {
  const state = usePipelineWedding();
  const [searchParams, setSearchParams] = useSearchParams();
  const escalationId = searchParams.get("escalationId");

  /** Must run before any conditional return — same order on every render (loading vs ready). */
  const gmailDockRef = useRef<GmailThreadInlineReplyDockHandle>(null);
  const navigate = useNavigate();

  const weddingIdShort = useMemo(() => {
    if (!state) return "← Project";
    const { weddingId, detailState } = state;
    const c = detailState.weddingFields.couple ?? "";
    const surnames = c
      .split("&")
      .map((x) => x.trim().split(/\s+/).pop())
      .filter(Boolean);
    const label = surnames.length >= 2 ? `${surnames[0]} · ${surnames[1]}` : surnames[0] ?? "Project";
    const tail = weddingId.slice(0, 8).toUpperCase();
    return `← ${label} · #${tail}`;
  }, [state]);

  const stageKeyEff = state?.entry.stage ?? "inquiry";
  const liveTasksEff = state?.liveTasks ?? [];
  const threadsEff = state?.threadState.threads ?? [];
  const rail = useMemo(() => stageRailSteps(stageKeyEff), [stageKeyEff]);
  const overviewTasks = useMemo(() => liveTasksEff.filter((t) => !taskIsDone(t)).slice(0, 4), [liveTasksEff]);
  const overviewThreads = useMemo(() => threadsEff.slice(0, 4), [threadsEff]);
  const openTasksList = useMemo(() => liveTasksEff.filter((t) => !taskIsDone(t)), [liveTasksEff]);
  const doingTasks = useMemo(() => openTasksList.slice(0, 2), [openTasksList]);
  const todoTasks = useMemo(() => openTasksList.slice(2), [openTasksList]);
  const doneTasks = useMemo(() => liveTasksEff.filter((t) => taskIsDone(t)), [liveTasksEff]);

  if (!state) return null;

  const {
    weddingId,
    entry,
    projectType,
    liveTasks,
    toast,
    showToast,
    tab,
    setTabAndUrl,
    threadState,
    composerState,
    travelPlan,
    detailState,
  } = state;
  const projectTypeChip = projectTypeBadgeLabel(projectType);

  const gmailDock =
    threadState.replyComposerMode === "gmail" && threadState.activeThread ? (
      <GmailThreadInlineReplyDock
        ref={gmailDockRef}
        threadId={threadState.activeThread.id}
        threadTitle={threadState.activeThread.title}
        hasGmailImport
        inlineMessageLayout
        suppressIdleReplyActions
        afterSuccessfulSend={async () => {
          fireDataChanged("inbox");
          threadState.refreshActiveThreadMessages();
        }}
      />
    ) : null;

  const stageKey = entry.stage;
  const coupleTitle = detailState.weddingFields.couple ?? "Project";
  const venue = detailState.weddingFields.where || "Venue TBD";
  const whenLabel = detailState.weddingFields.when || entry.when || "—";
  const idTail = weddingId.slice(0, 8).toUpperCase();
  const daysLeft = daysUntilFromWhenLabel(detailState.weddingFields.when || entry.when);
  const nThreads = threadState.threads.length;
  const nTasksOpen = liveTasks.filter((t) => !taskIsDone(t)).length;
  const nDraftThreads = threadState.threads.filter((t) => t.hasPendingDraft).length;
  const nPeople = detailState.people.length;
  const nTravel = Math.max(travelSegmentCount(travelPlan), travelPlan ? 1 : 0);

  function ptab(
    id: PipelineWorkspaceTabId,
    label: string,
    icon: ReactNode,
    count?: number,
  ) {
    const on = tab === id;
    return (
      <button
        key={id}
        type="button"
        className="ptab"
        data-active={on ? "true" : undefined}
        onClick={() => setTabAndUrl(id)}
      >
        {icon}
        {label}
        {count != null && count > 0 ? <span className="n">{count}</span> : null}
      </button>
    );
  }

  const iconOv = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  );
  const iconThreads = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 4h16v12H7l-3 3V4z" />
    </svg>
  );
  const iconTasks = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="4" height="4" />
      <rect x="3" y="11" width="4" height="4" />
      <rect x="3" y="17" width="4" height="4" />
      <path d="M10 7h11M10 13h11M10 19h11" />
    </svg>
  );
  const iconFiles = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 3H5v18h14V8l-5-5z" />
      <path d="M14 3v5h5" />
    </svg>
  );
  const iconFin = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
  const iconTrv = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1L15 22v-1.5L13 19v-5.5L21 16z" />
    </svg>
  );
  const iconEvt = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="1" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
  const iconPpl = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M15 14a4 4 0 0 1 4 4v1H5v-1a4 4 0 0 1 4-4" />
      <circle cx="17" cy="8" r="2.2" />
    </svg>
  );

  return (
    <div className="ana-inbox-port ana-pipeline-port flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-canvas)]">
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-[120] max-w-md -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-5 py-2.5 font-[family-name:var(--font-sans)] text-[13px] text-[var(--fg-1)] shadow-sm">
          {toast}
        </div>
      ) : null}

      {escalationId ? (
        <div className="shrink-0 border-b border-[var(--border-default)] bg-[var(--surface-sunken)] px-4 py-3">
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

      <div className="proj-pane flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="proj-tabbar shrink-0">
          <div className="proj-tab-row" role="tablist" aria-label="Project workspace">
            {ptab("overview", "Overview", iconOv)}
            {ptab("threads", "Threads", iconThreads, nThreads)}
            {ptab("tasks", "Tasks", iconTasks, nTasksOpen)}
            {ptab("files", "Files", iconFiles, 34)}
            {ptab("finance", "Finance", iconFin)}
            {ptab("travel", "Travel", iconTrv, nTravel)}
            {ptab("event", "Event", iconEvt)}
            {ptab("people", "People", iconPpl, nPeople)}
          </div>
          <div className="proj-crumb">
            <button type="button" className="back" onClick={() => navigate("/pipeline")}>
              ← Pipeline
            </button>
            <h1>{coupleTitle}</h1>
            <span className="chip-sm book">{formatPipelineStageLabel(stageKey)}</span>
            {projectTypeChip ? (
              <span className="chip-sm" data-project-type-chip="1">
                {projectTypeChip}
              </span>
            ) : null}
            <span className="crumb-meta">
              #{idTail} · {venue}
              {whenLabel !== "—" ? ` · ${whenLabel}` : ""}
              {daysLeft != null && daysLeft > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  <b style={{ color: "var(--color-fin)" }}>{daysLeft} days</b>
                </>
              ) : null}
            </span>
            <div className="proj-crumb-actions">
              <button type="button" className="t-action" onClick={() => showToast("Add — coming soon.")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add
              </button>
              <button type="button" className="t-action" onClick={() => showToast("Filter — coming soon.")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Filter
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === "overview" ? (
            <div className="ptab-body min-h-0 flex-1 overflow-y-auto">
              <div className="ov-grid">
                <div className="ov-card ov-hero">
                  <div className="ov-hero-l">
                    <div className="kmono">Story so far</div>
                    <p className="brief">
                      {coupleTitle} · {venue}
                      {whenLabel !== "—" ? ` · ${whenLabel}` : ""}. Project #{idTail}.
                    </p>
                    <div className="ov-next">
                      <div className="kmono orange">Ana&apos;s next move</div>
                      <p>
                        {nDraftThreads > 0 ? (
                          <>
                            Holding <b>{nDraftThreads} draft{nDraftThreads === 1 ? "" : "s"}</b> for your
                            approval — review in Threads.
                          </>
                        ) : (
                          <>Inbox is clear of pending Ana drafts for this project.</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="ov-hero-r">
                    <div className="kmono">Countdown</div>
                    <div className="bignum">
                      {daysLeft != null && daysLeft > 0 ? (
                        <>
                          {daysLeft}
                          <em> days</em>
                        </>
                      ) : (
                        <>
                          —
                          <em> days</em>
                        </>
                      )}
                    </div>
                    <div className="caption">
                      {whenLabel !== "—" ? whenLabel : "Date TBD"}
                    </div>
                  </div>
                </div>

                <div className="ov-card">
                  <div className="ov-head">
                    <span className="kmono">Progress</span>
                    <button type="button" className="linkish" onClick={() => setTabAndUrl("event")}>
                      Open event
                    </button>
                  </div>
                  <div className="stage-rail" style={{ marginTop: 10 }}>
                    {rail.map((s) => (
                      <div
                        key={s.key}
                        className="step"
                        data-done={s.state === "done" ? "true" : undefined}
                        data-current={s.state === "current" ? "true" : undefined}
                      >
                        <div className="dot" />
                        <div className="lbl">{s.lbl}</div>
                        <div className="when">{s.when}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ov-card">
                  <div className="ov-head">
                    <span className="kmono">Tasks · next 14 days</span>
                    <button type="button" className="linkish" onClick={() => setTabAndUrl("tasks")}>
                      Open all →
                    </button>
                  </div>
                  <div className="ov-tasks">
                    {overviewTasks.length === 0 ? (
                      <p className="text-[13px] text-[var(--fg-3)]">No open tasks.</p>
                    ) : (
                      overviewTasks.map((tk) => (
                        <div key={tk.id} className="ov-task">
                          <span className="cb" aria-hidden />
                          <span className="ov-t-ti">{tk.title}</span>
                          <span
                            className={`ov-t-when${taskDueSoon(tk.due_date) ? " urgent" : ""}`}
                          >
                            {formatTaskDueShort(tk.due_date)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="ov-card">
                  <div className="ov-head">
                    <span className="kmono">Finance</span>
                    <button type="button" className="linkish" onClick={() => setTabAndUrl("finance")}>
                      Ledger →
                    </button>
                  </div>
                  <div className="ov-fin-bar">
                    <div className="ov-fin-fill" style={{ width: "67%" }} />
                  </div>
                  <div className="ov-fin-row">
                    <span>Package</span>
                    <b>{detailState.weddingFields.package || "—"}</b>
                  </div>
                  <div className="ov-fin-row">
                    <span className="g">Paid</span>
                    <b className="g">{detailState.weddingFields.balance || "—"}</b>
                  </div>
                </div>

                <div className="ov-card">
                  <div className="ov-head">
                    <span className="kmono">Recent threads</span>
                    <button type="button" className="linkish" onClick={() => setTabAndUrl("threads")}>
                      Inbox →
                    </button>
                  </div>
                  <div className="ov-threads">
                    {overviewThreads.map((th) => {
                      const msgs = getMessagesForThread(th.id);
                      const last = msgs.length ? msgs[msgs.length - 1] : undefined;
                      const snip = last
                        ? snippetForThreadRow({
                            body: last.body,
                            bodyHtmlSanitized:
                              "bodyHtmlSanitized" in last
                                ? (last as { bodyHtmlSanitized?: string | null }).bodyHtmlSanitized
                                : undefined,
                            maxChars: 48,
                          })
                        : "";
                      return (
                        <div key={th.id} className="ov-th">
                          <span className={`dot${th.hasPendingDraft ? " ana" : ""}`} />
                          <b>{th.title.slice(0, 42)}</b>
                          <span className="m">
                            {th.lastActivityLabel}
                            {snip ? ` · ${snip}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="ov-card">
                  <div className="ov-head">
                    <span className="kmono">Travel</span>
                    <button type="button" className="linkish" onClick={() => setTabAndUrl("travel")}>
                      Itinerary →
                    </button>
                  </div>
                  <div className="ov-travel">
                    {travelPlan && travelPlan.flights[0] ? (
                      <>
                        <div className="ov-trv">
                          <div className="ti">{travelPlan.flights[0].route}</div>
                          <div className="sub">
                            {travelPlan.flights[0].airline} · {travelPlan.flights[0].depart}
                          </div>
                        </div>
                        {travelPlan.hotels[0] ? (
                          <div className="ov-trv">
                            <div className="ti">{travelPlan.hotels[0].name}</div>
                            <div className="sub">
                              {travelPlan.hotels[0].checkIn} – {travelPlan.hotels[0].checkOut}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-[13px] text-[var(--fg-3)]">No travel segments yet.</p>
                    )}
                  </div>
                </div>

                <div className="ov-card ov-risks">
                  <div className="ov-head">
                    <span className="kmono orange">Needs your call</span>
                  </div>
                  <div className="risk">
                    <span className="risk-ico">!</span>
                    <div>
                      <b>Open threads</b>
                      <div className="sub">
                        {nThreads} thread{nThreads === 1 ? "" : "s"} in this project — keep drafts moving in
                        Threads.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "threads" ? (
            <div className="ptab-body ptab-body--threads flex min-h-0 flex-1 flex-col overflow-hidden">
              <PipelineCenterTimeline
                weddingIdShort={weddingIdShort}
                weddingStageLabel={formatPipelineStageLabel(stageKey)}
                projectTypeBadge={projectTypeChip}
                weddingStage={stageKey}
                weddingFields={detailState.weddingFields}
                people={detailState.people}
                threads={threadState.threads}
                liveTasks={liveTasks}
                activeThread={threadState.activeThread}
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
                gmailInlineReplyDock={gmailDock}
                gmailDockRef={gmailDockRef}
                replyComposerMode={threadState.replyComposerMode}
                showToast={showToast}
              />
            </div>
          ) : null}

          {tab === "tasks" ? (
            <div className="ptab-body min-h-0 flex-1 overflow-y-auto">
              <div className="tasks-wrap">
                <div className="tasks-col">
                  <div className="tcol-head">
                    <span>To do</span>
                    <span className="n">{todoTasks.length}</span>
                  </div>
                  {todoTasks.map((tk) => (
                    <div key={tk.id} className="task">
                      <span className="cb" aria-hidden />
                      <div>
                        <div className="t-ti">{tk.title}</div>
                        <div className="t-meta">
                          <span>{formatTaskDueShort(tk.due_date)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {todoTasks.length === 0 ? (
                    <p className="text-[13px] text-[var(--fg-3)]">Nothing in this column.</p>
                  ) : null}
                </div>
                <div className="tasks-col">
                  <div className="tcol-head">
                    <span>Doing</span>
                    <span className="n">{doingTasks.length}</span>
                  </div>
                  {doingTasks.map((tk) => (
                    <div key={tk.id} className="task doing">
                      <span className="cb" data-on="true" aria-hidden />
                      <div>
                        <div className="t-ti">{tk.title}</div>
                        <div className="t-meta">
                          <span className="tag">Active</span>
                          <span>{formatTaskDueShort(tk.due_date)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="tasks-col">
                  <div className="tcol-head">
                    <span>Done</span>
                    <span className="n">{doneTasks.length}</span>
                  </div>
                  {doneTasks.map((tk) => (
                    <div key={tk.id} className="task done">
                      <span className="cb done" aria-hidden />
                      <div>
                        <div className="t-ti">{tk.title}</div>
                        <div className="t-meta">
                          <span>{formatTaskDueShort(tk.due_date)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "files" ? (
            <div className="ptab-body ptab-body--files min-h-0 flex-1 overflow-hidden">
              <PipelineFilesTabPanel showToast={showToast} />
            </div>
          ) : null}

          {tab === "finance" ? (
            <div className="ptab-body min-h-0 flex-1 overflow-y-auto">
              <div className="fin-wrap">
                <div className="fin-hero">
                  <div className="fin-hero-l">
                    <div className="kmono">Package</div>
                    <div className="fin-total">{detailState.weddingFields.value || "—"}</div>
                    <div className="fin-sub">{coupleTitle}</div>
                  </div>
                  <div className="fin-hero-m">
                    <div className="kmono">Paid</div>
                    <div className="fin-big g">{detailState.weddingFields.balance || "—"}</div>
                    <div className="fin-sub">Ledger sync (demo)</div>
                  </div>
                  <div className="fin-hero-m">
                    <div className="kmono">Remaining</div>
                    <div className="fin-big">—</div>
                    <div className="fin-sub">See line items below</div>
                  </div>
                  <div className="fin-hero-r">
                    <div className="fin-progress">
                      <div className="fin-bar">
                        <div className="fin-fill" style={{ width: "67%" }} />
                      </div>
                      <div className="fin-legend">
                        <span>
                          <i className="d g" />
                          Paid
                        </span>
                        <span>
                          <i className="d" />
                          Remaining
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="fin-card fin-ana">
                  <div className="ov-head">
                    <span className="kmono orange">Live ledger</span>
                  </div>
                  <WeddingFinancialsPanel weddingId={weddingId} />
                </div>
              </div>
            </div>
          ) : null}

          {tab === "travel" ? (
            <div className="ptab-body min-h-0 flex-1 overflow-y-auto">
              <div className="trv-wrap">
                {travelPlan ? (
                  <>
                    <div className="trv-hero">
                      <div>
                        <div className="kmono">Trip</div>
                        <h2>
                          {venue} · {whenLabel !== "—" ? whenLabel : "Dates TBD"}
                        </h2>
                        <div className="sub">
                          {isNonWeddingProjectType(projectType)
                            ? "Itinerary and travel (demo data where present)."
                            : "Itinerary from wedding travel (demo data where present)."}
                        </div>
                      </div>
                      <div className="trv-hero-r">
                        <div className="kmono">Status</div>
                        <div className="pill g big">Planned</div>
                      </div>
                    </div>
                    <TravelTabPanel travelPlan={travelPlan} onToast={showToast} />
                  </>
                ) : (
                  <p className="text-[15px] text-[var(--fg-3)]">
                    {isNonWeddingProjectType(projectType)
                      ? "No travel plan for this project (demo)."
                      : "No travel plan for this wedding (demo)."}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {tab === "event" ? (
            <div className="ptab-body min-h-0 flex-1 overflow-y-auto">
              <div className="evt-wrap">
                <div className="evt-hero">
                  <div>
                    <div className="kmono">Event</div>
                    <h2>
                      {venue} · {whenLabel !== "—" ? whenLabel : "TBD"}
                    </h2>
                    <p className="caption">
                      {isNonWeddingProjectType(projectType)
                        ? "Event and shoot details for this project — values follow your event fields where available."
                        : "Ceremony and reception details for this project — values follow your wedding fields where available."}
                    </p>
                  </div>
                  <div className="evt-hero-ctas">
                    <button type="button" className="t-action" onClick={() => showToast("Share — coming soon.")}>
                      Share with team
                    </button>
                    <button type="button" className="t-action" onClick={() => showToast("Print — coming soon.")}>
                      Print run-of-day
                    </button>
                  </div>
                </div>
                <div className="evt-grid">
                  <div className="evt-card">
                    <div className="ov-head">
                      <span className="kmono">Key facts</span>
                    </div>
                    <div className="kv">
                      <span>Date</span>
                      <b>{whenLabel}</b>
                    </div>
                    <div className="kv">
                      <span>Venue</span>
                      <b>{venue}</b>
                    </div>
                    <div className="kv">
                      <span>Ceremony</span>
                      <b>17:30 · (demo)</b>
                    </div>
                    <div className="kv">
                      <span>Guests</span>
                      <b>—</b>
                    </div>
                  </div>
                  <div className="evt-card evt-ana">
                    <div className="ov-head">
                      <span className="kmono orange">Ana&apos;s note</span>
                    </div>
                    <p>
                      Timeline blocks will sync from Threads and Files once approvals land — this tab is a
                      read-only snapshot for now.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "people" ? (
            <div className="ptab-body min-h-0 flex-1 overflow-y-auto">
              <div className="ppl-wrap">
                <div className="ppl-sec">
                  <div className="kmono">
                    {isNonWeddingProjectType(projectType) ? "People & contacts" : "Wedding party & contacts"}
                  </div>
                  <div className="ppl-grid">
                    {detailState.people.map((p) => (
                      <div key={p.id} className="ppl-card">
                        <div className="avt big">{p.name.slice(0, 2).toUpperCase()}</div>
                        <div className="nm">{p.name}</div>
                        <div className="role">{p.subtitle}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ppl-sec">
                  <div className="kmono">Vendors (demo)</div>
                  <div className="ppl-grid">
                    <div className="ppl-card">
                      <div className="avt big soft">GV</div>
                      <div className="nm">{venue}</div>
                      <div className="role">Venue · on-site</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {threadState.replyComposerMode === "legacy" ? (
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
      ) : threadState.replyComposerMode === "pending" ? (
        <div
          className="shrink-0 border-t border-[var(--border-default)] bg-[var(--surface-canvas)] px-4 py-2.5"
          aria-busy
          aria-label="Loading reply composer"
        >
          <div className="h-11 w-full max-w-3xl animate-pulse rounded-lg bg-muted/40" />
        </div>
      ) : null}

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
