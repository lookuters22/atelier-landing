import { Forward, Reply } from "lucide-react";

/**
 * Reply / Forward before opening the inline Gmail-style composer.
 * `feed`: detached footer spacing; `inline`: inside an expanded message row (parent supplies top border).
 */
interface InboxReplyActionsProps {
  onReply: () => void;
  onForward: () => void;
  variant?: "feed" | "inline";
  anaVisuals?: boolean;
}

export function InboxReplyActions({ onReply, onForward, variant = "feed", anaVisuals = false }: InboxReplyActionsProps) {
  const wrap =
    variant === "inline"
      ? "flex flex-wrap items-center gap-3 px-0 pt-0"
      : /* Feed: ConversationFeed uses divide-y before this row — no second border-t */
        "mx-5 flex flex-wrap items-center gap-3 pt-4";
  const wrapAna = variant === "inline" ? "inbox-msg-reply-actions" : "inbox-msg-reply-actions inbox-msg-reply-actions-feed";
  const linkCls = anaVisuals
    ? "text-[12px] font-medium text-[var(--fg-3)] underline-offset-4 transition hover:text-[var(--fg-1)] hover:underline"
    : "text-[13px] font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline";
  const sepCls = anaVisuals ? "text-[12px] text-[var(--fg-4)]" : "text-[12px] text-muted-foreground/50";

  if (anaVisuals) {
    return (
      <div className={wrapAna}>
        <button type="button" onClick={onReply} className="t-action">
          <Reply strokeWidth={1.75} aria-hidden />
          Reply
        </button>
        <button type="button" onClick={onForward} className="t-action">
          <Forward strokeWidth={1.75} aria-hidden />
          Forward
        </button>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <button type="button" onClick={onReply} className={linkCls}>
        Reply
      </button>
      <span className={sepCls} aria-hidden>
        |
      </span>
      <button type="button" onClick={onForward} className={linkCls}>
        Forward
      </button>
    </div>
  );
}
