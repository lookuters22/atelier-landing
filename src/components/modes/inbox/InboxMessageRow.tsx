import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";
import type { GmailLabelOption } from "../../../types/gmailImport.types";
import { formatInboxTimeAgo } from "../../../lib/inboxMessageFormat";
import type { GmailInboxModifyAction, GmailInboxModifyResult } from "../../../lib/gmailInboxModify";
import { deriveStarredFromGmailLabelIds, deriveUnreadFromGmailLabelIds } from "../../../lib/gmailInboxLabels";
import { deriveInboxThreadBucket, inboxUnlinkedBucketChipLabel } from "../../../lib/inboxThreadBucket";
import { userGmailLabelsOnThread } from "../../../lib/inboxThreadGmailLabels";

const STAR_POLY = "12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.5 5.5 21 7 14 2 9.3 9 8.5 12 2";

function truncate(s: string, max: number) {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function snippetForListRow(snippet: string): string {
  const t = snippet.trim();
  if (!t || t === "—") return "";
  return truncate(t, 120);
}

function formatProjectStageLabel(stage: string): string {
  return stage.replace(/_/g, " ");
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
  googleConnectedAccountId,
  onGmailModify,
  onHoverPrefetch,
  onHoverPrefetchCancel,
  onRowFocusPrefetch,
  gmailLabelCatalog,
  linkedCoupleNames,
  linkedWeddingStage,
  hasPendingDraft,
}: {
  thread: UnfiledThread;
  selected: boolean;
  onSelect: () => void;
  googleConnectedAccountId: string | null;
  onGmailModify: (action: GmailInboxModifyAction) => Promise<GmailInboxModifyResult>;
  onHoverPrefetch?: () => void;
  onHoverPrefetchCancel?: () => void;
  onRowFocusPrefetch?: () => void;
  gmailLabelCatalog: readonly GmailLabelOption[];
  linkedCoupleNames: string | null;
  linkedWeddingStage: string | null;
  hasPendingDraft: boolean;
}) {
  const [gmailSyncing, setGmailSyncing] = useState(false);
  const [gmailActionError, setGmailActionError] = useState<string | null>(null);

  const starred = deriveStarredFromGmailLabelIds(thread.gmailLabelIds) ?? false;
  const unread = deriveUnreadFromGmailLabelIds(thread.gmailLabelIds) ?? false;
  const gmailBlock = gmailSyncBlockedReason(thread, googleConnectedAccountId);
  const canSyncGmail = gmailBlock === null;
  const previewText = snippetForListRow(thread.snippet);

  const intent = thread.ai_routing_metadata?.classified_intent?.trim() || "";
  const isUnlinked = thread.weddingId == null;
  const bucket = isUnlinked ? deriveInboxThreadBucket(thread) : null;
  const bucketLabel = isUnlinked ? inboxUnlinkedBucketChipLabel(thread) : null;
  const showIntentChip =
    Boolean(intent) &&
    (!isUnlinked || bucket === "inquiry" || bucket === "unfiled");

  const userLabelsOnThread = useMemo(
    () => userGmailLabelsOnThread(thread.gmailLabelIds, gmailLabelCatalog),
    [thread.gmailLabelIds, gmailLabelCatalog],
  );

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

  const starTitle = [gmailBlock, gmailActionError, starred ? "Unstar in Gmail" : "Star in Gmail"]
    .filter(Boolean)
    .join(" · ");

  const onStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canSyncGmail || gmailSyncing) return;
    void runGmailModify(starred ? "unstar" : "star");
  };

  return (
    <li
      role="button"
      tabIndex={0}
      data-inbox-thread-row={thread.id}
      data-selected={selected ? "true" : "false"}
      data-unread={unread ? "true" : "false"}
      className="mrow"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={() => onHoverPrefetch?.()}
      onMouseLeave={() => onHoverPrefetchCancel?.()}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onRowFocusPrefetch?.();
      }}
    >
      {/* `Ana Dashboard.html`: empty `.cb` — bulk selection not in mock */}
      <div className="cb" onClick={(e) => e.stopPropagation()} aria-hidden />
      {gmailSyncing ? (
        <Loader2 className="mrow-star-spin" strokeWidth={1.75} aria-hidden />
      ) : starred ? (
        <svg
          className="star active"
          viewBox="0 0 24 24"
          fill="currentColor"
          role="img"
          aria-label={canSyncGmail ? "Unstar" : "Star unavailable"}
          title={starTitle || undefined}
          onClick={onStarClick}
          style={{ cursor: canSyncGmail ? "pointer" : "not-allowed" }}
        >
          <polygon points={STAR_POLY} />
        </svg>
      ) : (
        <svg
          className="star"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          role="img"
          aria-label={canSyncGmail ? "Star" : "Star unavailable"}
          title={starTitle || undefined}
          onClick={onStarClick}
          style={{ cursor: canSyncGmail ? "pointer" : "not-allowed" }}
        >
          <polygon points={STAR_POLY} />
        </svg>
      )}
      <div className="mbody">
        <div className="who">
          {!unread ? null : <span className="dotunread" aria-hidden />}
          {thread.sender?.trim() ? <span className="mrow-who-truncate">{thread.sender}</span> : null}
        </div>
        <div className="subj">
          {thread.title?.trim() ? <span className="subj-title">{thread.title}</span> : null}
          {previewText ? <span className="snippet"> — {previewText}</span> : null}
        </div>
        <div className="tags">
          {hasPendingDraft ? <span className="ttag fin">Ana drafted</span> : null}
          {bucketLabel ? (
            <span className={bucket === "inquiry" ? "ttag fin" : "ttag"}>{bucketLabel}</span>
          ) : null}
          {showIntentChip ? <span className="ttag">{intent}</span> : null}
          {userLabelsOnThread.map((l) => (
            <span key={l.id} className="ttag">
              {l.name}
            </span>
          ))}
          {linkedCoupleNames ? (
            <span className="ttag book" title={linkedCoupleNames}>
              {truncate(linkedCoupleNames, 36)}
            </span>
          ) : null}
          {linkedWeddingStage ? (
            <span className={linkedWeddingStage === "booked" ? "ttag book" : "ttag"}>
              {formatProjectStageLabel(linkedWeddingStage)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="right">
        <span className="when">{formatInboxTimeAgo(thread.last_activity_at)}</span>
      </div>
    </li>
  );
}
