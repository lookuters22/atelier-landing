import type { TodayAction, TodayActionType } from "./todayActionFeed";

/** Maps aggregated Today actions to ZenLobby Priority Actions row kind. */
export type ZenLobbyPriorityKind = "message" | "draft" | "task" | "escalation";

const ACTION_TYPE_TO_KIND: Record<TodayActionType, ZenLobbyPriorityKind> = {
  unfiled_thread: "message",
  linked_lead_thread: "message",
  draft_approval: "draft",
  open_task: "task",
  open_escalation: "escalation",
};

export function zenLobbyPriorityKindFromAction(action: TodayAction): ZenLobbyPriorityKind {
  return ACTION_TYPE_TO_KIND[action.action_type] ?? "message";
}

export function isZenLobbyEscalationRow(kind: ZenLobbyPriorityKind): boolean {
  return kind === "escalation";
}

/** Shown on escalation rows in Priority Actions (premium, unmistakable). */
export const ZEN_LOBBY_ESCALATION_ROW_BADGE = "Blocked decision";
