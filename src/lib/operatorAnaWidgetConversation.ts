import type { OperatorStudioAssistantAssistantDisplay } from "./operatorStudioAssistantWidgetResult.ts";
import {
  clipOperatorAnaWidgetConversationText,
  focusSnapshotEquals,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_ASSISTANT_CHARS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TOTAL_CHARS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TURN_PAIRS,
  OPERATOR_ANA_WIDGET_CONVERSATION_MAX_USER_CHARS,
  type OperatorAnaWebConversationMessage,
  type OperatorAnaWidgetFocusSnapshot,
} from "./operatorAnaWidgetConversationBounds.ts";

/**
 * One completed user→assistant turn with the route focus that was active when the user sent.
 */
export type OperatorAnaWidgetCompletedTurn = {
  userText: string;
  assistantText: string;
  focus: OperatorAnaWidgetFocusSnapshot;
};

export function assistantDisplayToOperatorAnaReplyText(d: OperatorStudioAssistantAssistantDisplay): string {
  if (d.kind === "contract_violation") {
    return d.mainText;
  }
  return d.mainText;
}

type WidgetUserLine = {
  role: "user";
  text: string;
  focusSnapshot: OperatorAnaWidgetFocusSnapshot;
};

type WidgetAssistantLine = {
  role: "assistant";
  display: OperatorStudioAssistantAssistantDisplay;
  focusSnapshot: OperatorAnaWidgetFocusSnapshot;
};

/** In-flight streaming assistant line — not a completed turn. */
type WidgetAssistantInFlightLine = {
  role: "assistant";
  kind: "in_flight";
  streamingText: string;
  focusSnapshot: OperatorAnaWidgetFocusSnapshot;
};

/**
 * Walks in-memory chat lines and extracts completed (user, assistant) pairs in order.
 * Drops any trailing incomplete user-only turn.
 * Skips a user line followed by a streaming in-flight assistant line (no completed assistant reply yet).
 */
export function extractOperatorAnaWidgetCompletedTurns(
  lines: ReadonlyArray<WidgetUserLine | WidgetAssistantLine | WidgetAssistantInFlightLine>,
): OperatorAnaWidgetCompletedTurn[] {
  const out: OperatorAnaWidgetCompletedTurn[] = [];
  for (let i = 0; i < lines.length; i++) {
    const u = lines[i];
    if (u?.role !== "user") continue;
    const a = lines[i + 1];
    if (a?.role !== "assistant") break;
    if ("kind" in a && a.kind === "in_flight") break;
    out.push({
      userText: u.text,
      assistantText: assistantDisplayToOperatorAnaReplyText(a.display),
      focus: u.focusSnapshot,
    });
    i += 1;
  }
  return out;
}

/**
 * @param priorCompletedTurns — chronological completed pairs (oldest first).
 * @param currentFocus — current route focus; turns whose `focus` differs are dropped.
 * @returns Messages for OpenAI `messages[]` (after `system`, before the current user context). Oldest first.
 */
export function buildOperatorAnaWidgetConversation(
  priorCompletedTurns: OperatorAnaWidgetCompletedTurn[],
  currentFocus: OperatorAnaWidgetFocusSnapshot,
): OperatorAnaWebConversationMessage[] {
  const sameFocus = priorCompletedTurns.filter((t) => focusSnapshotEquals(t.focus, currentFocus));
  const lastPairs = sameFocus.slice(-OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TURN_PAIRS);

  const out: OperatorAnaWebConversationMessage[] = [];
  for (const p of lastPairs) {
    out.push({
      role: "user",
      content: clipOperatorAnaWidgetConversationText(p.userText, OPERATOR_ANA_WIDGET_CONVERSATION_MAX_USER_CHARS),
    });
    out.push({
      role: "assistant",
      content: clipOperatorAnaWidgetConversationText(p.assistantText, OPERATOR_ANA_WIDGET_CONVERSATION_MAX_ASSISTANT_CHARS),
    });
  }

  function totalChars(msgs: OperatorAnaWebConversationMessage[]): number {
    return msgs.reduce((n, m) => n + m.content.length, 0);
  }
  let cur = out;
  while (cur.length > 0 && totalChars(cur) > OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TOTAL_CHARS) {
    cur = cur.slice(2);
  }
  return cur;
}
