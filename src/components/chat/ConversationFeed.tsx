import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FileText, Paperclip } from "lucide-react";
import { trySanitizeEmailHtmlForIframe } from "../../lib/sanitizeEmailHtml";
import { snippetForThreadRow } from "../../lib/threadMessageSnippet";
import { partitionThreadForOmission, THREAD_OMISSION_THRESHOLD } from "../../lib/threadMessageOmission";
import { cn } from "@/lib/utils";
import { EmailHtmlReadingSurface } from "../email/EmailHtmlReadingSurface";
import { EmailHtmlIframe } from "../email/EmailHtmlIframe";
import { MessageAttachmentChips, type ChatAttachmentRow } from "./MessageAttachmentChips";

export type { ChatAttachmentRow };

export interface ChatMessage {
  id: string;
  direction: "in" | "out";
  sender: string;
  body: string;
  time: string;
  meta?: string;
  /** Server-sanitized HTML for approved Gmail imports; client re-sanitizes before render. */
  bodyHtmlSanitized?: string | null;
  /** Structured rows from `message_attachments` (e.g. Gmail import, WhatsApp). */
  attachments?: ChatAttachmentRow[];
}

type SegmentedRow = { msg: ChatMessage; seg: "earlier" | "today" };

export type ConversationThreadSurface = "default" | "inboxAna";

interface ConversationFeedProps {
  earlierMessages: ChatMessage[];
  todayMessages: ChatMessage[];
  /** Inbox thread detail: Ana `.thread-body` / `.msg` presentation (default: legacy feed). */
  threadSurface?: ConversationThreadSurface;
  foldable?: boolean;
  expandedMap?: Record<string, boolean>;
  defaultExpanded?: (msg: ChatMessage) => boolean;
  onToggle?: (foldKey: string) => void;
  getFoldKey?: (msg: ChatMessage) => string;
  bottomSlot?: ReactNode;
  /**
   * Renders at the bottom of the **last** message’s expanded body (inside that message), not below the feed.
   * Use for Gmail reply/forward so actions belong to the message (e.g. Inbox thread detail).
   */
  lastMessageFooter?: ReactNode;
  /**
   * Renders at the bottom of **every** expanded message. When set, overrides `lastMessageFooter` for placement
   * (Pipeline timeline: Reply | Forward on each message, wired to one `GmailThreadInlineReplyDock` via ref).
   */
  messageFooter?: (msg: ChatMessage) => ReactNode;
  emptyText?: string;
  /** Min messages before first + omission + last {@link THREAD_OMISSION_TAIL_SIZE} layout. */
  omissionThreshold?: number;
}

function effectiveExpanded(
  foldKey: string,
  msg: ChatMessage,
  foldable: boolean,
  expandedMap: Record<string, boolean> | undefined,
  defaultExpanded: ((msg: ChatMessage) => boolean) | undefined,
): boolean {
  if (!foldable) return true;
  if (Object.prototype.hasOwnProperty.call(expandedMap ?? {}, foldKey)) {
    return Boolean(expandedMap?.[foldKey]);
  }
  return defaultExpanded?.(msg) ?? true;
}

function senderInitial(sender: string): string {
  const t = sender.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

function ThreadMessageRow({
  msg,
  foldKey,
  expanded,
  onToggle,
  foldable,
  footerSlot,
  threadSurface = "default",
}: {
  msg: ChatMessage;
  foldKey: string;
  expanded: boolean;
  onToggle?: () => void;
  foldable: boolean;
  /** Shown at bottom of expanded body only (e.g. reply/forward for last message). */
  footerSlot?: ReactNode;
  threadSurface?: ConversationThreadSurface;
}) {
  const isAna = threadSurface === "inboxAna";
  const iframeSrcDoc = useMemo(
    () => trySanitizeEmailHtmlForIframe(msg.bodyHtmlSanitized),
    [msg.bodyHtmlSanitized],
  );
  const hasHtml = Boolean(iframeSrcDoc);
  const snippet = useMemo(
    () => snippetForThreadRow({ body: msg.body, bodyHtmlSanitized: msg.bodyHtmlSanitized }),
    [msg],
  );

  const hasAttachments = Boolean(msg.attachments && msg.attachments.length > 0);
  const incoming = msg.direction === "in";
  const toFromLine = incoming ? (
    msg.meta ? (
      <span className={isAna ? "text-[12px] text-[color:var(--color-ink-faint)]" : "text-[11px] text-muted-foreground"}>
        {msg.meta}
      </span>
    ) : (
      <span className={isAna ? "text-[12px] text-[color:var(--color-ink-faint)]" : "text-[11px] text-muted-foreground"}>
        To you
      </span>
    )
  ) : (
    <span className={isAna ? "text-[12px] text-[color:var(--color-ink-faint)]" : "text-[11px] text-muted-foreground"}>
      {msg.meta ?? "From studio"}
    </span>
  );

  const interactiveHeader = foldable && onToggle;

  const headerInner = isAna ? (
    <>
      {interactiveHeader ? (
        <span className="mt-0.5 shrink-0 text-[var(--fg-4)]" aria-hidden>
          {expanded ? <ChevronDown className="h-4 w-4" strokeWidth={2} /> : <ChevronRight className="h-4 w-4" strokeWidth={2} />}
        </span>
      ) : null}
      <div className={cn("ava", !incoming && "you")} aria-hidden>
        {senderInitial(msg.sender)}
      </div>
      <div className="meta min-w-0">
        {interactiveHeader && !expanded ? (
          <>
            <div className="name">
              <span className="truncate">{msg.sender}</span>
              <span className="addr">{toFromLine}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[13px] font-normal leading-[1.5] tracking-[-0.1px] text-[var(--fg-3)]">
              {snippet}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {hasAttachments ? (
                <span className="inline-flex items-center gap-0.5 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.8px] text-[var(--fg-4)]">
                  <Paperclip className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {msg.attachments!.length}
                </span>
              ) : null}
              {hasHtml ? (
                <span className="inline-flex items-center gap-0.5 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.8px] text-[var(--fg-4)]">
                  <FileText className="h-3 w-3" strokeWidth={2} aria-hidden />
                  HTML
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <div className="name">
            <span className="truncate">{msg.sender}</span>
            <span className="addr">{toFromLine}</span>
          </div>
        )}
      </div>
      <span className="when shrink-0">{msg.time}</span>
    </>
  ) : (
    <>
      {interactiveHeader ? (
        <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden>
          {expanded ? <ChevronDown className="h-4 w-4" strokeWidth={2} /> : <ChevronRight className="h-4 w-4" strokeWidth={2} />}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-[13px] font-semibold text-foreground">{msg.sender}</span>
            {interactiveHeader && !expanded ? (
              <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{toFromLine}</span>
            ) : null}
          </div>
          <time className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{msg.time}</time>
        </div>
        {expanded || !interactiveHeader ? <div className="mt-0.5 text-[11px] text-muted-foreground">{toFromLine}</div> : null}

        {interactiveHeader && !expanded ? (
          <p className="mt-1 line-clamp-1 text-[13px] leading-snug text-muted-foreground">{snippet}</p>
        ) : null}

        {interactiveHeader && !expanded ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {hasAttachments ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                <Paperclip className="h-3 w-3" strokeWidth={2} aria-hidden />
                {msg.attachments!.length}
              </span>
            ) : null}
            {hasHtml ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                <FileText className="h-3 w-3" strokeWidth={2} aria-hidden />
                HTML
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );

  const htmlContent = iframeSrcDoc ? (
    <EmailHtmlReadingSurface>
      <EmailHtmlIframe srcDoc={iframeSrcDoc} expanded={expanded} />
    </EmailHtmlReadingSurface>
  ) : null;
  const plainBlockNonHtml = isAna ? (
    <div className="msg-inbox-ana-plain">
      {msg.body.split(/\n\n+/).map((chunk, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {chunk}
        </p>
      ))}
    </div>
  ) : (
    <span className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{msg.body}</span>
  );

  const bodyBlock =
    hasHtml && iframeSrcDoc ? (
      <div className={cn("min-w-0 overflow-x-clip border-t", isAna ? "border-[var(--border-default)]" : "border-border/50")}>
        {htmlContent}
      </div>
    ) : (
      <div className={cn(!isAna && "border-t border-border/50 px-3 pb-3 pt-2")}>{plainBlockNonHtml}</div>
    );

  return (
    <article className={cn("w-full min-w-0 overflow-hidden", isAna ? "msg" : "bg-transparent")}>
      {interactiveHeader ? (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex w-full min-w-0 items-center text-left transition",
            isAna
              ? cn(
                  "msg-head border-0 bg-transparent p-0",
                  expanded ? "" : "hover:opacity-95",
                )
              : "items-start gap-2 px-3 py-2.5 " + (expanded ? "bg-muted/20" : "hover:bg-muted/35"),
          )}
          aria-expanded={expanded}
          aria-controls={`thread-msg-${foldKey}`}
          id={`thread-msg-hdr-${foldKey}`}
        >
          {headerInner}
        </button>
      ) : (
        <div
          className={cn(
            "flex w-full min-w-0 items-center",
            isAna ? "msg-head border-0 bg-transparent" : "items-start gap-2 border-b border-border/50 bg-muted/10 px-3 py-2.5",
          )}
          id={`thread-msg-hdr-${foldKey}`}
        >
          {headerInner}
        </div>
      )}

      {expanded ? (
        <div id={`thread-msg-${foldKey}`} role="region" aria-labelledby={`thread-msg-hdr-${foldKey}`}>
          {bodyBlock}
          {hasAttachments ? (
            <div
              className={cn("border-t py-2", isAna ? "border-border px-0" : "border-border/50 px-3")}
            >
              <MessageAttachmentChips attachments={msg.attachments!} variant={isAna ? "inboxAna" : "default"} />
            </div>
          ) : null}
          {footerSlot ? (
            <div className={cn("min-w-0 pb-3 pt-2", isAna ? "px-0" : "px-3")}>{footerSlot}</div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function TodaySeparator() {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-full bg-accent px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Today
      </span>
    </div>
  );
}

function OmissionBar({ count, revealed, onToggle }: { count: number; revealed: boolean; onToggle: () => void }) {
  const label = revealed
    ? `Hide ${count} ${count === 1 ? "message" : "messages"}`
    : `${count} more ${count === 1 ? "message" : "messages"}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/25 px-3 py-2.5 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/45"
    >
      <ChevronRight
        className={"h-4 w-4 shrink-0 transition-transform " + (revealed ? "rotate-90" : "")}
        strokeWidth={2}
        aria-hidden
      />
      {label}
    </button>
  );
}

function buildSegmentedRows(earlierMessages: ChatMessage[], todayMessages: ChatMessage[]): SegmentedRow[] {
  return [
    ...earlierMessages.map((msg) => ({ msg, seg: "earlier" as const })),
    ...todayMessages.map((msg) => ({ msg, seg: "today" as const })),
  ];
}

export function ConversationFeed({
  earlierMessages,
  todayMessages,
  threadSurface = "default",
  foldable,
  expandedMap,
  defaultExpanded,
  onToggle,
  getFoldKey = (msg) => msg.id,
  bottomSlot,
  lastMessageFooter,
  messageFooter,
  emptyText = "No messages yet.",
  omissionThreshold = THREAD_OMISSION_THRESHOLD,
}: ConversationFeedProps) {
  const hasMessages = earlierMessages.length > 0 || todayMessages.length > 0;
  const endRef = useRef<HTMLDivElement>(null);
  const msgCount = earlierMessages.length + todayMessages.length;
  const prevCount = useRef(msgCount);

  const [omissionRevealed, setOmissionRevealed] = useState(false);

  const segmented = useMemo(
    () => buildSegmentedRows(earlierMessages, todayMessages),
    [earlierMessages, todayMessages],
  );

  const partition = useMemo(
    () => partitionThreadForOmission(segmented, omissionThreshold),
    [segmented, omissionThreshold],
  );

  useEffect(() => {
    setOmissionRevealed(false);
  }, [earlierMessages, todayMessages]);

  useEffect(() => {
    if (!endRef.current) return;
    const isNewMessage = msgCount > prevCount.current;
    prevCount.current = msgCount;
    endRef.current.scrollIntoView({ behavior: isNewMessage ? "smooth" : "auto" });
  }, [msgCount, earlierMessages, todayMessages]);

  const foldableEff = foldable ?? false;

  const lastMessageIdInThread = useMemo(() => {
    const seg = buildSegmentedRows(earlierMessages, todayMessages);
    return seg.length > 0 ? seg[seg.length - 1].msg.id : null;
  }, [earlierMessages, todayMessages]);

  const ctx = {
    foldable: foldableEff,
    expandedMap,
    defaultExpanded,
    getFoldKey,
    onToggle,
    lastMessageFooter,
    messageFooter,
    lastMessageIdInThread,
    threadSurface,
  };

  function renderSegmentedList(
    rows: SegmentedRow[],
    /** Segment of the message rendered immediately before this block (for Today separator continuity across omission splits). */
    initialLastSeg: "earlier" | "today" | null = null,
  ): ReactNode[] {
    const nodes: ReactNode[] = [];
    let lastSeg = initialLastSeg;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.seg === "today" && lastSeg === "earlier") {
        nodes.push(<TodaySeparator key={`today-sep-${i}-${row.msg.id}`} />);
      }
      const foldKey = ctx.getFoldKey(row.msg);
      const expanded = effectiveExpanded(
        foldKey,
        row.msg,
        ctx.foldable,
        ctx.expandedMap,
        ctx.defaultExpanded,
      );
      const isLastInThread = Boolean(ctx.lastMessageIdInThread && row.msg.id === ctx.lastMessageIdInThread);
      const footerSlot = ctx.messageFooter
        ? ctx.messageFooter(row.msg)
        : isLastInThread
          ? ctx.lastMessageFooter
          : undefined;
      nodes.push(
        <ThreadMessageRow
          key={row.msg.id}
          msg={row.msg}
          foldKey={foldKey}
          expanded={expanded}
          foldable={ctx.foldable}
          onToggle={ctx.onToggle ? () => ctx.onToggle!(foldKey) : undefined}
          footerSlot={footerSlot}
          threadSurface={ctx.threadSurface}
        />,
      );
      lastSeg = row.seg;
    }
    return nodes;
  }

  let messageNodes: ReactNode = null;

  if (!hasMessages) {
    messageNodes = null;
  } else if (partition.mode === "flat") {
    messageNodes = renderSegmentedList(partition.items);
  } else {
    const { head, middle, tail } = partition;
    const parts: ReactNode[] = [];

    if (!omissionRevealed) {
      parts.push(...renderSegmentedList([head], null));
      parts.push(
        <OmissionBar
          key="thread-omission"
          count={middle.length}
          revealed={false}
          onToggle={() => setOmissionRevealed(true)}
        />,
      );
      parts.push(...renderSegmentedList(tail, head.seg));
    } else {
      parts.push(...renderSegmentedList([head], null));
      parts.push(
        <OmissionBar
          key="thread-omission-collapse"
          count={middle.length}
          revealed
          onToggle={() => setOmissionRevealed(false)}
        />,
      );
      const midNodes = renderSegmentedList(middle, head.seg);
      const lastMiddle = middle.length > 0 ? middle[middle.length - 1].seg : head.seg;
      parts.push(...midNodes);
      parts.push(...renderSegmentedList(tail, lastMiddle));
    }
    messageNodes = parts;
  }

  const isAnaFeed = threadSurface === "inboxAna";

  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        isAnaFeed ? "thread-body" : "px-4 py-4",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col",
          isAnaFeed ? "" : "max-w-full divide-y divide-border/50",
        )}
      >
        {!hasMessages && (
          <p className="py-8 text-center text-[12px] text-muted-foreground">{emptyText}</p>
        )}

        {messageNodes}

        {bottomSlot}
      </div>
      {/* Sentinel outside divide-y so it does not pick up an extra top border above an empty row */}
      <div ref={endRef} className="h-0 w-full shrink-0 overflow-hidden" aria-hidden />
    </div>
  );
}

export { THREAD_OMISSION_THRESHOLD, THREAD_OMISSION_TAIL_SIZE } from "../../lib/threadMessageOmission";
