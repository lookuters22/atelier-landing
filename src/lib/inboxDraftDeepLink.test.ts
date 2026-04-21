import { describe, expect, it } from "vitest";
import {
  hasThreadBackedDraftHandoff,
  hasUsableDraftWeddingId,
  INBOX_DRAFT_MISSING_WEDDING_MESSAGE,
  INBOX_UNRESOLVED_DRAFT_MESSAGE,
  isDraftReviewDeepLink,
  resolvePendingThreadHandoff,
} from "./inboxDraftDeepLink";

describe("inboxDraftDeepLink", () => {
  it("detects review_draft deep link when threadId present", () => {
    const sp = new URLSearchParams({ action: "review_draft", threadId: "t1", draftId: "d1" });
    expect(isDraftReviewDeepLink(sp)).toBe(true);
  });

  it("is false without threadId", () => {
    const sp = new URLSearchParams({ action: "review_draft", draftId: "d1" });
    expect(isDraftReviewDeepLink(sp)).toBe(false);
  });

  it("is false for unfiled thread link", () => {
    const sp = new URLSearchParams({ threadId: "t1" });
    expect(isDraftReviewDeepLink(sp)).toBe(false);
  });

  it("exports a non-empty unresolved message", () => {
    expect(INBOX_UNRESOLVED_DRAFT_MESSAGE.length).toBeGreaterThan(20);
  });
});

describe("hasThreadBackedDraftHandoff", () => {
  it("is true when draft has thread_id", () => {
    expect(hasThreadBackedDraftHandoff({ thread_id: "t1" }, null)).toBe(true);
  });

  it("is true when payload threadId is set even if draft thread_id empty", () => {
    expect(hasThreadBackedDraftHandoff({ thread_id: "" }, "t-url")).toBe(true);
  });

  it("is false when neither side has a thread id", () => {
    expect(hasThreadBackedDraftHandoff({ thread_id: "" }, null)).toBe(false);
    expect(hasThreadBackedDraftHandoff(null, "")).toBe(false);
  });
});

describe("hasUsableDraftWeddingId", () => {
  it("is true for non-empty id", () => {
    expect(hasUsableDraftWeddingId("wed-1")).toBe(true);
  });

  it("is false for empty string", () => {
    expect(hasUsableDraftWeddingId("")).toBe(false);
  });

  it("is false for whitespace-only", () => {
    expect(hasUsableDraftWeddingId("   ")).toBe(false);
  });

  it("is false for null and undefined", () => {
    expect(hasUsableDraftWeddingId(null)).toBe(false);
    expect(hasUsableDraftWeddingId(undefined)).toBe(false);
  });
});

describe("draft deep-link messages", () => {
  it("exposes distinct missing-wedding copy", () => {
    expect(INBOX_DRAFT_MISSING_WEDDING_MESSAGE.length).toBeGreaterThan(20);
    expect(INBOX_DRAFT_MISSING_WEDDING_MESSAGE).not.toBe(INBOX_UNRESOLVED_DRAFT_MESSAGE);
  });
});

describe("resolvePendingThreadHandoff", () => {
  it("applies when pending id is on the timeline", () => {
    expect(resolvePendingThreadHandoff("t1", ["t1", "t2"])).toEqual({ kind: "apply", threadId: "t1" });
  });

  it("abandons with empty_timeline when no threads", () => {
    expect(resolvePendingThreadHandoff("t1", [])).toEqual({
      kind: "abandon_with_notice",
      reason: "empty_timeline",
    });
  });

  it("abandons with missing_thread when id not in list", () => {
    expect(resolvePendingThreadHandoff("t9", ["t1", "t2"])).toEqual({
      kind: "abandon_with_notice",
      reason: "missing_thread",
    });
  });

  it("returns null when no pending id", () => {
    expect(resolvePendingThreadHandoff(null, ["t1"])).toBeNull();
  });
});
