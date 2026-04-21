import { describe, expect, it } from "vitest";
import type { TodayAction } from "./todayActionFeed";
import {
  isZenLobbyEscalationRow,
  zenLobbyPriorityKindFromAction,
  ZEN_LOBBY_ESCALATION_ROW_BADGE,
} from "./zenLobbyPriorityFeed";

function baseAction(overrides: Partial<TodayAction>): TodayAction {
  return {
    id: "x",
    action_type: "unfiled_thread",
    title: "t",
    subtitle: "s",
    status_label: "Unfiled",
    route_to: "/inbox",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("zenLobbyPriorityKindFromAction", () => {
  it("maps open_escalation to escalation", () => {
    expect(
      zenLobbyPriorityKindFromAction(baseAction({ action_type: "open_escalation" })),
    ).toBe("escalation");
  });

  it("maps other action types to feed kinds", () => {
    expect(zenLobbyPriorityKindFromAction(baseAction({ action_type: "unfiled_thread" }))).toBe(
      "message",
    );
    expect(zenLobbyPriorityKindFromAction(baseAction({ action_type: "draft_approval" }))).toBe(
      "draft",
    );
    expect(zenLobbyPriorityKindFromAction(baseAction({ action_type: "open_task" }))).toBe("task");
    expect(
      zenLobbyPriorityKindFromAction(baseAction({ action_type: "linked_lead_thread" })),
    ).toBe("message");
  });
});

describe("isZenLobbyEscalationRow", () => {
  it("is true only for escalation kind", () => {
    expect(isZenLobbyEscalationRow("escalation")).toBe(true);
    expect(isZenLobbyEscalationRow("message")).toBe(false);
  });
});

describe("ZEN_LOBBY_ESCALATION_ROW_BADGE", () => {
  it("is a stable escalation label for Priority Actions", () => {
    expect(ZEN_LOBBY_ESCALATION_ROW_BADGE).toBe("Blocked decision");
  });
});
