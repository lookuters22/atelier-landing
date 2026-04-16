import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { scrollPipelineWeddingRowIntoView } from "../../lib/pipelineWeddingListNavigation";
import {
  adjacentThreadId,
  isEditableKeyboardTarget,
  threadQueuePosition,
  timelineThreadAltArrowDelta,
} from "../../lib/timelineThreadNavigation";
import {
  messageFoldKey,
  type WeddingThread,
  type WeddingThreadMessage,
} from "../../data/weddingThreads";
import { ConversationFeed, type ChatMessage } from "../chat/ConversationFeed";

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

export function TimelineTab({
  activeThread,
  threads,
  earlierMessages,
  todayMessages,
  messageExpanded,
  defaultExpandedForMessage,
  toggleMessage,
  setSelectedThreadId,
  showDraft,
  draftExpanded,
  toggleDraftExpanded,
  approveDraft,
  isApprovingDraft,
  editDraftInComposer,
  draftDefault,
  gmailInlineReplyDock,
  /** Drives bottom-of-feed hint/skeleton so Gmail and legacy paths never flash the wrong UI. */
  replyComposerMode = "legacy",
}: {
  activeThread: WeddingThread | undefined;
  threads: WeddingThread[];
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
  /** Inbox-style Gmail reply (replaces chat footer for Gmail-imported threads). */
  gmailInlineReplyDock?: ReactNode;
  replyComposerMode?: "gmail" | "legacy" | "pending";
}) {
  const earlier = useMemo(() => earlierMessages.map(mapToChatMessage), [earlierMessages]);
  const today = useMemo(() => todayMessages.map(mapToChatMessage), [todayMessages]);

  const threadId = activeThread?.id ?? "";
  const allTimelineMessages = useMemo(
    () => [...earlierMessages, ...todayMessages],
    [earlierMessages, todayMessages],
  );

  const threadChipsWrapRef = useRef<HTMLDivElement>(null);

  const threadQueuePos = useMemo(
    () => threadQueuePosition(threads, activeThread?.id),
    [threads, activeThread?.id],
  );

  useLayoutEffect(() => {
    if (threads.length < 2 || !activeThread?.id) return;
    const root = threadChipsWrapRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-timeline-thread-chip="${CSS.escape(activeThread.id)}"]`);
    if (el instanceof HTMLElement) scrollPipelineWeddingRowIntoView(el);
  }, [threads.length, activeThread?.id]);

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

  const showLegacyNoDraftHint =
    !showDraft && replyComposerMode === "legacy" && !gmailInlineReplyDock;

  const draftSlot = (
    <>
      {showDraft ? (
        <article className="w-full min-w-0 overflow-hidden rounded-lg border border-amber-200/90 bg-amber-50/40 shadow-sm">
          <button
            type="button"
            onClick={toggleDraftExpanded}
            className="flex w-full min-w-0 items-start gap-2 px-3 py-2.5 text-left transition hover:bg-amber-100/40"
            aria-expanded={draftExpanded}
          >
            <span className="mt-0.5 shrink-0 text-amber-800/80" aria-hidden>
              {draftExpanded ? <ChevronDown className="h-4 w-4" strokeWidth={2} /> : <ChevronRight className="h-4 w-4" strokeWidth={2} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-foreground">Drafted by Ana</span>
                <span className="shrink-0 rounded-sm bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                  Pending approval
                </span>
              </div>
              {!draftExpanded ? (
                <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{draftDefault}</p>
              ) : null}
            </div>
          </button>
          {draftExpanded ? (
            <div className="border-t border-amber-200/80 bg-background/50 px-3 pb-3 pt-2">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{draftDefault}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isApprovingDraft}
                  className="rounded-full bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-60"
                  onClick={(e) => {
                    e.stopPropagation();
                    approveDraft();
                  }}
                >
                  {isApprovingDraft ? "Sending…" : "Approve & send"}
                </button>
                <button
                  type="button"
                  disabled={isApprovingDraft}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    editDraftInComposer();
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          ) : null}
        </article>
      ) : showLegacyNoDraftHint ? (
        <p className="text-center text-[11px] text-muted-foreground">
          No pending drafts. Use the message box below.
        </p>
      ) : null}
      {gmailInlineReplyDock}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="shrink-0 space-y-2 border-b border-border bg-background px-4 py-2.5">
        <div className="text-center">
          <p className="text-[12px] font-semibold text-foreground">
            {activeThread?.title ?? "Thread"}
          </p>
          {activeThread?.participantHint ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {activeThread.participantHint}
            </p>
          ) : null}
          {threads.length > 1 && threadQueuePos ? (
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
              Thread {threadQueuePos.current} of {threadQueuePos.total}
            </p>
          ) : null}
        </div>
        {threads.length > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              title="Previous thread (Alt+←)"
              aria-label="Previous thread"
              onClick={() => {
                const id = adjacentThreadId(threads, activeThread?.id, -1);
                if (id) setSelectedThreadId(id);
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <div
              ref={threadChipsWrapRef}
              className="flex max-w-full flex-1 flex-wrap justify-center gap-1.5"
            >
              {threads.map((t) => {
                const on = t.id === activeThread?.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-timeline-thread-chip={t.id}
                    onClick={() => setSelectedThreadId(t.id)}
                    className={
                      "rounded-full px-3 py-1 text-[11px] font-semibold transition " +
                      (on
                        ? "bg-foreground text-background"
                        : "border border-border text-muted-foreground hover:border-border/80")
                    }
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              title="Next thread (Alt+→)"
              aria-label="Next thread"
              onClick={() => {
                const id = adjacentThreadId(threads, activeThread?.id, 1);
                if (id) setSelectedThreadId(id);
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <ConversationFeed
        earlierMessages={earlier}
        todayMessages={today}
        foldable
        expandedMap={messageExpanded}
        defaultExpanded={(msg) => {
          const raw = allTimelineMessages.find((m) => m.id === msg.id);
          return raw ? defaultExpandedForMessage(raw) : false;
        }}
        onToggle={toggleMessage}
        getFoldKey={(msg) => messageFoldKey(threadId, msg.id)}
        bottomSlot={draftSlot}
      />
    </div>
  );
}
