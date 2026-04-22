/**
 * Shared validation for LLM-parsed proposals and the confirm edge (Slice 6).
 * Enforces `proposed_scope` / `proposed_channel` invariants from `review_playbook_rule_candidate`.
 */
import type { Database } from "../../../../src/types/database.types.ts";
import type {
  InsertOperatorAssistantPlaybookRuleCandidateBody,
  OperatorAssistantProposedActionPlaybookRuleCandidate,
} from "../../../../src/types/operatorAssistantProposedAction.types.ts";

const MAX_ACTION_KEY = 200;
const MAX_TOPIC = 200;
const MAX_INSTRUCTION = 8000;

const DECISION_MODES: ReadonlySet<Database["public"]["Enums"]["decision_mode"]> = new Set([
  "auto",
  "draft_only",
  "ask_first",
  "forbidden",
]);

const SCOPES: ReadonlySet<Database["public"]["Enums"]["rule_scope"]> = new Set(["global", "channel"]);

const CHANNELS: ReadonlySet<Database["public"]["Enums"]["thread_channel"]> = new Set([
  "email",
  "web",
  "whatsapp_operator",
  "manual",
  "system",
]);

export type ValidatedPlaybookRuleCandidatePayload = InsertOperatorAssistantPlaybookRuleCandidateBody;

function trimStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function validatePlaybookRuleCandidatePayload(
  raw: unknown,
): { ok: true; value: ValidatedPlaybookRuleCandidatePayload } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "payload must be an object" };
  }
  const o = raw as Record<string, unknown>;

  const proposedActionKey = trimStr(o.proposedActionKey, MAX_ACTION_KEY);
  const topic = trimStr(o.topic, MAX_TOPIC);
  const proposedInstruction = trimStr(o.proposedInstruction, MAX_INSTRUCTION);
  if (!proposedActionKey) return { ok: false, error: "proposedActionKey is required" };
  if (!topic) return { ok: false, error: "topic is required" };
  if (!proposedInstruction) return { ok: false, error: "proposedInstruction is required" };

  const dm = o.proposedDecisionMode;
  if (typeof dm !== "string" || !DECISION_MODES.has(dm as Database["public"]["Enums"]["decision_mode"])) {
    return { ok: false, error: "proposedDecisionMode must be auto, draft_only, ask_first, or forbidden" };
  }

  const sc = o.proposedScope;
  if (typeof sc !== "string" || !SCOPES.has(sc as Database["public"]["Enums"]["rule_scope"])) {
    return { ok: false, error: "proposedScope must be global or channel" };
  }

  const proposedScope = sc as Database["public"]["Enums"]["rule_scope"];
  let proposedChannel: Database["public"]["Enums"]["thread_channel"] | null = null;
  if (o.proposedChannel != null) {
    if (typeof o.proposedChannel !== "string" || !CHANNELS.has(o.proposedChannel as never)) {
      return { ok: false, error: "proposedChannel is invalid" };
    }
    proposedChannel = o.proposedChannel as Database["public"]["Enums"]["thread_channel"];
  }

  if (proposedScope === "global" && proposedChannel != null) {
    return { ok: false, error: "proposedChannel must be null for global scope" };
  }
  if (proposedScope === "channel" && proposedChannel == null) {
    return { ok: false, error: "proposedChannel is required for channel scope" };
  }

  let weddingId: string | null = null;
  if (o.weddingId != null) {
    if (typeof o.weddingId !== "string" || o.weddingId.trim().length === 0) {
      return { ok: false, error: "weddingId must be a non-empty string when set" };
    }
    weddingId = o.weddingId.trim();
  }

  return {
    ok: true,
    value: {
      proposedActionKey,
      topic,
      proposedInstruction,
      proposedDecisionMode: dm as Database["public"]["Enums"]["decision_mode"],
      proposedScope,
      proposedChannel: proposedScope === "global" ? null : proposedChannel,
      weddingId,
    },
  };
}

/**
 * Coerce a single LLM object (unknown) into a validated proposal, or return null to drop.
 */
export function tryParseLlmProposedPlaybookRuleCandidate(
  item: unknown,
): { ok: true; value: OperatorAssistantProposedActionPlaybookRuleCandidate } | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "playbook_rule_candidate") {
    return { ok: false, reason: "not a playbook_rule_candidate" };
  }
  const v = validatePlaybookRuleCandidatePayload(item);
  if (!v.ok) return { ok: false, reason: v.error };
  return {
    ok: true,
    value: {
      kind: "playbook_rule_candidate",
      ...v.value,
    },
  };
}
