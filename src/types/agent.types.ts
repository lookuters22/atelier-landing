export type AgentContext = {
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web" | "whatsapp";
  rawMessage: string;
  crmSnapshot: Record<string, unknown>;
  recentMessages: Array<Record<string, unknown>>;
  threadSummary: string | null;
  memoryHeaders: Array<{
    id: string;
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
