import { useCallback, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useThreadMessagesForInbox } from "../../../hooks/useThreadMessagesForInbox";
import { useInboxMode } from "./InboxModeContext";
import { ConversationFeed } from "../../chat/ConversationFeed";
import { GmailThreadInlineReplyDock } from "./GmailThreadInlineReplyDock";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";

export function InboxThreadDetailPane({ thread }: { thread: UnfiledThread }) {
  return <InboxThreadDetailContent key={thread.id} thread={thread} />;
}

function InboxThreadDetailContent({ thread }: { thread: UnfiledThread }) {
  const { backToList } = useInboxMode();
  const { refetch } = useUnfiledInbox();

  const {
    chatMessages,
    latestProviderMessageId: latestProviderMessageIdFromHistory,
    loading: historyLoading,
    error: historyError,
  } = useThreadMessagesForInbox(thread.id);

  const lastMessageId = useMemo(
    () => (chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].id : ""),
    [chatMessages],
  );
  const [messageExpanded, setMessageExpanded] = useState<Record<string, boolean>>({});

  const toggleMessageRow = useCallback(
    (foldKey: string) => {
      setMessageExpanded((prev) => {
        const def = foldKey === lastMessageId;
        const cur = prev[foldKey] ?? def;
        return { ...prev, [foldKey]: !cur };
      });
    },
    [lastMessageId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex min-h-[88px] shrink-0 items-start gap-3 border-b border-border px-4 py-4">
        <button
          type="button"
          onClick={backToList}
          className="mt-0.5 inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-border bg-background px-3 text-[12px] font-medium text-foreground transition hover:bg-accent"
          aria-label="Back to inbox list"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
          Back
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">{thread.title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{thread.sender || "Unknown sender"}</p>
        </div>
      </div>

      {historyError ? (
        <p className="mx-5 mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          Could not load full conversation: {historyError}
        </p>
      ) : null}

      <ConversationFeed
        earlierMessages={chatMessages}
        todayMessages={[]}
        foldable
        expandedMap={messageExpanded}
        defaultExpanded={(m) => m.id === lastMessageId}
        onToggle={toggleMessageRow}
        emptyText={historyLoading ? "Loading conversation…" : "No messages in this thread yet."}
        bottomSlot={
          <GmailThreadInlineReplyDock
            threadId={thread.id}
            threadTitle={thread.title}
            hasGmailImport={thread.hasGmailImport}
            latestProviderMessageIdHint={thread.latestProviderMessageId}
            aiRoutingMetadata={thread.ai_routing_metadata}
            afterSuccessfulSend={async () => {
              await refetch();
            }}
            conversationPreload={{
              chatMessages,
              latestProviderMessageIdFromHistory,
              historyLoading,
            }}
          />
        }
      />
    </div>
  );
}
