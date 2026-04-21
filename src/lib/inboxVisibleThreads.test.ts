import { describe, expect, it } from "vitest";
import type { UnfiledThread } from "../hooks/useUnfiledInbox";
import { deriveVisibleInboxThreads } from "./inboxVisibleThreads";

function thread(partial: Partial<UnfiledThread> & { id: string }): UnfiledThread {
  return {
    latestMessageBody: "",
    latestMessageHtmlSanitized: null,
    gmailRenderHtmlRef: null,
    latestMessageId: null,
    latestMessageAttachments: [],
    latestProviderMessageId: null,
    hasGmailImport: false,
    gmailLabelIds: null,
    title: "S",
    weddingId: null,
    sender: "a@b.com",
    snippet: "",
    last_activity_at: "2026-01-01T00:00:00.000Z",
    ai_routing_metadata: null,
    ...partial,
  };
}

describe("deriveVisibleInboxThreads", () => {
  it("excludes suppressed threads by default", () => {
    const suppressed = thread({
      id: "sup",
      ai_routing_metadata: { routing_disposition: "promo_automated" },
    });
    const openLead = thread({
      id: "lead",
      ai_routing_metadata: { sender_role: "customer_lead" },
    });
    const { threads } = deriveVisibleInboxThreads({
      inboxThreads: [suppressed, openLead],
      weddings: [],
      inboxFolder: "inbox",
      listTab: "all",
      projectFilterWeddingId: null,
      gmailLabelFilterId: null,
    });
    expect(threads.map((t) => t.id)).toEqual(["lead"]);
  });

  it("linked project thread remains visible (inquiry)", () => {
    const linked = thread({
      id: "lnk",
      weddingId: "w-1",
      ai_routing_metadata: { classified_intent: "intake" },
    });
    const { threads } = deriveVisibleInboxThreads({
      inboxThreads: [linked],
      weddings: [{ id: "w-1", stage: "inquiry" }],
      inboxFolder: "inbox",
      listTab: "all",
      projectFilterWeddingId: null,
      gmailLabelFilterId: null,
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe("lnk");
  });

  it("operator-review thread stays visible (not inquiry chip semantics — list membership)", () => {
    const vendor = thread({
      id: "v",
      ai_routing_metadata: { sender_role: "vendor_solicitation" },
    });
    const { threads } = deriveVisibleInboxThreads({
      inboxThreads: [vendor],
      weddings: [],
      inboxFolder: "inbox",
      listTab: "all",
      projectFilterWeddingId: null,
      gmailLabelFilterId: null,
    });
    expect(threads.map((t) => t.id)).toEqual(["v"]);
  });
});
