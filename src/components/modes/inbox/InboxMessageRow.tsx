import { useCallback, useState } from "react";
import { Archive, Loader2, Mail, MailOpen, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";
import { formatInboxTimeAgo } from "../../../lib/inboxMessageFormat";
import type { GmailInboxModifyAction, GmailInboxModifyResult } from "../../../lib/gmailInboxModify";
import { deriveStarredFromGmailLabelIds, deriveUnreadFromGmailLabelIds } from "../../../lib/gmailInboxLabels";

function truncate(s: string, max: number) {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function gmailSyncBlockedReason(t: UnfiledThread, connectedId: string | null): string | null {
  if (!t.hasGmailImport) return "Only Gmail-imported threads sync with Gmail.";
  if (!t.latestProviderMessageId) return "This thread has no Gmail message id to sync.";
  if (!connectedId) return "Connect Google in Settings to sync star and read state.";
  return null;
}

export function InboxMessageRow({
  thread,
  selected,
  onSelect,
  onDelete,
  deleting,
  googleConnectedAccountId,
  onGmailModify,
  onHoverPrefetch,
  onHoverPrefetchCancel,
  onRowFocusPrefetch,
}: {
  thread: UnfiledThread;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  deleting?: boolean;
  googleConnectedAccountId: string | null;
  onGmailModify: (action: GmailInboxModifyAction) => Promise<GmailInboxModifyResult>;
  /** Debounced thread-messages prefetch (pointer hover). */
  onHoverPrefetch?: () => void;
  onHoverPrefetchCancel?: () => void;
  /** Immediate prefetch when row receives focus (keyboard). */
  onRowFocusPrefetch?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [gmailActionError, setGmailActionError] = useState<string | null>(null);

  const starred = deriveStarredFromGmailLabelIds(thread.gmailLabelIds) ?? false;
  const unread = deriveUnreadFromGmailLabelIds(thread.gmailLabelIds) ?? false;
  const gmailBlock = gmailSyncBlockedReason(thread, googleConnectedAccountId);
  const canSyncGmail = gmailBlock === null;

  const runGmailModify = useCallback(
    async (action: GmailInboxModifyAction) => {
      if (!canSyncGmail || !googleConnectedAccountId || !thread.latestProviderMessageId) return;
      setGmailSyncing(true);
      setGmailActionError(null);
      const result = await onGmailModify(action);
      setGmailSyncing(false);
      if (result.ok) {
        setGmailActionError(null);
      } else {
        setGmailActionError(result.error);
      }
    },
    [canSyncGmail, googleConnectedAccountId, onGmailModify, thread.latestProviderMessageId],
  );

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        data-inbox-thread-row={thread.id}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onMouseEnter={() => {
          setHover(true);
          onHoverPrefetch?.();
        }}
        onMouseLeave={() => {
          setHover(false);
          onHoverPrefetchCancel?.();
        }}
        onFocus={(e) => {
          if (e.target === e.currentTarget) onRowFocusPrefetch?.();
        }}
        className={cn(
          "group flex cursor-pointer items-stretch gap-2 border-b border-border/80 px-3 py-2.5 text-left transition-colors",
          selected
            ? cn(
                unread ? "bg-accent/85" : "bg-accent/80",
                "hover:bg-accent/90",
              )
            : unread
              ? "bg-muted/40 hover:bg-muted/55 dark:bg-muted/30 dark:hover:bg-muted/45"
              : "hover:bg-accent/40",
        )}
      >
        <div className="flex shrink-0 items-start pt-0.5" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" className="mt-0.5 rounded border-border" aria-label="Select thread" tabIndex={-1} />
        </div>
        <div className="flex shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={!canSyncGmail || gmailSyncing}
            className={cn(
              "rounded p-0.5",
              canSyncGmail
                ? starred
                  ? "text-amber-600 hover:text-amber-700"
                  : "text-muted-foreground hover:text-amber-600"
                : "cursor-not-allowed text-muted-foreground/50",
            )}
            aria-label={canSyncGmail ? (starred ? "Unstar" : "Star") : "Star unavailable"}
            title={gmailBlock ?? (starred ? "Unstar in Gmail" : "Star in Gmail")}
            onClick={() => void runGmailModify(starred ? "unstar" : "star")}
          >
            {gmailSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" strokeWidth={1.75} aria-hidden />
            ) : (
              <Star
                className={cn("h-4 w-4", starred && canSyncGmail && "fill-amber-500 text-amber-600")}
                strokeWidth={1.75}
              />
            )}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate text-[13px]",
                unread ? "font-semibold text-foreground" : "font-medium text-foreground/80",
              )}
            >
              {thread.sender || "Unknown"}
            </span>
            <span
              className={cn(
                "shrink-0 text-[11px] tabular-nums",
                unread ? "text-foreground/70" : "text-muted-foreground",
              )}
            >
              {formatInboxTimeAgo(thread.last_activity_at)}
            </span>
          </div>
          <div
            className={cn(
              "truncate text-[13px]",
              unread ? "font-semibold text-foreground" : "font-normal text-foreground/78",
            )}
          >
            {truncate(thread.title, 120)}
          </div>
          <div
            className={cn(
              "truncate text-[12px]",
              unread ? "text-foreground/72" : "text-muted-foreground",
            )}
          >
            {truncate(thread.snippet || "—", 140)}
          </div>
          {gmailActionError ? (
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-destructive">{gmailActionError}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 self-center pl-1 transition-opacity",
            hover ? "opacity-100" : "opacity-0 sm:opacity-0 sm:group-hover:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
            title="Archive — not yet wired"
            aria-label="Archive (not yet wired)"
            onClick={() => {
              /* TODO: archive when backend exists */
            }}
          >
            <Archive className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            disabled={!canSyncGmail || gmailSyncing}
            className={cn(
              "rounded p-1.5",
              canSyncGmail
                ? "text-muted-foreground hover:bg-background hover:text-foreground"
                : "cursor-not-allowed text-muted-foreground/50",
            )}
            title={gmailBlock ?? (unread ? "Mark as read in Gmail" : "Mark as unread in Gmail")}
            aria-label={canSyncGmail ? (unread ? "Mark as read" : "Mark as unread") : "Read state unavailable"}
            onClick={() => void runGmailModify(unread ? "mark_read" : "mark_unread")}
          >
            {unread ? (
              <Mail className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <MailOpen className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            title="Delete thread"
            aria-label="Delete thread"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}
