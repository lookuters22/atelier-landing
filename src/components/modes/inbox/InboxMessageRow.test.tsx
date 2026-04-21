// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";
import { InboxMessageRow } from "./InboxMessageRow";

const gmailCatalog = [] as const;

afterEach(() => {
  cleanup();
});

function baseThread(partial: Partial<UnfiledThread> & { id: string }): UnfiledThread {
  return {
    latestMessageBody: "",
    latestMessageHtmlSanitized: null,
    gmailRenderHtmlRef: null,
    latestMessageId: null,
    latestMessageAttachments: [],
    latestProviderMessageId: null,
    hasGmailImport: false,
    gmailLabelIds: null,
    title: "Subject",
    weddingId: null,
    sender: "x@y.com",
    snippet: "Hi",
    last_activity_at: "2026-01-01T00:00:00.000Z",
    ai_routing_metadata: null,
    ...partial,
  };
}

describe("InboxMessageRow", () => {
  it("shows Needs filing for ambiguous unlinked thread, not Inquiry", () => {
    render(
      <ul>
        <InboxMessageRow
          thread={baseThread({
            id: "t1",
            ai_routing_metadata: { routing_disposition: "unresolved_human", classified_intent: "intake" },
          })}
          selected={false}
          onSelect={() => {}}
          googleConnectedAccountId={null}
          onGmailModify={async () => ({ ok: true })}
          gmailLabelCatalog={gmailCatalog}
          linkedCoupleNames={null}
          linkedWeddingStage={null}
          hasPendingDraft={false}
        />
      </ul>,
    );
    expect(screen.getByText("Needs filing")).toBeTruthy();
  });

  it("shows Vendor / pitch and hides generic intent for operator-review mail", () => {
    render(
      <ul>
        <InboxMessageRow
          thread={baseThread({
            id: "t2",
            ai_routing_metadata: {
              sender_role: "vendor_solicitation",
              classified_intent: "intake",
            },
          })}
          selected={false}
          onSelect={() => {}}
          googleConnectedAccountId={null}
          onGmailModify={async () => ({ ok: true })}
          gmailLabelCatalog={gmailCatalog}
          linkedCoupleNames={null}
          linkedWeddingStage={null}
          hasPendingDraft={false}
        />
      </ul>,
    );
    expect(screen.getByText("Vendor / pitch")).toBeTruthy();
    expect(screen.queryByText("intake")).toBeNull();
  });

  it("does not add bucket chip for linked project rows", () => {
    render(
      <ul>
        <InboxMessageRow
          thread={baseThread({
            id: "t3",
            weddingId: "w-1",
            ai_routing_metadata: { classified_intent: "concierge" },
          })}
          selected={false}
          onSelect={() => {}}
          googleConnectedAccountId={null}
          onGmailModify={async () => ({ ok: true })}
          gmailLabelCatalog={gmailCatalog}
          linkedCoupleNames="Alex & Sam"
          linkedWeddingStage="inquiry"
          hasPendingDraft={false}
        />
      </ul>,
    );
    expect(screen.queryByText("Inquiry")).toBeNull();
    expect(screen.queryByText("Needs filing")).toBeNull();
    expect(screen.getByText("concierge")).toBeTruthy();
  });
});
