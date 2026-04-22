import { describe, expect, it } from "vitest";
import { shouldIncludeAppCatalogInOperatorPrompt } from "./operatorAssistantAppHelpIntent.ts";

describe("shouldIncludeAppCatalogInOperatorPrompt", () => {
  it("is false for empty and generic workflow questions", () => {
    expect(shouldIncludeAppCatalogInOperatorPrompt("")).toBe(false);
    expect(shouldIncludeAppCatalogInOperatorPrompt("What’s urgent?")).toBe(false);
    expect(shouldIncludeAppCatalogInOperatorPrompt("Any open tasks?")).toBe(false);
  });

  it("is true for where/how UI navigation phrasing", () => {
    expect(shouldIncludeAppCatalogInOperatorPrompt("Where do I find drafts?")).toBe(true);
    expect(shouldIncludeAppCatalogInOperatorPrompt("How do I open Settings?")).toBe(true);
    expect(shouldIncludeAppCatalogInOperatorPrompt("Which tab has the pipeline?")).toBe(true);
  });

  it("is true for label / status meaning questions", () => {
    expect(shouldIncludeAppCatalogInOperatorPrompt("What does Needs filing mean?")).toBe(true);
    expect(shouldIncludeAppCatalogInOperatorPrompt("What is operator review?")).toBe(true);
  });
});
