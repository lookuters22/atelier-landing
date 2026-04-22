import type { UnfiledThread } from "../hooks/useUnfiledInbox.ts";
import type { Tables } from "../types/database.types.ts";
import {
  GMAIL_LABEL_DRAFT,
  GMAIL_LABEL_SENT,
  GMAIL_LABEL_STARRED,
  deriveUnreadFromGmailLabelIds,
} from "./gmailInboxLabels.ts";
import { isSuppressedInboxThread } from "./inboxThreadBucket.ts";

export const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
export const ACTIVE_STAGES = new Set(["booked", "prep"]);

export type InboxFolder = "inbox" | "starred" | "sent" | "drafts";
/** Center list tabs — matches `Ana Dashboard.html` (`All` / `Unread` / `Needs reply`). */
export type InboxListTab = "all" | "unread" | "needs_reply";

export type DeriveVisibleInboxThreadsResult = {
  threads: UnfiledThread[];
  /**
   * Gmail label chosen but no thread has `gmail_label_ids` on latest metadata —
   * cannot show matches without pretending (list stays empty with honest empty state).
   */
  gmailLabelFilterUnsupported: boolean;
  /**
   * Starred/Sent/Drafts use Gmail system label ids on latest-message metadata when present.
   * Threads without synced labels never appear in these folders (no fake heuristics).
   */
  folderUsesGmailLabelMetadata: boolean;
};

type WeddingRow = Pick<Tables<"weddings">, "id" | "stage">;

function applyInboxFolderFilter(threads: UnfiledThread[], folder: InboxFolder): UnfiledThread[] {
  if (folder === "inbox") return threads;
  const systemId =
    folder === "starred"
      ? GMAIL_LABEL_STARRED
      : folder === "sent"
        ? GMAIL_LABEL_SENT
        : GMAIL_LABEL_DRAFT;
  return threads.filter((t) => t.gmailLabelIds?.includes(systemId) ?? false);
}

function applyGmailUserLabelFilter(threads: UnfiledThread[], labelId: string): UnfiledThread[] {
  return threads.filter((t) => t.gmailLabelIds != null && t.gmailLabelIds.includes(labelId));
}

/**
 * Client-side view filters on the inbox projection (`useUnfiledInbox` — optional DB `q` already applied).
 * Order: Gmail user label (strict) → project filter → list tab → mailbox folder (system labels).
 */
export function deriveVisibleInboxThreads(args: {
  inboxThreads: UnfiledThread[];
  weddings: WeddingRow[];
  inboxFolder: InboxFolder;
  listTab: InboxListTab;
  projectFilterWeddingId: string | null;
  gmailLabelFilterId: string | null;
}): DeriveVisibleInboxThreadsResult {
  const { inboxThreads, inboxFolder, listTab, projectFilterWeddingId, gmailLabelFilterId } = args;

  if (gmailLabelFilterId != null) {
    const anyRowHasLabelMembership = inboxThreads.some((t) => t.gmailLabelIds != null && t.gmailLabelIds.length > 0);
    if (!anyRowHasLabelMembership) {
      return {
        threads: [],
        gmailLabelFilterUnsupported: true,
        folderUsesGmailLabelMetadata: false,
      };
    }
  }

  let rows = inboxThreads.filter((t) => !isSuppressedInboxThread(t));

  if (gmailLabelFilterId != null) {
    rows = applyGmailUserLabelFilter(rows, gmailLabelFilterId);
  }

  if (projectFilterWeddingId != null) {
    rows = rows.filter((t) => t.weddingId === projectFilterWeddingId);
  } else {
    if (listTab === "unread") {
      rows = rows.filter((t) => deriveUnreadFromGmailLabelIds(t.gmailLabelIds) ?? false);
    }
    /* needs_reply: no extra filter yet — HTML demo tab; list matches “all” until reply-detection exists */
  }

  const folderUsesGmailLabelMetadata = inboxFolder !== "inbox";
  rows = applyInboxFolderFilter(rows, inboxFolder);

  return {
    threads: rows,
    gmailLabelFilterUnsupported: false,
    folderUsesGmailLabelMetadata,
  };
}

/** Counts for `.list-tab` badges — same pipeline as {@link deriveVisibleInboxThreads} but before `listTab` filtering. */
export function deriveInboxListHeadCounts(args: {
  inboxThreads: UnfiledThread[];
  inboxFolder: InboxFolder;
  projectFilterWeddingId: string | null;
  gmailLabelFilterId: string | null;
}): { all: number; unread: number; needs_reply: number; unsupported: boolean } {
  const { inboxThreads, inboxFolder, projectFilterWeddingId, gmailLabelFilterId } = args;

  if (gmailLabelFilterId != null) {
    const anyRowHasLabelMembership = inboxThreads.some((t) => t.gmailLabelIds != null && t.gmailLabelIds.length > 0);
    if (!anyRowHasLabelMembership) {
      return { all: 0, unread: 0, needs_reply: 0, unsupported: true };
    }
  }

  let rows = inboxThreads.filter((t) => !isSuppressedInboxThread(t));
  if (gmailLabelFilterId != null) {
    rows = applyGmailUserLabelFilter(rows, gmailLabelFilterId);
  }
  if (projectFilterWeddingId != null) {
    rows = rows.filter((t) => t.weddingId === projectFilterWeddingId);
  }
  rows = applyInboxFolderFilter(rows, inboxFolder);

  const all = rows.length;
  const unread = rows.filter((t) => deriveUnreadFromGmailLabelIds(t.gmailLabelIds) ?? false).length;
  /** No reply-detection signal yet — honest zero (HTML demo used a placeholder). */
  const needs_reply = 0;

  return { all, unread, needs_reply, unsupported: false };
}
