import { useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useInboxMode } from "./InboxModeContext";
import {
  PipelineTimelinePane,
  PipelineWeddingProviderByWeddingId,
  usePipelineWedding,
} from "../pipeline/PipelineWeddingContext";
import { ConversationFeed, type ChatMessage } from "../../chat/ConversationFeed";
import { UniversalComposeBox } from "../../chat/ComposeBar";

export function InboxWorkspace() {
  const { selection } = useInboxMode();

  if (selection.kind === "none") return <IdleState />;
  if (selection.kind === "thread") return <ThreadView />;
  return (
    <PipelineWeddingProviderByWeddingId weddingId={selection.projectId}>
      <InboxProjectPipelineChat />
    </PipelineWeddingProviderByWeddingId>
  );
}

/** Matches Pipeline center pane: tabs, TimelineTab, draft approval, inline reply, composer modal. */
function InboxProjectPipelineChat() {
  const state = usePipelineWedding();
  if (!state) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <span className="text-[13px] text-muted-foreground">Loading wedding…</span>
      </div>
    );
  }
  return <PipelineTimelinePane />;
}

function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background px-8 text-center">
      <MessageSquare className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
      <p className="mt-3 max-w-[220px] text-[13px] leading-relaxed text-muted-foreground">
        Select a conversation or project to view messages.
      </p>
    </div>
  );
}

function ThreadView() {
  const { selection } = useInboxMode();
  const [reply, setReply] = useState("");

  if (selection.kind !== "thread") return null;
  const thread = selection.thread;

  const earlier: ChatMessage[] = useMemo(
    () => [
      {
        id: thread.id,
        direction: "in" as const,
        sender: thread.sender || "Unknown",
        body: thread.snippet || "No message content available.",
        time: "Received",
      },
    ],
    [thread],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 px-6 py-5 min-h-[88px] flex flex-col justify-center">
        <h2 className="text-lg font-semibold text-foreground">{thread.title}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {thread.sender || "Unknown sender"}
        </p>
      </div>

      <ConversationFeed
        earlierMessages={earlier}
        todayMessages={[]}
        emptyText="No message content available."
      />

      {thread.ai_routing_metadata && (
        <div className="mx-5 mb-2 rounded-lg border border-border bg-accent/50 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            AI Routing
          </p>
          <p className="text-[12px] text-muted-foreground">
            Intent: {thread.ai_routing_metadata.classified_intent} &middot;{" "}
            {Math.round(thread.ai_routing_metadata.confidence_score * 100)}% confidence
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {thread.ai_routing_metadata.reasoning}
          </p>
        </div>
      )}

      <UniversalComposeBox value={reply} onChange={setReply} placeholder="Reply to thread\u2026" />
    </div>
  );
}
