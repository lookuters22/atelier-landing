import { describe, expect, it } from "vitest";
import { sanitizeGmailHtmlForStorage } from "./gmailHtmlSanitize.ts";

describe("sanitizeGmailHtmlForStorage", () => {
  it("removes remote http(s) img src (tracking pixels)", () => {
    const out = sanitizeGmailHtmlForStorage(
      '<p>x</p><img src="https://evil.example/track.gif" alt="">',
    );
    expect(out).not.toContain("evil.example");
    expect(out).not.toContain("https://");
  });

  it("allows cid: and data: img sources", () => {
    const out = sanitizeGmailHtmlForStorage(
      '<img src="cid:foo" alt=""><img src="data:image/png;base64,AAAA" alt="">',
    );
    expect(out).toContain("cid:foo");
    expect(out).toContain("data:image/png");
  });

  it("strips remote url() from inline styles", () => {
    const out = sanitizeGmailHtmlForStorage(
      '<p style="background:url(https://evil.example/bg.png)">t</p>',
    );
    expect(out).not.toContain("evil.example");
  });

  it("allows data: url in background for inlined assets", () => {
    const out = sanitizeGmailHtmlForStorage(
      '<p style="background:url(data:image/png;base64,AAAA)">t</p>',
    );
    expect(out).toContain("data:image/png");
  });

  it("drops video/audio/source/track tags", () => {
    const raw =
      '<p>a</p><video src="https://x/v.mp4"></video><audio src="https://x/a.mp3"></audio><source src="https://x/s"><track src="https://x/t">';
    const out = sanitizeGmailHtmlForStorage(raw);
    expect(out.toLowerCase()).not.toContain("<video");
    expect(out.toLowerCase()).not.toContain("<audio");
    expect(out.toLowerCase()).not.toContain("<source");
    expect(out.toLowerCase()).not.toContain("<track");
  });
});
