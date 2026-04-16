import type { UnfiledThread } from "../hooks/useUnfiledInbox";
import type { Tables } from "../types/database.types";
import {
  GMAIL_LABEL_DRAFT,
  GMAIL_LABEL_SENT,
  GMAIL_LABEL_STARRED,
} from "./gmailInboxLabels";

export const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
export const ACTIVE_STAGES = new Set(["booked", "prep"]);

export type InboxFolder = "inbox" | "starred" | "sent" | "drafts";
export type InboxListTab = "all" | "inquiries" | "unassigned";

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
  const { inboxThreads, weddings, inboxFolder, listTab, projectFilterWeddingId, gmailLabelFilterId } = args;

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

  const inquiryWeddingIds = new Set(
    weddings.filter((w) => INQUIRY_STAGES.has(w.stage)).map((w) => w.id),
  );

  let rows = inboxThreads;

  if (gmailLabelFilterId != null) {
    rows = applyGmailUserLabelFilter(rows, gmailLabelFilterId);
  }

  if (projectFilterWeddingId != null) {
    rows = rows.filter((t) => t.weddingId === projectFilterWeddingId);
  } else {
    if (listTab === "unassigned") {
      rows = rows.filter((t) => t.weddingId === null);
    } else if (listTab === "inquiries") {
      rows = rows.filter((t) => t.weddingId != null && inquiryWeddingIds.has(t.weddingId));
    }
  }

  const folderUsesGmailLabelMetadata = inboxFolder !== "inbox";
  rows = applyInboxFolderFilter(rows, inboxFolder);

  return {
    threads: rows,
    gmailLabelFilterUnsupported: false,
    folderUsesGmailLabelMetadata,
  };
}
