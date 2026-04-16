import { describe, expect, it, beforeEach } from "vitest";
import {
  INBOX_DEEP_LINK_STORAGE_KEY,
  clearPersistedInboxDeepLink,
  persistInboxDeepLinkPayload,
  payloadFromSearchParams,
  readPersistedInboxDeepLink,
  resolveInboxDeepLinkPayload,
  serializeInboxDeepLinkPayload,
} from "./inboxDeepLinkPersistence";

const mem: Record<string, string> = {};

describe("inboxDeepLinkPersistence", () => {
  beforeEach(() => {
    Object.keys(mem).forEach((k) => delete mem[k]);
    globalThis.sessionStorage = {
      getItem: (k: string) => (k in mem ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
      clear: () => {
        Object.keys(mem).forEach((k) => delete mem[k]);
      },
      key: () => null,
      length: 0,
    } as Storage;
    clearPersistedInboxDeepLink();
  });

  it("payloadFromSearchParams requires threadId", () => {
    expect(payloadFromSearchParams(new URLSearchParams(""))).toBeNull();
    expect(
      payloadFromSearchParams(new URLSearchParams("threadId=t1&action=review_draft")),
    ).toEqual({ threadId: "t1", draftId: null, action: "review_draft" });
  });

  it("persist + read round-trip", () => {
    const p = { threadId: "t1", draftId: "d1", action: "review_draft" as string | null };
    persistInboxDeepLinkPayload(p);
    expect(readPersistedInboxDeepLink()).toEqual(p);
    clearPersistedInboxDeepLink();
    expect(readPersistedInboxDeepLink()).toBeNull();
  });

  it("resolveInboxDeepLinkPayload prefers URL over session", () => {
    persistInboxDeepLinkPayload({
      threadId: "old",
      draftId: null,
      action: null,
    });
    const sp = new URLSearchParams("threadId=new&action=review_draft");
    expect(resolveInboxDeepLinkPayload(sp)).toEqual({
      threadId: "new",
      draftId: null,
      action: "review_draft",
    });
  });

  it("resolveInboxDeepLinkPayload does not use session when URL has no threadId", () => {
    persistInboxDeepLinkPayload({
      threadId: "from-session",
      draftId: "d9",
      action: "review_draft",
    });
    expect(resolveInboxDeepLinkPayload(new URLSearchParams(""))).toBeNull();
  });

  it("serializeInboxDeepLinkPayload is stable for dedup", () => {
    const a = serializeInboxDeepLinkPayload({
      threadId: "t",
      draftId: "d",
      action: "review_draft",
    });
    const b = serializeInboxDeepLinkPayload({
      threadId: "t",
      draftId: "d",
      action: "review_draft",
    });
    expect(a).toBe(b);
  });

  it("storage key is exported for hydrator alignment", () => {
    expect(INBOX_DEEP_LINK_STORAGE_KEY).toContain("inboxDeepLink");
  });
});
