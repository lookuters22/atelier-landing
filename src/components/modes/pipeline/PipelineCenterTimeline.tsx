import { useCallback, useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import {
  adjacentThreadId,
  isEditableKeyboardTarget,
  timelineThreadAltArrowDelta,
} from "@/lib/timelineThreadNavigation";
import { messageFoldKey, getMessagesForThread, type WeddingThread, type WeddingThreadMessage } from "@/data/weddingThreads";
import { snippetForThreadRow } from "@/lib/threadMessageSnippet";
import { ConversationFeed, type ChatMessage } from "@/components/chat/ConversationFeed";
import type { GmailThreadInlineReplyDockHandle } from "@/components/modes/inbox/GmailThreadInlineReplyDock";
import { InboxReplyActions } from "@/components/modes/inbox/InboxReplyActions";
import type { ProjectTask } from "@/hooks/useWeddingProject";
import type { WeddingFieldsEditable } from "@/lib/weddingDetailStorage";
import type { WeddingPersonRow } from "@/data/weddingPeopleDefaults";

function mapToChatMessage(msg: WeddingThreadMessage): ChatMessage {
  return {
    id: msg.id,
    direction: msg.direction,
    sender: msg.sender,
    body: msg.body,
    time: msg.time,
    meta: msg.meta,
  };
}

type ListTabId = "threads" | "open" | "drafts" | "tasks";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

function threadRowWho(t: WeddingThread): string {
  const hint = t.participantHint.trim();
  const first = hint.split(/[·,&]/)[0]?.trim();
  return first || t.title.slice(0, 24);
}

function rowSnippet(t: WeddingThread): { title: string; snip: string } {
  const msgs = getMessagesForThread(t.id);
  const last = msgs[msgs.length - 1];
  const subj = t.title;
  if (!last) {
    return { title: subj, snip: ` — ${t.lastActivityLabel}` };
  }
  const bodySnip = snippetForThreadRow({
    body: last.body,
    bodyHtmlSanitized: "bodyHtmlSanitized" in last ? (last as { bodyHtmlSanitized?: string | null }).bodyHtmlSanitized : undefined,
    maxChars: 90,
  });
  return { title: subj, snip: ` — ${bodySnip}` };
}

export function stageRailSteps(stage: string): { key: string; lbl: string; when: string; state: "done" | "current" | "todo" }[] {
  const steps = [
    { key: "inq", lbl: "Inquiry", when: "Nov 12" },
    { key: "con", lbl: "Consult", when: "Nov 28" },
    { key: "bok", lbl: "Booked", when: "Dec 04" },
    { key: "prep", lbl: "Prep", when: "in progress" },
    { key: "del", lbl: "Delivery", when: "Jul '26" },
    { key: "fin", lbl: "Final", when: "—" },
  ];
  const currentIndex: Record<string, number> = {
    inquiry: 0,
    consultation: 1,
    proposal_sent: 1,
    contract_out: 2,
    booked: 3,
    prep: 4,
    delivered: 5,
    final_balance: 5,
    archived: 5,
  };
  const cur = currentIndex[stage] ?? 4;
  return steps.map((s, i) => ({
    ...s,
    state: i < cur ? "done" : i === cur ? "current" : "todo",
  }));
}

function formatListMeta(couple: string, venue: string): string {
  const parts = couple.split("&").map((s) => s.trim()).filter(Boolean);
  const a = parts[0]?.split(/\s+/).pop() ?? "Project";
  const b = parts[1]?.split(/\s+/).pop() ?? "";
  const core = b ? `${a} · ${b}` : a;
  return venue ? `${core} · ${venue}` : core;
}

function formatTaskDueLabel(iso: string): string {
  const due = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  if (dueDay.getTime() === todayStart.getTime()) return "Today";
  if (dueDay.getTime() < todayStart.getTime()) return "Overdue";
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function taskIsDone(t: ProjectTask): boolean {
  return /done|complete/i.test(t.status);
}

function taskDueSoon(iso: string): boolean {
  const due = new Date(iso).getTime();
  const now = Date.now();
  return due - now < 1000 * 60 * 60 * 72 && due > now;
}

export function PipelineCenterTimeline({
  weddingIdShort,
  weddingStageLabel,
  projectTypeBadge = null,
  weddingStage,
  weddingFields,
  people,
  threads,
  liveTasks,
  activeThread,
  earlierMessages,
  todayMessages,
  messageExpanded,
  defaultExpandedForMessage,
  toggleMessage,
  setSelectedThreadId,
  showDraft,
  draftExpanded: _draftExpanded,
  toggleDraftExpanded: _toggleDraftExpanded,
  approveDraft,
  isApprovingDraft,
  editDraftInComposer,
  draftDefault,
  gmailInlineReplyDock,
  gmailDockRef,
  replyComposerMode,
  showToast,
}: {
  weddingIdShort: string;
  weddingStageLabel: string;
  /** Non-wedding `project_type` chip; omitted for wedding rows. */
  projectTypeBadge?: string | null;
  weddingStage: string;
  weddingFields: WeddingFieldsEditable;
  people: WeddingPersonRow[];
  threads: WeddingThread[];
  liveTasks: ProjectTask[];
  activeThread: WeddingThread | undefined;
  earlierMessages: WeddingThreadMessage[];
  todayMessages: WeddingThreadMessage[];
  messageExpanded: Record<string, boolean>;
  defaultExpandedForMessage: (msg: WeddingThreadMessage) => boolean;
  toggleMessage: (foldKey: string) => void;
  setSelectedThreadId: (threadId: string) => void;
  showDraft: boolean;
  draftExpanded: boolean;
  toggleDraftExpanded: () => void;
  approveDraft: () => void;
  isApprovingDraft: boolean;
  editDraftInComposer: () => void;
  draftDefault: string;
  gmailInlineReplyDock?: ReactNode;
  gmailDockRef?: RefObject<GmailThreadInlineReplyDockHandle | null>;
  replyComposerMode?: "gmail" | "legacy" | "pending";
  showToast: (msg: string) => void;
}) {
  const [listTab, setListTab] = useState<ListTabId>("threads");

  const earlier = useMemo(() => earlierMessages.map(mapToChatMessage), [earlierMessages]);
  const today = useMemo(() => todayMessages.map(mapToChatMessage), [todayMessages]);
  const threadId = activeThread?.id ?? "";
  const allTimelineMessages = useMemo(
    () => [...earlierMessages, ...todayMessages],
    [earlierMessages, todayMessages],
  );

  const gmailDockRefEff = gmailDockRef;
  const gmailPerMessageFooter = useMemo(
    () =>
      replyComposerMode === "gmail" && gmailDockRefEff
        ? () => (
            <InboxReplyActions
              onReply={() => gmailDockRefEff.current?.openReply()}
              onForward={() => gmailDockRefEff.current?.openForward()}
              variant="inline"
            />
          )
        : undefined,
    [replyComposerMode, gmailDockRefEff],
  );

  const showLegacyNoDraftHint =
    !showDraft && replyComposerMode === "legacy" && !gmailInlineReplyDock;

  const listMetaLeft = formatListMeta(weddingFields.couple, weddingFields.where);

  const threadsThreads = threads;
  const threadsOpen = useMemo(() => threads.filter(() => true), [threads]);
  const threadsDrafts = useMemo(() => threads.filter((t) => t.hasPendingDraft), [threads]);

  const nThreads = threadsThreads.length;
  const nOpen = threadsOpen.length;
  const nDrafts = threadsDrafts.length;
  const nTasks = liveTasks.length;

  const filteredThreads =
    listTab === "drafts" ? threadsDrafts : listTab === "open" ? threadsOpen : threadsThreads;

  const rail = useMemo(() => stageRailSteps(weddingStage), [weddingStage]);

  const msgCount = earlierMessages.length + todayMessages.length;

  const participantLine =
    typeof people[0] !== "undefined"
      ? `${people[0].name.split(/\s+/)[0] ?? "Lead"} & ${Math.max(0, people.length - 1)} others`
      : "Participants";

  useEffect(() => {
    if (threads.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = timelineThreadAltArrowDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const id = adjacentThreadId(threads, activeThread?.id, delta);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedThreadId(id);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [threads, activeThread?.id, setSelectedThreadId]);

  const draftSlot = (
    <>
      {showDraft ? (
        <div
          className="pipeline-ana-draft-msg my-4 rounded-lg px-5 py-[18px]"
          style={{
            background: "rgba(255,86,0,0.04)",
            border: "1px solid rgba(255,86,0,0.2)",
          }}
        >
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-fin)]"
                aria-hidden
              />
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-fin)]">
                Ana drafted
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-[var(--fg-4)]">
                · will send as you
              </span>
            </div>
            <button
              type="button"
              className="t-action text-[11px]"
              onClick={() => showToast("Regenerate is not wired yet.")}
            >
              Regenerate
            </button>
          </div>
          <p className="mb-3 text-[14px] leading-relaxed tracking-[-0.01em] text-[var(--fg-1)]">{draftDefault}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-sm primary"
              disabled={isApprovingDraft}
              onClick={() => approveDraft()}
            >
              {isApprovingDraft ? "Sending…" : "Approve & send"}
            </button>
            <button type="button" className="btn-sm" onClick={() => editDraftInComposer()}>
              Edit
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => showToast("Teach Ana — coming soon.")}
            >
              Teach Ana
            </button>
          </div>
        </div>
      ) : null}
      {showLegacyNoDraftHint ? (
        <p className="py-4 text-center font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--fg-4)]">
          No pending drafts. Use the reply area below.
        </p>
      ) : null}
      {gmailInlineReplyDock}
    </>
  );

  const tabBtn = useCallback(
    (id: ListTabId, label: string, n: number) => (
      <button
        key={id}
        type="button"
        className="list-tab"
        data-active={listTab === id ? "true" : undefined}
        onClick={() => setListTab(id)}
      >
        {label} <span className="n">{n}</span>
      </button>
    ),
    [listTab],
  );

  return (
    <div
      className="grid min-h-0 min-w-0 flex-1"
      style={{
        gridTemplateColumns: "clamp(280px, 28%, 360px) minmax(0, 1fr)",
        borderRight: "1px solid var(--border-default)",
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-col border-r border-[var(--border-default)]">
        <div className="list-head">
          <div className="list-tabs flex-wrap">
            {tabBtn("threads", "Threads", nThreads)}
            {tabBtn("open", "Open", nOpen)}
            {tabBtn("drafts", "Drafts", nDrafts)}
            {tabBtn("tasks", "Tasks", nTasks)}
          </div>
          <div className="list-meta">
            <div className="left min-w-0 truncate">{listMetaLeft}</div>
            <button type="button" className="act" onClick={() => showToast("New thread — coming soon.")}>
              + New
            </button>
          </div>
        </div>
        {listTab === "tasks" ? (
          <ul className="pipeline-task-list min-h-0 flex-1 overflow-y-auto">
            {liveTasks.map((tk) => (
              <li key={tk.id} className="task-row" data-done={taskIsDone(tk) ? "true" : undefined}>
                <div className="chk" aria-hidden />
                <div className="tt">{tk.title}</div>
                <div className={`due ${taskDueSoon(tk.due_date) ? "warn" : ""}`}>
                  {formatTaskDueLabel(tk.due_date)}
                </div>
              </li>
            ))}
            {liveTasks.length === 0 ? (
              <li className="px-4 py-6 text-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--fg-4)]">
                No tasks
              </li>
            ) : null}
          </ul>
        ) : (
          <ul className="list min-h-0 flex-1">
            {filteredThreads.map((t) => {
              const sel = t.id === activeThread?.id;
              const { title, snip } = rowSnippet(t);
              const when = t.lastActivityLabel;
              const unr = Boolean(t.hasPendingDraft);
              return (
                <li
                  key={t.id}
                  className="mrow"
                  data-selected={sel ? "true" : undefined}
                  data-unread={unr ? "true" : undefined}
                >
                  <button
                    type="button"
                    className="contents cursor-pointer border-0 bg-transparent p-0 text-left"
                    onClick={() => setSelectedThreadId(t.id)}
                    aria-current={sel ? "true" : undefined}
                  >
                    <span className="cb" aria-hidden />
                    <svg
                      className={`star shrink-0 ${sel ? "active" : ""}`}
                      viewBox="0 0 24 24"
                      fill={sel ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden
                    >
                      <polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5 12 2" />
                    </svg>
                    <div className="mbody min-w-0">
                      <div className="who">
                        <span className="dotunread" />
                        {threadRowWho(t)}
                      </div>
                      <div className="subj">
                        {title}
                        <span className="snippet">{snip}</span>
                      </div>
                      <div className="tags">
                        {t.hasPendingDraft ? <span className="ttag fin">Ana drafted</span> : null}
                        <span className="ttag">{t.kind === "group" ? "Thread" : "Direct"}</span>
                      </div>
                    </div>
                    <div className="right">
                      <span className="when">{when}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="thread flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="thread-head shrink-0">
          <button type="button" className="back" onClick={() => showToast("Back navigation — use the project list.")}>
            {weddingIdShort}
          </button>
          <h1>{activeThread?.title ?? "Thread"}</h1>
          <div className="crumbs">
            <span className="chip-sm book">{weddingStageLabel}</span>
            {projectTypeBadge ? (
              <span className="chip-sm" data-project-type-chip="1">
                {projectTypeBadge}
              </span>
            ) : null}
            <span className="chip-sm">
              {weddingFields.where || "Venue"} · {weddingFields.when || "TBD"}
            </span>
            <span>{participantLine}</span>
            <span>·</span>
            <span>
              {msgCount} message{msgCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="stage-rail">
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
          <div className="thread-head-actions">
            <button type="button" className="t-action" onClick={() => showToast("Marked resolved (demo).")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mark resolved
            </button>
            <button type="button" className="t-action" onClick={() => showToast("Snooze — coming soon.")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Snooze
            </button>
            <button type="button" className="t-action" onClick={() => showToast("Create task — coming soon.")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path d="M9 11a3 3 0 0 1 6 0v4H9v-4z" />
                <path d="M7 15h10v5H7z" />
              </svg>
              Create task
            </button>
            <button type="button" className="t-action" onClick={() => showToast("More actions — coming soon.")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path d="M20 12H4M20 6H4M20 18H4" />
              </svg>
              More
            </button>
          </div>
        </div>

        <ConversationFeed
          earlierMessages={earlier}
          todayMessages={today}
          threadSurface="inboxAna"
          foldable
          expandedMap={messageExpanded}
          defaultExpanded={(msg) => {
            const raw = allTimelineMessages.find((m) => m.id === msg.id);
            return raw ? defaultExpandedForMessage(raw) : false;
          }}
          onToggle={toggleMessage}
          getFoldKey={(msg) => messageFoldKey(threadId, msg.id)}
          bottomSlot={draftSlot}
          messageFooter={gmailPerMessageFooter}
        />
      </div>
    </div>
  );
}
