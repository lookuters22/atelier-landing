import { describe, expect, it } from "vitest";
import type { PendingDraft } from "../hooks/usePendingApprovals";
import { selectPendingDraftForInboxThread } from "./inboxUnfiledPendingDraft";

function draft(over: Partial<PendingDraft> & { id: string; thread_id: string }): PendingDraft {
  return {
    body: "",
    thread_title: "S",
    wedding_id: "",
    couple_names: "X",
    photographer_id: "ph",
    ...over,
  };
}

describe("selectPendingDraftForInboxThread", () => {
  it("returns undefined when no draft matches thread", () => {
    expect(selectPendingDraftForInboxThread([draft({ id: "d1", thread_id: "t1" })], "t9", null)).toBeUndefined();
  });

  it("returns the only matching draft", () => {
    const d = draft({ id: "d1", thread_id: "t1" });
    expect(selectPendingDraftForInboxThread([d], "t1", null)).toBe(d);
  });

  it("prefers deep-linked draft id when present on that thread", () => {
    const a = draft({ id: "d-a", thread_id: "t1", body: "a" });
    const b = draft({ id: "d-b", thread_id: "t1", body: "b" });
    expect(selectPendingDraftForInboxThread([a, b], "t1", "d-b")).toBe(b);
  });

  it("falls back to first thread match when deep link id does not match", () => {
    const a = draft({ id: "d-a", thread_id: "t1" });
    const b = draft({ id: "d-b", thread_id: "t1" });
    expect(selectPendingDraftForInboxThread([a, b], "t1", "missing")).toBe(a);
  });
});
