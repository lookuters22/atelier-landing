import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("reply / client-draft path isolation from assistant builder", () => {
  it("buildDecisionContext.ts does not import buildAssistantContext", () => {
    const src = readFileSync(join(here, "buildDecisionContext.ts"), "utf8");
    expect(src).not.toContain("buildAssistantContext");
  });

  it("maybeRewriteOrchestratorDraftWithPersona.ts does not import buildAssistantContext", () => {
    const src = readFileSync(join(here, "../orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts"), "utf8");
    expect(src).not.toContain("buildAssistantContext");
  });
});
