import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Slice 6 — no direct playbook_rules writes in assistant confirm path", () => {
  it("core insert module only references playbook_rule_candidates", () => {
    const path = join(__dirname, "insertOperatorAssistantPlaybookRuleCandidateCore.ts");
    const src = readFileSync(path, "utf8");
    expect(src).toContain('from("playbook_rule_candidates")');
    expect(src).not.toContain('from("playbook_rules")');
  });
});

describe("Slice 7 — task confirm path is tasks-only (no policy drift)", () => {
  it("insertOperatorAssistantTaskCore only uses weddings verify + tasks insert", () => {
    const path = join(__dirname, "insertOperatorAssistantTaskCore.ts");
    const src = readFileSync(path, "utf8");
    expect(src).toContain('from("weddings")');
    expect(src).toContain('from("tasks")');
    expect(src).not.toContain('from("playbook_rules")');
    expect(src).not.toContain('from("playbook_rule_candidates")');
    expect(src).not.toMatch(/from\("memory/);
    expect(src).not.toMatch(/from\("studio_memories/);
  });
});

describe("Slice 8 — memory confirm path is memories-only (no policy/task drift)", () => {
  it("insertOperatorAssistantMemoryCore only uses weddings verify + memories insert", () => {
    const path = join(__dirname, "insertOperatorAssistantMemoryCore.ts");
    const src = readFileSync(path, "utf8");
    expect(src).toContain('from("weddings")');
    expect(src).toContain('from("memories")');
    expect(src).not.toContain('from("playbook_rules")');
    expect(src).not.toContain('from("playbook_rule_candidates")');
    expect(src).not.toContain('from("tasks")');
  });
});

describe("Slice 11 — case exception confirm path (no direct playbook_rules mutation)", () => {
  it("insertOperatorAssistantAuthorizedCaseExceptionCore may read playbook_rules but never insert/update them", () => {
    const path = join(__dirname, "insertOperatorAssistantAuthorizedCaseExceptionCore.ts");
    const src = readFileSync(path, "utf8");
    expect(src).toContain('from("weddings")');
    expect(src).toContain('from("authorized_case_exceptions")');
    expect(src).toContain('from("playbook_rules")');
    expect(src).toMatch(/\.select\("id, action_key"\)/);
    expect(/from\("playbook_rules"\)\s*\.(insert|update)/.test(src)).toBe(false);
    expect(src).not.toContain('from("playbook_rule_candidates")');
    expect(src).toContain("approved_via_escalation_id: null");
  });
});
