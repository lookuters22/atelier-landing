/**
 * Reply / Forward before opening the inline Gmail-style composer.
 * `feed`: detached footer spacing; `inline`: inside an expanded message row (parent supplies top border).
 */
interface InboxReplyActionsProps {
  onReply: () => void;
  onForward: () => void;
  variant?: "feed" | "inline";
}

export function InboxReplyActions({ onReply, onForward, variant = "feed" }: InboxReplyActionsProps) {
  const wrap =
    variant === "inline"
      ? "flex flex-wrap items-center gap-3 px-0 pt-0"
      : /* Feed: ConversationFeed uses divide-y before this row — no second border-t */
        "mx-5 flex flex-wrap items-center gap-3 pt-4";
  return (
    <div className={wrap}>
      <button
        type="button"
        onClick={onReply}
        className="text-[13px] font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
      >
        Reply
      </button>
      <span className="text-[12px] text-muted-foreground/50" aria-hidden>
        |
      </span>
      <button
        type="button"
        onClick={onForward}
        className="text-[13px] font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
      >
        Forward
      </button>
    </div>
  );
}
