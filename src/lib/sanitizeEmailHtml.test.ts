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

  it("strips remote http(s) on img src in iframe document", () => {
    const out = sanitizeEmailHtmlForIframe('<p>x</p><img src="https://track.example/pixel.gif">');
    expect(out.toLowerCase()).not.toContain("track.example");
  });

  it("forbids embedded video/audio tags in iframe document", () => {
    const out = sanitizeEmailHtmlForIframe('<p>x</p><video src="https://x/v.mp4"></video>');
    expect(out.toLowerCase()).not.toContain("<video");
  });
});
