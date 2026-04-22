import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Database } from "../types/database.types";
import {
  APP_DOCK_ITEMS,
  APP_MODE_LEFT_RAILS,
  APP_PROCEDURAL_WORKFLOWS,
  APP_ROUTES,
  APP_STATUS_VOCABULARY,
  APP_WORKFLOW_HONESTY_NOTES,
  APP_WORKFLOW_POINTERS,
  getAssistantAppCatalogForContext,
  serializedOperatorAppCatalogSizeBytes,
} from "./operatorAssistantAppCatalog";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRootSrc = join(__dirname, "..");

function readSrc(rel: string): string {
  return readFileSync(join(repoRootSrc, rel), "utf8");
}

/** `path="..."` and the index route (public `/`). */
function extractAppTsRoutePaths(appSource: string): Set<string> {
  const s = new Set<string>();
  const re = /path="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(appSource)) !== null) {
    s.add(m[1]);
  }
  if (/<Route[^>]*\sindex(?:\s|>)/m.test(appSource)) {
    s.add("index");
  }
  return s;
}

function browserPathToRouterPath(path: string): string {
  if (path === "/" || path === "") return "index";
  return path.replace(/^\//, "");
}

function primaryRouteIsGroundedInAppRoutes(primaryRoute: string): boolean {
  return APP_ROUTES.some((r) => r.path === primaryRoute);
}

describe("operatorAssistantAppCatalog", () => {
  it("serialized catalog stays under procedural-workflow budget (~24KB cap)", () => {
    expect(serializedOperatorAppCatalogSizeBytes()).toBeLessThan(24 * 1024);
  });

  it("getAssistantAppCatalogForContext (Slice 5) is bounded and matches JSON size", () => {
    const c = getAssistantAppCatalogForContext();
    expect(c.version).toBe(1);
    expect(c.serializedUtf8Bytes).toBe(serializedOperatorAppCatalogSizeBytes());
    expect(c.serializedUtf8Bytes).toBeLessThan(24 * 1024);
    const parsed = JSON.parse(c.catalogJson) as {
      APP_ROUTES: unknown;
      APP_PROCEDURAL_WORKFLOWS: unknown;
      APP_WORKFLOW_HONESTY_NOTES: unknown;
    };
    expect(parsed).toHaveProperty("APP_ROUTES");
    expect(parsed).toHaveProperty("APP_PROCEDURAL_WORKFLOWS");
    expect(parsed).toHaveProperty("APP_WORKFLOW_HONESTY_NOTES");
    expect(c.markdownExcerpt.length).toBeGreaterThan(100);
    expect(c.markdownExcerpt).toContain("Procedural workflows");
  });

  it("has no empty strings in exported labels and unique workflow ids", () => {
    for (const r of APP_ROUTES) {
      expect(r.path.trim().length).toBeGreaterThan(0);
      expect(r.title.trim().length).toBeGreaterThan(0);
      expect(r.purpose.trim().length).toBeGreaterThan(0);
    }
    for (const d of APP_DOCK_ITEMS) {
      expect(d.label.trim().length).toBeGreaterThan(0);
      expect(d.route.startsWith("/")).toBe(true);
    }
    const wfIds = APP_WORKFLOW_POINTERS.map((w) => w.id);
    expect(new Set(wfIds).size).toBe(wfIds.length);
    for (const w of APP_WORKFLOW_POINTERS) {
      expect(w.pointer.length).toBeGreaterThan(20);
    }
  });

  it("APP_WORKFLOW_POINTERS + honesty notes cover the minimum Slice 4 workflow areas", () => {
    const joined = APP_WORKFLOW_POINTERS.map((w) => `${w.id} ${w.pointer}`).join("\n").toLowerCase();
    const hon = APP_WORKFLOW_HONESTY_NOTES.map((n) => `${n.id} ${n.shortGuidance}`).join("\n").toLowerCase();
    expect(joined).toMatch(/venue|date|package|edit/);
    expect(`${joined}\n${hon}`).toMatch(/rule|candidate|playbook/);
    expect(joined).toMatch(/automation/);
    expect(joined).toMatch(/draft/);
    expect(joined).toMatch(/escalat/);
    expect(`${joined}\n${hon}`).toMatch(/auto-?filed/);
    expect(joined).toMatch(/settings/);
    expect(joined).toMatch(/onboarding/);
  });

  it("procedural workflow primary routes are grounded in APP_ROUTES (or dynamic project path)", () => {
    for (const w of APP_PROCEDURAL_WORKFLOWS) {
      expect(primaryRouteIsGroundedInAppRoutes(w.primaryRoute)).toBe(true);
    }
  });

  it("procedural steps cite real UI strings (spot-check source files)", () => {
    const appro = readSrc(join("pages", "ApprovalsPage.tsx"));
    expect(appro).toMatch(/Approve & send/);
    const man = readSrc(join("components", "wedding-detail", "WeddingManualControlsCard.tsx"));
    expect(man).toMatch(/Pauses and automation/);
    expect(man).toMatch(/Automation mode \(all threads\)/);
    const pipe = readSrc(join("components", "modes", "pipeline", "PipelineContextList.tsx"));
    expect(pipe).toMatch(/Inquiries/);
    expect(pipe).toMatch(/Active bookings/);
    expect(pipe).toMatch(/Deliverables/);
  });

  it("route parity: every catalog path maps to a Route in App.tsx", () => {
    const appSrc = readSrc("App.tsx");
    const pathsInFile = extractAppTsRoutePaths(appSrc);
    for (const r of APP_ROUTES) {
      const key = browserPathToRouterPath(r.path);
      expect(pathsInFile.has(key)).toBe(true);
    }
  });

  it("route parity: every path= in App.tsx is listed in APP_ROUTES (except catch-all)", () => {
    const appSrc = readSrc("App.tsx");
    const pathsInFile = extractAppTsRoutePaths(appSrc);
    const catalogKeys = new Set(APP_ROUTES.map((r) => browserPathToRouterPath(r.path)));
    for (const p of pathsInFile) {
      if (p === "*") continue;
      expect(catalogKeys.has(p)).toBe(true);
    }
  });

  it("dock parity: APP_DOCK_ITEMS matches NavigationDock NAV_ITEMS", () => {
    const dockSrc = readSrc(join("components", "Dock", "NavigationDock.tsx"));
    const navRe = /\{\s*to:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g;
    const fromFile: { to: string; label: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = navRe.exec(dockSrc)) !== null) {
      fromFile.push({ to: m[1], label: m[2] });
    }
    expect(fromFile.length).toBe(APP_DOCK_ITEMS.length);
    for (let i = 0; i < fromFile.length; i++) {
      expect(APP_DOCK_ITEMS[i].route).toBe(fromFile[i].to);
      expect(APP_DOCK_ITEMS[i].label).toBe(fromFile[i].label);
    }
  });

  it("left-rail labels: expected section strings exist in source *ContextList* files", () => {
    const checks: { file: string; substrings: string[] }[] = [
      { file: join("components", "modes", "today", "TodayContextList.tsx"), substrings: ["Drafts", "Inbox threads", "Tasks", "Escalations", "Queue"] },
      { file: join("components", "modes", "inbox", "InboxContextList.tsx"), substrings: ["Primary", "Ana routing", "Projects", "Gmail labels", "Auto-filed"] },
      { file: join("components", "modes", "pipeline", "PipelineContextList.tsx"), substrings: ["Inquiries", "Active bookings", "Deliverables", "Archived"] },
      { file: join("components", "modes", "calendar", "CalendarContextList.tsx"), substrings: ["Event types", "Workspaces", "Schedule", "Booking links", "Travel blocks", "Timezones"] },
      { file: join("components", "modes", "directory", "DirectoryContextList.tsx"), substrings: ["Categories", "All Contacts", "Clients", "Vendors", "Venues"] },
      { file: join("components", "modes", "workspace", "WorkspaceContextList.tsx"), substrings: ["Financials", "Sales", "Studio Tools", "Pricing Calculator", "Offer Builder", "Invoice PDF Setup"] },
      { file: join("components", "modes", "settings", "SettingsContextList.tsx"), substrings: ["General", "AI & Tone"] },
    ];
    for (const { file, substrings } of checks) {
      const src = readSrc(file);
      for (const sub of substrings) {
        expect(src, `${file} should mention “${sub}”`).toContain(sub);
      }
    }
  });

  it("APP_MODE_LEFT_RAILS lists align with spot-checked UI strings", () => {
    const flat = Object.values(APP_MODE_LEFT_RAILS).flat();
    const labels = flat.flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toContain("Ana drafts");
    expect(labels).toContain("Escalations");
  });

  it("project stage vocabulary covers every project_stage enum value", () => {
    type PS = Database["public"]["Enums"]["project_stage"];
    const all: PS[] = [
      "inquiry",
      "consultation",
      "proposal_sent",
      "contract_out",
      "booked",
      "prep",
      "final_balance",
      "delivered",
      "archived",
    ];
    const inCatalog = new Set(APP_STATUS_VOCABULARY.projectStages.map((x) => x.value));
    for (const v of all) {
      expect(inCatalog.has(v)).toBe(true);
    }
  });

  it("inbox thread bucket vocabulary covers deriveInboxThreadBucket return values", () => {
    const values = ["inquiry", "unfiled", "operator_review", "suppressed"] as const;
    const inCatalog = new Set(APP_STATUS_VOCABULARY.inboxThreadBuckets.map((x) => x.value));
    for (const v of values) {
      expect(inCatalog.has(v)).toBe(true);
    }
  });

  it("draft and task status vocabulary cover DB enums", () => {
    const draft: Database["public"]["Enums"]["draft_status"][] = ["pending_approval", "approved", "rejected"];
    const ds = new Set(APP_STATUS_VOCABULARY.draftStatuses.map((x) => x.value));
    for (const d of draft) expect(ds.has(d)).toBe(true);
    const ts = new Set(APP_STATUS_VOCABULARY.taskStatuses.map((x) => x.value));
    for (const t of ["open", "completed"] as const) expect(ts.has(t)).toBe(true);
  });

  it("automation mode vocabulary matches threads.automation_mode enum", () => {
    const am: Database["public"]["Enums"]["automation_mode"][] = ["auto", "draft_only", "human_only"];
    const s = new Set(APP_STATUS_VOCABULARY.automationMode.map((x) => x.value));
    for (const x of am) expect(s.has(x)).toBe(true);
  });

  it("calendar event types stay aligned with CalendarModeContext (catalog has no React import)", () => {
    const calSrc = readSrc(join("components", "modes", "calendar", "CalendarModeContext.tsx"));
    for (const row of APP_STATUS_VOCABULARY.calendarEventTypes) {
      expect(calSrc).toContain(`"${row.value}"`);
      expect(calSrc).toContain(row.humanLabel);
    }
  });
});
