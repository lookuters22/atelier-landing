/**
 * End-of-thread ghost actions before opening the inline Gmail-style composer.
 */
interface InboxReplyActionsProps {
  onReply: () => void;
  onForward: () => void;
}

export function InboxReplyActions({ onReply, onForward }: InboxReplyActionsProps) {
  return (
    <div className="mx-5 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
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
