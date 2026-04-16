import { describe, expect, it } from "vitest";
import { mapInboxMessageAttachmentRows } from "./inboxThreadMessageMap";

describe("mapInboxMessageAttachmentRows", () => {
  it("maps nested attachment rows", () => {
    const rows = mapInboxMessageAttachmentRows([
      {
        id: "a1",
        source_url: "https://x",
        storage_path: "p/1",
        mime_type: "image/png",
        metadata: { k: 1 },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("a1");
    expect(rows[0]?.metadata).toEqual({ k: 1 });
  });

  it("returns empty for non-array", () => {
    expect(mapInboxMessageAttachmentRows(null)).toEqual([]);
  });
});
