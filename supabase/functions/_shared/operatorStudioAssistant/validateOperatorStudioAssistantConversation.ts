/**
 * Stateless validation for optional client-provided `conversation` on operator-studio-assistant.
 */
import {
  clipOperatorAnaWidgetConversationText,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_ASSISTANT_CHARS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TOTAL_CHARS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TURN_PAIRS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_USER_CHARS,
  type OperatorAnaWebConversationMessage,
} from "../../../../src/lib/operatorAnaWidgetConversationBounds.ts";

const MAX_CONVERSATION_MESSAGES = OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TURN_PAIRS * 2;

export function validateAndNormalizeOperatorStudioAssistantConversation(
  raw: unknown,
): { ok: true; value: OperatorAnaWebConversationMessage[] } | { ok: false; error: string } {
  if (raw === undefined) {
    return { ok: true, value: [] };
  }
  if (raw == null) {
    return { ok: false, error: "conversation must be an array when present" };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "conversation must be an array" };
  }
  if (raw.length > MAX_CONVERSATION_MESSAGES) {
    return { ok: false, error: "conversation: too many messages" };
  }
  const out: OperatorAnaWebConversationMessage[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "conversation: each item must be an object" };
    }
    const o = item as Record<string, unknown>;
    if (o.role !== "user" && o.role !== "assistant") {
      return { ok: false, error: "conversation: role must be user or assistant" };
    }
    if (typeof o.content !== "string") {
      return { ok: false, error: "conversation: content must be a string" };
    }
    const trimmed = o.content.trim();
    if (!trimmed) {
      return { ok: false, error: "conversation: content must be non-empty" };
    }
    const clipped =
      o.role === "user"
        ? clipOperatorAnaWidgetConversationText(trimmed, OPERATOR_ANA_WIDGET_CONVERSATION_MAX_USER_CHARS)
        : clipOperatorAnaWidgetConversationText(trimmed, OPERATOR_ANA_WIDGET_CONVERSATION_MAX_ASSISTANT_CHARS);
    out.push({ role: o.role, content: clipped });
  }
  if (out.length % 2 !== 0) {
    return { ok: false, error: "conversation: must be complete user/assistant turn pairs" };
  }
  for (let i = 0; i < out.length; i++) {
    const want: "user" | "assistant" = i % 2 === 0 ? "user" : "assistant";
    if (out[i]!.role !== want) {
      return { ok: false, error: "conversation: must start with user and alternate with assistant" };
    }
  }
  let t = out;
  while (
    t.length > 0 &&
    t.reduce((n, m) => n + m.content.length, 0) > OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TOTAL_CHARS
  ) {
    t = t.slice(2);
  }
  return { ok: true, value: t };
}
