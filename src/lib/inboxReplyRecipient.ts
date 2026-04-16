import {
  extractFirstEmailFromAddressString,
  isLikelyNonReplyableSystemLocalPart,
  mailboxesAreSameMailbox,
  normalizeMailboxForComparison,
} from "./mailboxNormalize";

export type InboxMessageForReply = {
  direction: "in" | "out";
  sender: string;
};

export type ReplyableParticipantResult = {
  /** Original sender string to use in To (e.g. `Name <email>`). */
  displayTo: string;
  /** Normalized mailbox for comparison. */
  normalizedMailbox: string;
};

/**
 * From canonical thread messages (newest → oldest), pick the most recent replyable external participant.
 * Skips outbound rows (sender is operator). Skips self / +variants / obvious system addresses.
 */
export function findMostRecentReplyableExternalParticipant(
  messagesAsc: InboxMessageForReply[],
  connectedAccountEmail: string | null | undefined,
): ReplyableParticipantResult | null {
  const connected = (connectedAccountEmail ?? "").trim();
  for (let i = messagesAsc.length - 1; i >= 0; i--) {
    const m = messagesAsc[i];
    if (!m || m.direction !== "in") continue;
    const display = (m.sender ?? "").trim();
    if (!display) continue;
    const extracted = extractFirstEmailFromAddressString(display);
    if (!extracted) continue;
    const at = extracted.lastIndexOf("@");
    const local = at > 0 ? extracted.slice(0, at) : extracted;
    if (isLikelyNonReplyableSystemLocalPart(local)) continue;
    if (connected && mailboxesAreSameMailbox(extracted, connected)) continue;
    return {
      displayTo: display,
      normalizedMailbox: normalizeMailboxForComparison(extracted),
    };
  }
  return null;
}
