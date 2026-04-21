import type { CrmSnapshot } from "./crmSnapshot.types.ts";

export type AgentContext = {
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web" | "whatsapp";
  rawMessage: string;
  crmSnapshot: CrmSnapshot;
  recentMessages: Array<Record<string, unknown>>;
  threadSummary: string | null;
  /**
   * Distinct `thread_participants.person_id` for this thread (reply-mode person memory; Slice 4).
   * Empty when there is no thread or no linked participants.
   */
  replyModeParticipantPersonIds: string[];
  memoryHeaders: Array<{
    id: string;
    /** Null = tenant-wide memory; set when row is scoped to one wedding. */
    wedding_id: string | null;
    /** Set when `scope === 'person'` (`memories.person_id`). */
    person_id: string | null;
    /** Production memory scope (`memories.scope`). */
    scope: "project" | "person" | "studio";
    type: string;
    title: string;
    summary: string;
  }>;
  selectedMemories: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    full_content: string;
  }>;
  globalKnowledge: Array<Record<string, unknown>>;
};

export type AgentResult<TFacts extends Record<string, unknown> = Record<string, unknown>> = {
  success: boolean;
  facts: TFacts;
  confidence: number;
  error: string | null;
};
