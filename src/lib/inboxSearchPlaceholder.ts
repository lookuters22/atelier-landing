import type { InboxFolder } from "./inboxVisibleThreads";

export function buildInboxSearchPlaceholder(opts: {
  inboxFolder: InboxFolder;
  gmailLabelFilterId: string | null;
  gmailLabels: { id: string; name: string }[];
  projectFilterWeddingId: string | null;
}): string {
  const labelName =
    opts.gmailLabelFilterId != null
      ? opts.gmailLabels.find((l) => l.id === opts.gmailLabelFilterId)?.name ?? null
      : null;
  if (labelName) return `Search label: ${labelName}`;
  if (opts.projectFilterWeddingId) return "Search project threads";
  switch (opts.inboxFolder) {
    case "starred":
      return "Search Starred";
    case "sent":
      return "Search Sent";
    case "drafts":
      return "Search Drafts";
    default:
      return "Search mail, clients, projects…";
  }
}
