import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

vi.mock("../inngest.ts", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT: "operator/escalation.pending_delivery.v1",
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION: 1,
}));

import { routeNonWeddingBusinessInquiry } from "./nonWeddingBusinessInquiryRouter.ts";

type PlaybookRuleRow = {
  id: string;
  action_key: string;
  topic: string;
  decision_mode: "auto" | "draft_only" | "ask_first" | "forbidden";
  scope: "global" | "channel";
  channel: string | null;
  instruction: string;
  source_type: string;
  confidence_label: string;
  is_active: boolean;
};

type MockState = {
  rules: PlaybookRuleRow[];
  threadMetadata: Record<string, unknown> | null;
  existingDrafts: {
    id: string;
    source_action_key: string;
    status?: string;
    photographer_id?: string;
    thread_id?: string;
    body?: string;
    instruction_history?: unknown;
  }[];
  existingEscalations: {
    id: string;
    status: string;
    action_key?: string;
    photographer_id?: string;
    thread_id?: string;
  }[];
  nextDraftId?: string;
  nextEscalationId?: string;
};

function buildSupabaseMock(state: MockState): {
  client: SupabaseClient;
  draftInserts: Record<string, unknown>[];
  escalationInserts: Record<string, unknown>[];
  threadUpdates: Record<string, unknown>[];
} {
  const draftInserts: Record<string, unknown>[] = [];
  const escalationInserts: Record<string, unknown>[] = [];
  const threadUpdates: Record<string, unknown>[] = [];

  // Chainable "eq/like/in/limit" helpers that resolve to a fixed dataset.
  function selectChain<T>(rows: T[]) {
    const finalReturn = { data: rows, error: null };
    const chain: Record<string, unknown> = {};
    const single = async () => ({
      data: rows.length > 0 ? (rows[0] as unknown) : null,
      error: null,
    });
    const maybeSingle = single;
    chain.eq = () => chain;
    chain.like = () => chain;
    chain.in = async () => finalReturn;
    chain.limit = async () => finalReturn;
    chain.single = single;
    chain.maybeSingle = maybeSingle;
    // Also let awaiting the chain itself resolve to the dataset, so tests don't need to know
    // which terminal modifier the implementation used.
    (chain as unknown as PromiseLike<typeof finalReturn>).then = (
      onFulfilled: (v: typeof finalReturn) => unknown,
    ) => Promise.resolve(finalReturn).then(onFulfilled);
    return chain;
  }

  const client = {
    from: (table: string) => {
      if (table === "playbook_rules") {
        return {
          select: () => selectChain(state.rules),
        };
      }
      if (table === "drafts") {
        return {
          select: () => {
            const filters: Record<string, string> = {};
            const chain: Record<string, unknown> = {};
            chain.eq = (col: string, val: string) => {
              filters[col] = String(val);
              return chain;
            };
            chain.like = () => chain;
            chain.limit = async () => {
              const rows = state.existingDrafts.filter((d) => {
                if (
                  filters.photographer_id &&
                  (d.photographer_id ?? "photo-1") !== filters.photographer_id
                )
                  return false;
                if (filters.thread_id && (d.thread_id ?? "thread-1") !== filters.thread_id)
                  return false;
                const st = d.status ?? "pending_approval";
                if (filters.status && st !== filters.status) return false;
                if (!d.source_action_key?.startsWith("non_wedding_inquiry_")) return false;
                return true;
              });
              return { data: rows.length > 0 ? [rows[0] as unknown as Record<string, unknown>] : [], error: null };
            };
            return chain;
          },
          insert: (row: Record<string, unknown>) => {
            draftInserts.push(row);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: state.nextDraftId ?? "draft-1" },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "escalation_requests") {
        return {
          select: () => {
            const filters: Record<string, string> = {};
            const chain: Record<string, unknown> = {};
            chain.eq = (col: string, val: string) => {
              filters[col] = String(val);
              return chain;
            };
            chain.limit = async () => {
              const wantAction =
                filters.action_key ?? "non_wedding_inquiry_policy_review";
              const rows = state.existingEscalations.filter((e) => {
                if (
                  filters.photographer_id &&
                  (e.photographer_id ?? "photo-1") !== filters.photographer_id
                )
                  return false;
                if (filters.thread_id && (e.thread_id ?? "thread-1") !== filters.thread_id)
                  return false;
                const ak = e.action_key ?? "non_wedding_inquiry_policy_review";
                if (ak !== wantAction) return false;
                if (filters.status && e.status !== filters.status) return false;
                return true;
              });
              return { data: rows.length > 0 ? [rows[0] as unknown as Record<string, unknown>] : [], error: null };
            };
            return chain;
          },
          insert: (row: Record<string, unknown>) => {
            escalationInserts.push(row);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: state.nextEscalationId ?? "esc-1" },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "threads") {
        return {
          select: () =>
            selectChain(
              state.threadMetadata === undefined
                ? []
                : [{ ai_routing_metadata: state.threadMetadata }],
            ),
          update: (row: Record<string, unknown>) => {
            threadUpdates.push(row);
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, draftInserts, escalationInserts, threadUpdates };
}

function ruleRow(over: Partial<PlaybookRuleRow>): PlaybookRuleRow {
  return {
    id: "rule-1",
    action_key: "non_wedding_inquiry_reply",
    topic: "non_wedding_inquiry",
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction: "Politely point the sender to portrait-only partners.",
    source_type: "manual",
    confidence_label: "explicit",
    is_active: true,
    ...over,
  };
}

const baseInput = {
  photographerId: "photo-1",
  threadId: "thread-1",
  llmIntent: "commercial" as const,
  dispatchIntent: "commercial" as const,
  channel: "email" as const,
  senderEmail: "lead@example.com",
  body: "Do you offer travel sessions unrelated to weddings?",
};

const cleanThreadState: Pick<MockState, "threadMetadata" | "existingDrafts" | "existingEscalations"> = {
  threadMetadata: null,
  existingDrafts: [],
  existingEscalations: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("routeNonWeddingBusinessInquiry", () => {
  it("allowed_draft — seeds a pending_approval draft with the rule instruction", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [ruleRow({ decision_mode: "draft_only" })],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PLAYBOOK_DRAFT_FOR_REVIEW");
    expect(out.draftId).toBe("draft-1");
    expect(out.escalationId).toBeNull();
    expect(out.alreadyRouted).toBe(false);
    expect(draftInserts).toHaveLength(1);
    expect(draftInserts[0]).toMatchObject({
      photographer_id: "photo-1",
      thread_id: "thread-1",
      status: "pending_approval",
      source_action_key: "non_wedding_inquiry_reply",
      body: "Politely point the sender to portrait-only partners.",
    });
    expect(escalationInserts).toHaveLength(0);
  });

  it("disallowed_decline — seeds a decline draft incorporating the rule note", async () => {
    const { client, draftInserts } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [
        ruleRow({
          decision_mode: "forbidden",
          instruction: "We only cover weddings; decline and move on.",
        }),
      ],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PLAYBOOK_FORBIDDEN_DECLINE");
    expect(out.draftId).toBe("draft-1");
    expect(draftInserts[0].body).toMatch(/only take on wedding commissions/i);
    expect(draftInserts[0].body).toMatch(/We only cover weddings/);
  });

  it("unclear_operator_review — inserts escalation, sets hold, emits delivery event", async () => {
    const { client, draftInserts, escalationInserts, threadUpdates } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [], // no matching rules → unclear
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PLAYBOOK_NO_RULE_ESCALATE");
    expect(out.draftId).toBeNull();
    expect(out.escalationId).toBe("esc-1");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(1);
    expect(escalationInserts[0]).toMatchObject({
      photographer_id: "photo-1",
      thread_id: "thread-1",
      action_key: "non_wedding_inquiry_policy_review",
      reason_code: "PLAYBOOK_NO_RULE_ESCALATE",
      operator_delivery: "dashboard_only",
      status: "open",
    });
    expect(threadUpdates).toEqual([
      {
        v3_operator_automation_hold: true,
        v3_operator_hold_escalation_id: "esc-1",
      },
    ]);
  });

  it("allowed_auto — still seeds a draft (no auto-send here; dashboard approval preserved)", async () => {
    const { client, draftInserts } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [ruleRow({ decision_mode: "auto", instruction: "Reply with standard blurb." })],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.decision).toBe("allowed_auto");
    expect(out.reasonCode).toBe("PLAYBOOK_AUTO_REPLY");
    expect(draftInserts[0].body).toBe("Reply with standard blurb.");
    expect(out.escalationId).toBeNull();
  });

  it("ask_first decision_mode — escalates rather than drafts", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [ruleRow({ decision_mode: "ask_first" })],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.decision).toBe("unclear_operator_review");
    expect(out.reasonCode).toBe("PLAYBOOK_ASK_FIRST_ESCALATE");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(1);
  });

  it("idempotent — thread metadata already records a non-wedding business inquiry with a seeded draft", async () => {
    const { client, draftInserts, escalationInserts, threadUpdates } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "draft_only" })],
      threadMetadata: {
        routing_disposition: "non_wedding_business_inquiry",
        policy_decision: "allowed_draft",
        reason_code: "PLAYBOOK_DRAFT_FOR_REVIEW",
        matched_playbook_rule_id: "rule-prior",
        matched_playbook_action_key: "non_wedding_inquiry_reply",
        seeded_draft_id: "draft-prior",
      },
      existingDrafts: [
        {
          id: "draft-prior",
          source_action_key: "non_wedding_inquiry_reply",
          status: "pending_approval",
        },
      ],
      existingEscalations: [],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(true);
    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PLAYBOOK_DRAFT_FOR_REVIEW");
    expect(out.draftId).toBe("draft-prior");
    expect(out.matchedPlaybookRuleId).toBe("rule-prior");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(0);
    expect(threadUpdates).toHaveLength(0);
  });

  it("idempotent — an open escalation already exists on the thread even if metadata was cleared", async () => {
    const { client, draftInserts, escalationInserts, threadUpdates } = buildSupabaseMock({
      rules: [],
      threadMetadata: null,
      existingDrafts: [],
      existingEscalations: [{ id: "esc-prior", status: "open" }],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(true);
    expect(out.escalationId).toBe("esc-prior");
    expect(out.draftId).toBeNull();
    expect(escalationInserts).toHaveLength(0);
    expect(draftInserts).toHaveLength(0);
    expect(threadUpdates).toHaveLength(0);
  });

  it("idempotent — a prior non_wedding_inquiry_* draft exists even without routing metadata", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "forbidden" })],
      threadMetadata: null,
      existingDrafts: [
        {
          id: "draft-prior",
          source_action_key: "non_wedding_inquiry_commercial",
          status: "pending_approval",
          instruction_history: [
            {
              step: "non_wedding_business_inquiry_router",
              decision: "disallowed_decline",
              matched_playbook_rule_id: "rule-commercial",
              matched_playbook_action_key: "non_wedding_inquiry_commercial",
            },
          ],
        },
      ],
      existingEscalations: [],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(true);
    expect(out.draftId).toBe("draft-prior");
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PLAYBOOK_FORBIDDEN_DECLINE");
    expect(out.matchedPlaybookRuleId).toBe("rule-commercial");
    expect(out.matchedPlaybookActionKey).toBe("non_wedding_inquiry_commercial");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(0);
  });

  it("idempotent pending draft — reconstructs allowed_auto from instruction_history when metadata is cleared", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "auto" })],
      threadMetadata: null,
      existingDrafts: [
        {
          id: "draft-auto",
          source_action_key: "non_wedding_inquiry_reply",
          status: "pending_approval",
          instruction_history: [
            {
              step: "non_wedding_business_inquiry_router",
              decision: "allowed_auto",
              matched_playbook_rule_id: "rule-auto",
              matched_playbook_action_key: "non_wedding_inquiry_reply",
            },
          ],
        },
      ],
      existingEscalations: [],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(true);
    expect(out.decision).toBe("allowed_auto");
    expect(out.reasonCode).toBe("PLAYBOOK_AUTO_REPLY");
    expect(out.matchedPlaybookRuleId).toBe("rule-auto");
    expect(out.matchedPlaybookActionKey).toBe("non_wedding_inquiry_reply");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(0);
  });

  it("idempotent pending draft — infers disallowed_decline from default-decline template when history is missing", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "forbidden" })],
      threadMetadata: null,
      existingDrafts: [
        {
          id: "draft-decline-template",
          source_action_key: "non_wedding_inquiry_reply",
          status: "pending_approval",
          body: "Thanks for reaching out! Right now we only take on wedding commissions, so we're not the right fit for this one — but we wish you the best with the shoot.",
        },
      ],
      existingEscalations: [],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(true);
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PLAYBOOK_FORBIDDEN_DECLINE");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(0);
  });

  it("idempotent pending draft — infers disallowed_decline from decline body marker when history is missing", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "forbidden" })],
      threadMetadata: null,
      existingDrafts: [
        {
          id: "draft-decline",
          source_action_key: "non_wedding_inquiry_reply",
          status: "pending_approval",
          body: "Thanks for reaching out! Right now we only take on wedding commissions, so we're not the right fit for this one — but we wish you the best with the shoot.\n\nStudio rule note for operator: We only cover weddings.",
        },
      ],
      existingEscalations: [],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(true);
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PLAYBOOK_FORBIDDEN_DECLINE");
    expect(out.matchedPlaybookActionKey).toBe("non_wedding_inquiry_reply");
    expect(out.matchedPlaybookRuleId).toBeNull();
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(0);
  });

  it("idempotent pending draft — without history or decline body shape, falls back to allowed_draft (auto vs draft indistinguishable)", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "draft_only" })],
      threadMetadata: null,
      existingDrafts: [
        {
          id: "draft-plain",
          source_action_key: "non_wedding_inquiry_reply",
          status: "pending_approval",
          body: "Plain operator-review body from rule instruction only.",
        },
      ],
      existingEscalations: [],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(true);
    expect(out.decision).toBe("allowed_draft");
    expect(out.reasonCode).toBe("PLAYBOOK_DRAFT_FOR_REVIEW");
    expect(out.matchedPlaybookActionKey).toBe("non_wedding_inquiry_reply");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(0);
  });

  it("routing metadata alone does not short-circuit when no pending draft or open escalation exists", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "draft_only" })],
      threadMetadata: {
        routing_disposition: "non_wedding_business_inquiry",
        policy_decision: "allowed_draft",
        reason_code: "PLAYBOOK_DRAFT_FOR_REVIEW",
        matched_playbook_rule_id: "rule-prior",
        matched_playbook_action_key: "non_wedding_inquiry_reply",
        seeded_draft_id: "ghost-draft-id",
      },
      existingDrafts: [],
      existingEscalations: [],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(false);
    expect(out.draftId).toBe("draft-1");
    expect(draftInserts).toHaveLength(1);
    expect(escalationInserts).toHaveLength(0);
  });

  it("metadata-only — approved historical draft does not block; router runs fresh", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "draft_only" })],
      threadMetadata: {
        routing_disposition: "non_wedding_business_inquiry",
        policy_decision: "allowed_draft",
        reason_code: "PLAYBOOK_DRAFT_FOR_REVIEW",
        matched_playbook_rule_id: "rule-prior",
        matched_playbook_action_key: "non_wedding_inquiry_reply",
        seeded_draft_id: "draft-hist",
      },
      existingDrafts: [
        {
          id: "draft-hist",
          source_action_key: "non_wedding_inquiry_reply",
          status: "approved",
        },
      ],
      existingEscalations: [],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(false);
    expect(out.draftId).toBe("draft-1");
    expect(draftInserts).toHaveLength(1);
    expect(escalationInserts).toHaveLength(0);
  });

  it("approved non-wedding draft does not block a new route", async () => {
    const { client, draftInserts } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [ruleRow({ decision_mode: "draft_only" })],
      existingDrafts: [
        {
          id: "draft-old",
          source_action_key: "non_wedding_inquiry_reply",
          status: "approved",
        },
      ],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(false);
    expect(out.draftId).toBe("draft-1");
    expect(draftInserts).toHaveLength(1);
  });

  it("rejected non-wedding draft does not block a new route", async () => {
    const { client, draftInserts } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [ruleRow({ decision_mode: "draft_only" })],
      existingDrafts: [
        {
          id: "draft-old",
          source_action_key: "non_wedding_inquiry_reply",
          status: "rejected",
        },
      ],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(false);
    expect(out.draftId).toBe("draft-1");
    expect(draftInserts).toHaveLength(1);
  });

  it("unknown draft status does not block (non-pending_approval)", async () => {
    const { client, draftInserts } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [ruleRow({ decision_mode: "draft_only" })],
      existingDrafts: [
        {
          id: "draft-weird",
          source_action_key: "non_wedding_inquiry_reply",
          status: "future_unknown_status",
        },
      ],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(false);
    expect(out.draftId).toBe("draft-1");
    expect(draftInserts).toHaveLength(1);
  });

  it("resolved escalation does not block a new route", async () => {
    const { client, draftInserts, escalationInserts, threadUpdates } = buildSupabaseMock({
      rules: [],
      threadMetadata: null,
      existingDrafts: [],
      existingEscalations: [{ id: "esc-old", status: "resolved" }],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(false);
    expect(out.escalationId).toBe("esc-1");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(1);
    expect(threadUpdates.length).toBeGreaterThan(0);
  });

  it("pending draft still short-circuits when a resolved escalation exists on the thread", async () => {
    const { client, draftInserts, escalationInserts } = buildSupabaseMock({
      rules: [ruleRow({ decision_mode: "forbidden" })],
      threadMetadata: null,
      existingDrafts: [
        {
          id: "draft-pend",
          source_action_key: "non_wedding_inquiry_reply",
          status: "pending_approval",
          instruction_history: [
            {
              step: "non_wedding_business_inquiry_router",
              decision: "disallowed_decline",
              matched_playbook_rule_id: "rule-forbidden",
              matched_playbook_action_key: "non_wedding_inquiry_reply",
            },
          ],
        },
      ],
      existingEscalations: [{ id: "esc-old", status: "resolved" }],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.alreadyRouted).toBe(true);
    expect(out.draftId).toBe("draft-pend");
    expect(out.decision).toBe("disallowed_decline");
    expect(out.reasonCode).toBe("PLAYBOOK_FORBIDDEN_DECLINE");
    expect(out.matchedPlaybookRuleId).toBe("rule-forbidden");
    expect(draftInserts).toHaveLength(0);
    expect(escalationInserts).toHaveLength(0);
  });

  it("channel-specific rule for email beats a global rule with the same action_key", async () => {
    const { client, draftInserts } = buildSupabaseMock({
      ...cleanThreadState,
      rules: [
        ruleRow({
          id: "global",
          action_key: "non_wedding_inquiry_reply",
          scope: "global",
          channel: null,
          decision_mode: "forbidden",
        }),
        ruleRow({
          id: "email-specific",
          action_key: "non_wedding_inquiry_reply",
          scope: "channel",
          channel: "email",
          decision_mode: "draft_only",
          instruction: "Email-specific policy: reply briefly.",
        }),
      ],
    });

    const out = await routeNonWeddingBusinessInquiry(client, baseInput);

    expect(out.decision).toBe("allowed_draft");
    expect(out.matchedPlaybookRuleId).toBe("email-specific");
    expect(draftInserts[0].body).toBe("Email-specific policy: reply briefly.");
  });
});
