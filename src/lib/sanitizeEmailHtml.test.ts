/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { sanitizeEmailHtmlForIframe, wrapEmailFragmentAsDocument } from "./sanitizeEmailHtml";

describe("sanitizeEmailHtml", () => {
  it("wraps fragments as a document shell", () => {
    expect(wrapEmailFragmentAsDocument("<p>x</p>")).toContain("<body>");
    expect(wrapEmailFragmentAsDocument("<p>x</p>")).toContain("<p>x</p>");
    expect(wrapEmailFragmentAsDocument("<!DOCTYPE html><html><head></head><body>x</body></html>")).toContain(
      "<!DOCTYPE html>",
    );
  });

  it("allows remote http(s) on img src for Gmail-like rendering", () => {
    const out = sanitizeEmailHtmlForIframe('<p>x</p><img src="https://cdn.example/promo.gif">');
    expect(out.toLowerCase()).toContain("cdn.example");
    expect(out.toLowerCase()).toContain("<img");
  });

  it("preserves responsive img srcset with remote URLs", () => {
    const out = sanitizeEmailHtmlForIframe(
      '<img src="https://a.example/i.jpg" srcset="https://a.example/i.jpg 1x, https://b.example/i@2x.jpg 2x">',
    );
    expect(out.toLowerCase()).toContain("a.example");
    expect(out.toLowerCase()).toContain("b.example");
  });

  it("adds target _blank and rel noopener to external http(s) links", () => {
    const out = sanitizeEmailHtmlForIframe('<a href="https://vendor.example/offer">Go</a>');
    expect(out.toLowerCase()).toContain('target="_blank"');
    expect(out.toLowerCase()).toContain("noopener");
    expect(out.toLowerCase()).toContain("noreferrer");
  });

  it("forbids embedded video/audio tags in iframe document", () => {
    const out = sanitizeEmailHtmlForIframe('<p>x</p><video src="https://x/v.mp4"></video>');
    expect(out.toLowerCase()).not.toContain("<video");
  });
});
