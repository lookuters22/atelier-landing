/** Persisted shape for `inbox:inlineReplyDraft:${threadId}` */
export type InboxInlineReplyDraftV1 = {
  body: string;
  to: string;
  cc: string;
  bcc: string;
  showCc: boolean;
  showBcc: boolean;
  /** When `reply` or `forward`, composer was open */
  composeMode: "idle" | "reply" | "forward";
};

export function inboxInlineReplyDraftKey(threadId: string): string {
  return `inbox:inlineReplyDraft:${threadId}`;
}

export function readInboxInlineReplyDraft(threadId: string): InboxInlineReplyDraftV1 | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(inboxInlineReplyDraftKey(threadId));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<InboxInlineReplyDraftV1>;
    if (typeof o !== "object" || o === null) return null;
    return {
      body: typeof o.body === "string" ? o.body : "",
      to: typeof o.to === "string" ? o.to : "",
      cc: typeof o.cc === "string" ? o.cc : "",
      bcc: typeof o.bcc === "string" ? o.bcc : "",
      showCc: Boolean(o.showCc),
      showBcc: Boolean(o.showBcc),
      composeMode:
        o.composeMode === "reply" || o.composeMode === "forward" || o.composeMode === "idle"
          ? o.composeMode
          : "idle",
    };
  } catch {
    return null;
  }
}

export function writeInboxInlineReplyDraft(threadId: string, draft: InboxInlineReplyDraftV1): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(inboxInlineReplyDraftKey(threadId), JSON.stringify(draft));
  } catch {
    /* quota */
  }
}

export function clearInboxInlineReplyDraft(threadId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(inboxInlineReplyDraftKey(threadId));
  } catch {
    /* ignore */
  }
}
