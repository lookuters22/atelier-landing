/**
 * Named bounds for {@link buildOperatorAnaWidgetConversation} (operator Ana widget, client-only).
 */

export const OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TURN_PAIRS = 3;
/** Max characters per user turn after trimming (raw question text, not the formatted context). */
export const OPERATOR_ANA_WIDGET_CONVERSATION_MAX_USER_CHARS = 800;
/** Max characters per assistant turn (visible reply / mainText). */
export const OPERATOR_ANA_WIDGET_CONVERSATION_MAX_ASSISTANT_CHARS = 1200;
/** Max total characters across all history contents (excludes the current request’s formatted user block). */
export const OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TOTAL_CHARS = 6000;

export type OperatorAnaWidgetFocusSnapshot = {
  weddingId: string | null;
  personId: string | null;
};

export type OperatorAnaWebConversationMessage = { role: "user" | "assistant"; content: string };

export function focusSnapshotEquals(a: OperatorAnaWidgetFocusSnapshot, b: OperatorAnaWidgetFocusSnapshot): boolean {
  return a.weddingId === b.weddingId && a.personId === b.personId;
}

export function clipOperatorAnaWidgetConversationText(s: string, maxChars: number): string {
  const t = s.trim();
  if (t.length <= maxChars) return t;
  if (maxChars <= 1) return "…";
  return `${t.slice(0, maxChars - 1)}…`;
}
