import { describe, expect, it } from "vitest";
import { mapInboxLatestProjectionRow } from "./inboxThreadProjection";

describe("mapInboxLatestProjectionRow", () => {
  it("maps G4 view row to UnfiledThread", () => {
    const row = {
      id: "t1",
      title: "Hello",
      last_activity_at: "2026-01-01T00:00:00.000Z",
      ai_routing_metadata: null,
      latest_message_id: "m1",
      latest_sender: "client@example.com",
      latest_body: "Body text here",
      latest_message_metadata: {
        gmail_import: { body_html_sanitized: "<p>Hi</p>" },
      },
      latest_attachments_json: [
        {
          id: "a1",
          source_url: "https://x",
          storage_path: "p/1",
          mime_type: "image/png",
          metadata: { original_filename: "x.png" },
        },
      ],
      latest_provider_message_id: "gmail-msg-1",
    };
    const t = mapInboxLatestProjectionRow(row);
    expect(t.id).toBe("t1");
    expect(t.snippet).toBe("Body text here".slice(0, 160));
    expect(t.latestMessageBody).toBe("Body text here");
    expect(t.latestMessageHtmlSanitized).toBe("<p>Hi</p>");
    expect(t.latestMessageId).toBe("m1");
    expect(t.sender).toBe("client@example.com");
    expect(t.latestMessageAttachments).toHaveLength(1);
    expect(t.latestMessageAttachments[0].id).toBe("a1");
    expect(t.gmailRenderHtmlRef).toBeNull();
    expect(t.latestProviderMessageId).toBe("gmail-msg-1");
    expect(t.hasGmailImport).toBe(true);
    expect(t.gmailLabelIds).toBeNull();
  });

  it("exposes G3 render_html_ref when body_html_sanitized is absent", () => {
    const row = {
      id: "t2",
      title: "Hi",
      last_activity_at: "2026-01-01T00:00:00.000Z",
      ai_routing_metadata: null,
      latest_message_id: "m2",
      latest_sender: "a@b.com",
      latest_body: "plain",
      latest_message_metadata: {
        gmail_import: {
          render_html_ref: {
            version: 1,
            artifact_id: "550e8400-e29b-41d4-a716-446655440000",
            storage_bucket: "message_attachment_media",
            storage_path: "u/gmail_render/550e8400-e29b-41d4-a716-446655440000.html",
            byte_size: 12,
          },
        },
      },
      latest_attachments_json: [],
    };
    const t = mapInboxLatestProjectionRow(row);
    expect(t.latestMessageHtmlSanitized).toBeNull();
    expect(t.gmailRenderHtmlRef?.artifact_id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});
