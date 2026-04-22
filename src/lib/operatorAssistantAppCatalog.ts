/**
 * Static operator-facing app knowledge for B9 / app-help (Slice 4+) and the operator assistant (Slice 5).
 * Keep in sync with `App.tsx`, `NavigationDock`, and per-mode *ContextList* — parity tests in `operatorAssistantAppCatalog.test.ts`.
 * Procedural `APP_PROCEDURAL_WORKFLOWS` push the minified JSON to roughly ~18–20KB (still bounded; see test ceiling).
 * Calendar event types mirror `CalendarModeContext` without importing React (safe for Supabase Edge / Deno).
 */
import type { AssistantAppCatalogForContext } from "../types/assistantContext.types.ts";
import type { InboxThreadBucket } from "./inboxThreadBucket";

/** Mirrors `V3_OPERATOR_ANA_APP_WORKFLOW_CATALOG.md` §3; routes/labels aligned with the live `App.tsx` + four-pane shell. */
export type OperatorAppWorkflowGrounding = "high" | "medium" | "low";

export type OperatorAppProceduralWorkflow = {
  id: string;
  title: string;
  /** Browser path; may include `:id` for dynamic projects (see `APP_ROUTES`). */
  primaryRoute: string;
  entryPoints: string[];
  /** Ordered user-facing steps; labels quoted where they appear in UI source. */
  steps: string[];
  /** Caveats, redirect behavior, or what not to claim. */
  notes: string;
  groundingConfidence: OperatorAppWorkflowGrounding;
};

/** §4 / NE* — not encoded as full procedures; short honest guidance for the model. */
export type OperatorAppWorkflowHonestyNote = {
  id: string;
  title: string;
  shortGuidance: string;
};

/** Must match `ALL_EVENT_TYPES` + `EVENT_TYPE_LABELS` in `components/modes/calendar/CalendarModeContext.tsx` (Slice 4 parity). */
const APP_CATALOG_CALENDAR_EVENT_TYPES = ["shoot", "consult", "travel", "block"] as const;
const APP_CATALOG_CALENDAR_EVENT_LABELS: Record<
  (typeof APP_CATALOG_CALENDAR_EVENT_TYPES)[number],
  string
> = {
  shoot: "Shoots",
  consult: "Consultations",
  travel: "Travel",
  block: "Editing blocks",
};

// --- Types ---

export type AppRouteEntry = {
  /** Browser path, leading slash. */
  path: string;
  title: string;
  purpose: string;
};

export type DockItemEntry = { label: string; route: string };

export type LeftRailSection = {
  section: string;
  items: { label: string; description: string }[];
};

export type StatusVocabEntry = { value: string; humanLabel: string; meaning: string };

export type WorkflowPointer = { id: string; pointer: string };

// --- Dock (NavigationDock NAV_ITEMS) —

export const APP_DOCK_ITEMS: DockItemEntry[] = [
  { label: "Today", route: "/today" },
  { label: "Inbox", route: "/inbox" },
  { label: "Pipeline", route: "/pipeline" },
  { label: "Calendar", route: "/calendar" },
  { label: "Projects", route: "/workspace" },
  { label: "People", route: "/directory" },
  { label: "Settings", route: "/settings" },
];

// --- Main routes (match `src/App.tsx` Route `path` values as browser paths) ---

export const APP_ROUTES: AppRouteEntry[] = [
  { path: "/", title: "Landing", purpose: "Root" },
  { path: "/landing", title: "Landing", purpose: "Alt" },
  { path: "/landing2", title: "Landing 2", purpose: "v2" },
  { path: "/login", title: "Login", purpose: "Auth" },
  { path: "/onboarding", title: "Onboarding", purpose: "Brief" },
  { path: "/today", title: "Today", purpose: "Queue" },
  { path: "/today/:itemId", title: "Today+id", purpose: "Deep" },
  { path: "/inbox", title: "Inbox", purpose: "Mail" },
  { path: "/pipeline", title: "Pipeline", purpose: "List" },
  { path: "/pipeline/:id", title: "Pipeline+id", purpose: "Open" },
  { path: "/calendar", title: "Calendar", purpose: "Cal" },
  { path: "/workspace", title: "Workspace", purpose: "Hub" },
  { path: "/workspace/pricing-calculator", title: "Pricing calc", purpose: "Prc" },
  { path: "/workspace/invoices", title: "Invoices PDF", purpose: "Inv" },
  { path: "/workspace/offer-builder", title: "Offer hub", purpose: "Off" },
  { path: "/workspace/offer-builder/edit/:projectId", title: "Offer edit", purpose: "1 offer" },
  { path: "/directory", title: "Directory", purpose: "Ppl" },
  { path: "/settings", title: "Settings", purpose: "Hub" },
  { path: "/settings/onboarding", title: "Settings (onboarding)", purpose: "→ /onboarding" },
  { path: "/settings/ai", title: "Settings (AI)", purpose: "→ /settings" },
  { path: "/escalations", title: "Escalations (legacy)", purpose: "→ /today" },
  { path: "/wedding/:weddingId", title: "Legacy /wedding/:id", purpose: "→ /pipeline" },
  { path: "/weddings", title: "Legacy /weddings", purpose: "→ /pipeline" },
  { path: "/approvals", title: "Legacy /approvals", purpose: "→ /today" },
  { path: "/tasks", title: "Legacy /tasks", purpose: "→ /today" },
  { path: "/financials", title: "Legacy /financials", purpose: "→ /workspace" },
  { path: "/contacts", title: "Legacy /contacts", purpose: "→ /directory" },
  { path: "/settings/pricing-calculator", title: "Legacy /settings/…/pricing", purpose: "→ /workspace/…" },
  { path: "/settings/invoices", title: "Legacy /settings/…/invoices", purpose: "→ /workspace/…" },
  { path: "/settings/offer-builder", title: "Legacy /settings/…/offer", purpose: "→ /workspace/…" },
];

/** `project_stage` enum — database + Pipeline left-rail bucket titles (see PipelineContextList BUCKET_TITLE). */
export const APP_STATUS_VOCABULARY = {
  projectStages: [
    { value: "inquiry", humanLabel: "inquiry", meaning: "B:Inq" },
    { value: "consultation", humanLabel: "consultation", meaning: "B:Inq" },
    { value: "proposal_sent", humanLabel: "proposal sent", meaning: "B:Inq" },
    { value: "contract_out", humanLabel: "contract out", meaning: "B:Inq" },
    { value: "booked", humanLabel: "booked", meaning: "B:AB" },
    { value: "prep", humanLabel: "prep", meaning: "B:AB" },
    { value: "final_balance", humanLabel: "final balance", meaning: "B:Del" },
    { value: "delivered", humanLabel: "delivered", meaning: "B:Del" },
    { value: "archived", humanLabel: "archived", meaning: "B:Arc" },
  ] as const satisfies readonly StatusVocabEntry[],

  /** Values returned by `deriveInboxThreadBucket` — UI copy from inboxThreadBucket / Today / Inbox. */
  inboxThreadBuckets: [
    { value: "inquiry" satisfies InboxThreadBucket, humanLabel: "Inquiry", meaning: "Lead" },
    { value: "unfiled" satisfies InboxThreadBucket, humanLabel: "Needs filing", meaning: "Unmatched" },
    { value: "operator_review" satisfies InboxThreadBucket, humanLabel: "Operator review", meaning: "Routed" },
    { value: "suppressed" satisfies InboxThreadBucket, humanLabel: "Suppressed", meaning: "Hidden" },
  ] as const,

  draftStatuses: [
    { value: "pending_approval", humanLabel: "Pending approval", meaning: "Await send" },
    { value: "approved", humanLabel: "Approved", meaning: "OK" },
    { value: "rejected", humanLabel: "Rejected", meaning: "No" },
  ] as const satisfies readonly StatusVocabEntry[],

  taskStatuses: [
    { value: "open", humanLabel: "Open", meaning: "Todo" },
    { value: "completed", humanLabel: "Completed", meaning: "Done" },
  ] as const satisfies readonly StatusVocabEntry[],

  /** `threads.automation_mode` — labels from WeddingManualControlsCard select. */
  automationMode: [
    { value: "auto", humanLabel: "Auto", meaning: "Default" },
    { value: "draft_only", humanLabel: "Draft only", meaning: "No send" },
    { value: "human_only", humanLabel: "Human only", meaning: "No auto" },
  ] as const satisfies readonly StatusVocabEntry[],

  /** Calendar left rail `EVENT_TYPE_LABELS` + ALL_EVENT_TYPES. */
  calendarEventTypes: APP_CATALOG_CALENDAR_EVENT_TYPES.map((t) => ({
    value: t,
    humanLabel: APP_CATALOG_CALENDAR_EVENT_LABELS[t],
    meaning: "Filter",
  })),
} as const;

// --- Per-mode left rails (section titles + key row labels) ---

export const APP_MODE_LEFT_RAILS: Record<string, LeftRailSection[]> = {
  today: [
    { section: "Queue", items: [{ label: "Queue", description: "Nav actions" }] },
    { section: "Drafts", items: [{ label: "Drafts", description: "Client drafts" }] },
    { section: "Inbox threads", items: [{ label: "Inbox threads", description: "Today queue" }] },
    { section: "Tasks", items: [{ label: "Tasks", description: "Tasks" }] },
    { section: "Escalations", items: [{ label: "Escalations", description: "Escalations" }] },
  ],
  inbox: [
    { section: "Inbox (header)", items: [{ label: "Inbox", description: "List" }] },
    {
      section: "Mail",
      items: [
        { label: "Primary", description: "Inbox" },
        { label: "Starred", description: "Starred" },
        { label: "Drafts", description: "Drafts" },
        { label: "Sent", description: "Sent" },
        { label: "All mail", description: "All" },
      ],
    },
    {
      section: "Ana routing",
      items: [
        { label: "Ana routing", description: "Group" },
        { label: "Ana drafts", description: "Count" },
        { label: "Escalations", description: "Row" },
        { label: "Auto-filed", description: "Row" },
      ],
    },
    { section: "Projects", items: [{ label: "Projects", description: "Filter" }] },
    { section: "Gmail labels", items: [{ label: "Gmail labels", description: "Labels" }] },
  ],
  pipeline: [
    { section: "Inquiries", items: [{ label: "Inquiries", description: "Pre-book" }] },
    { section: "Active bookings", items: [{ label: "Active bookings", description: "booked+prep" }] },
    { section: "Deliverables", items: [{ label: "Deliverables", description: "del+fb" }] },
    { section: "Archived", items: [{ label: "Archived", description: "Done" }] },
  ],
  calendar: [
    { section: "Event types", items: [{ label: "Event types", description: "Chips" }] },
    {
      section: "Workspaces",
      items: [
        { label: "Schedule", description: "Grid" },
        { label: "Booking links", description: "Links" },
        { label: "Travel blocks", description: "Travel" },
      ],
    },
    { section: "Timezones", items: [{ label: "Timezones", description: "Clocks" }] },
  ],
  directory: [
    { section: "Categories", items: [
      { label: "All Contacts", description: "All" },
      { label: "Clients", description: "Clients" },
      { label: "Vendors", description: "Vendors" },
      { label: "Venues", description: "Venues" },
    ] },
  ],
  workspace: [
    { section: "Financials", items: [
      { label: "Overview", description: "Money" },
      { label: "Invoices", description: "Inv" },
      { label: "Transactions", description: "Tx" },
    ] },
    { section: "Sales", items: [
      { label: "Proposals", description: "Prop" },
      { label: "Contracts", description: "K" },
    ] },
    { section: "Studio Tools", items: [
      { label: "Pricing Calculator", description: "/w/price" },
      { label: "Offer Builder", description: "/w/offer" },
      { label: "Invoice PDF Setup", description: "/w/inv" },
    ] },
  ],
  settings: [
    { section: "Settings", items: [
      { label: "General", description: "/settings" },
      { label: "AI & Tone", description: "/settings/ai" },
    ] },
  ],
};

/**
 * Procedural “how do I …” workflows (V3 operator catalog). See `docs/v3/V3_OPERATOR_ANA_APP_WORKFLOW_CATALOG.md`.
 * Routes reflect `App.tsx` (e.g. `/approvals` → `/today` redirect).
 */
export const APP_PROCEDURAL_WORKFLOWS: readonly OperatorAppProceduralWorkflow[] = [
  {
    id: "create_new_project",
    title: "Create a new wedding or project",
    primaryRoute: "/pipeline",
    entryPoints: ["Inbox (new leads)", "Settings → Gmail (import)", "Workspace → Offer Builder — Create new project (offers only)"],
    steps: [
      "There is **no** `/add-wedding` route in `App.tsx` today; `AddWeddingPage` has a **Create & open** button in source but that page is not mounted.",
      "Practical paths: capture or file new work from **Inbox** (`/inbox`), connect **Gmail** under **Settings** (`/settings`) and use import flows, or use **Offer Builder** in **Workspace** when the task is offer-specific (Create new project there).",
    ],
    notes:
      "Do **not** tell the user to open `/add-wedding` — it is not a registered route. Grounding: medium — no single create form in the four-pane shell.",
    groundingConfidence: "medium",
  },
  {
    id: "open_existing_project",
    title: "Open a specific project’s workspace",
    primaryRoute: "/pipeline",
    entryPoints: ["Pipeline left-rail list", "Direct URL `/pipeline/<weddingId>`"],
    steps: [
      "Go to **Pipeline** (`/pipeline`).",
      "In the left rail, find the couple under **Inquiries**, **Active bookings**, **Deliverables**, or **Archived** (`PipelineContextList` bucket titles).",
      "Click the **couple name** row to select the project (context menu also has **Open project**).",
    ],
    notes: "Legacy `/wedding/:id` redirects to `/pipeline/:id`. There is no separate Open button on the row beyond selecting it.",
    groundingConfidence: "high",
  },
  {
    id: "edit_project_facts",
    title: "Edit venue, dates, package, or commercial fields on a project",
    primaryRoute: "/pipeline/:id",
    entryPoints: ["Open a project from Pipeline (see `open_existing_project`)"],
    steps: [
      "With a project open, find the **Wedding** card (`WeddingOverviewCard`).",
      "Click **Edit** (pen control, top right of the card).",
      "Update **Couple / title**, **Stage**, **When**, **Where**, and under **Commercial**: **Package**, **Value**, **Balance / status**.",
      "Click **Save**, or **Cancel** to discard.",
    ],
    notes: "Field labels are verbatim from `WeddingOverviewCard.tsx`.",
    groundingConfidence: "high",
  },
  {
    id: "change_automation_mode",
    title: "Change automation mode for all threads on a project",
    primaryRoute: "/pipeline/:id",
    entryPoints: ["Project open in Pipeline"],
    steps: [
      "Open the project (see `open_existing_project`).",
      "Scroll to the **Pauses and automation** card (`WeddingManualControlsCard`).",
      "Under **Automation mode (all threads)**, choose **Auto**, **Draft only**, or **Human only** in the dropdown.",
    ],
    notes: "Project-scoped batch on threads; per-thread control may still exist in Inbox (see card hint text).",
    groundingConfidence: "high",
  },
  {
    id: "toggle_project_automation_flags",
    title: "Toggle compassion / strategic pause or agency CC lock",
    primaryRoute: "/pipeline/:id",
    entryPoints: ["Project open in Pipeline"],
    steps: [
      "Open the project.",
      "On the **Pauses and automation** card, toggle **Compassion pause**, **Strategic pause**, or **Agency CC lock**.",
    ],
    notes: "Labels are verbatim from `WeddingManualControlsCard.tsx`.",
    groundingConfidence: "high",
  },
  {
    id: "find_pending_drafts",
    title: "Find drafts waiting for approval",
    primaryRoute: "/today",
    entryPoints: ["Today (dock)", "Inbox → quick filter **Has draft**"],
    steps: [
      "Open **Today** (`/today`) — the operator hub; the legacy `/approvals` path **redirects here** in `App.tsx`.",
      "Use the **Drafts** / queue areas on Today (see `TodayContextList` labels) and/or open **Inbox** and pick the **Has draft** quick filter (`InboxPage.tsx`).",
    ],
    notes:
      "There is no separate Approvals route in the live router — do not claim a dedicated `/approvals` page. Prefer Today + Inbox **Has draft**.",
    groundingConfidence: "high",
  },
  {
    id: "approve_or_reject_draft",
    title: "Approve, edit, or reject a pending draft",
    primaryRoute: "/today",
    entryPoints: ["Today queue", "Project thread / timeline when a draft is shown (e.g. **Approve & send** in `PipelineCenterTimeline`)", "Component reference: `ApprovalsPage.tsx` for label patterns"],
    steps: [
      "Work the draft from **Today** or from the project thread view when a draft card is visible.",
      "Where the full approvals list UI is mounted, buttons are **Approve & send**, **Edit**, and **Reject** (`ApprovalsPage.tsx`). In the pipeline thread list, draft actions include **Approve & send** (`PipelineCenterTimeline.tsx`).",
      "**Edit** opens the editor modal; **Reject** runs a confirm flow before discard.",
    ],
    notes:
      "`App.tsx` redirects `/approvals` to `/today` — describe actions by control labels, not by a standalone Approvals URL.",
    groundingConfidence: "high",
  },
  {
    id: "find_escalations",
    title: "Find and resolve escalations",
    primaryRoute: "/today",
    entryPoints: ["Today operator hub"],
    steps: [
      "Open **Today** (`/today`). **Escalations** also surface here (legacy `/escalations` redirects to Today in `App.tsx`).",
      "Use the escalation / review affordances on the Today feed (see `ZenLobby` / `EscalationResolutionPanel`).",
    ],
    notes:
      "`EscalationsPage.tsx` defines tab labels (**Open**, **Resolved**, **Visual review**, **Banking**, **PR / publication**), but that page is **not** the mounted route today — do not describe those tabs as the live path unless the router changes.",
    groundingConfidence: "medium",
  },
  {
    id: "see_pipeline_by_stage",
    title: "Browse projects by pipeline bucket",
    primaryRoute: "/pipeline",
    entryPoints: ["Pipeline"],
    steps: [
      "Go to **Pipeline** (`/pipeline`).",
      "Scroll the left-rail groups: **Inquiries**, **Active bookings**, **Deliverables**, **Archived** (`BUCKET_TITLE` in `PipelineContextList.tsx`).",
    ],
    notes: "Empty buckets may show a short empty message (e.g. archived). A separate marketing `PipelinePage.tsx` uses different section titles — the shell uses ContextList.",
    groundingConfidence: "high",
  },
  {
    id: "open_today",
    title: "Open the Today operator hub",
    primaryRoute: "/today",
    entryPoints: ["Dock **Today**", "URL `/today`"],
    steps: [
      "Click **Today** in the dock or go to `/today`.",
      "Work the priority feed shown on the page (tab names may evolve — stay high-level).",
    ],
    notes: "Route-stable; internal Zen tab labels still moving — avoid inventing specific tab names not in context.",
    groundingConfidence: "medium",
  },
  {
    id: "open_inbox_and_filter",
    title: "Open Inbox and apply a quick filter",
    primaryRoute: "/inbox",
    entryPoints: ["Dock **Inbox**"],
    steps: [
      "Click **Inbox** in the dock or go to `/inbox`.",
      "Pick a quick filter: **All messages**, **Needs reply**, **Unfiled**, **Has draft**, **Planner** (`QUICK_FILTERS` in `InboxPage.tsx`).",
    ],
    notes:
      "There is no **Auto-filed** quick filter and no **Ana drafts** quick filter — for closest paths see honesty notes `ne4` / `ne5`.",
    groundingConfidence: "high",
  },
  {
    id: "open_workspace_tools",
    title: "Open Pricing Calculator, Offer Builder, or Invoice PDF setup",
    primaryRoute: "/workspace",
    entryPoints: ["Dock **Projects** → `/workspace`"],
    steps: [
      "Go to **Workspace** / **Projects** (`/workspace`).",
      "In the left rail under **Studio Tools**, open **Pricing Calculator** (`/workspace/pricing-calculator`), **Offer Builder** (`/workspace/offer-builder`), or **Invoice PDF Setup** (`/workspace/invoices`).",
    ],
    notes: "Labels/routes are mirrored in `APP_MODE_LEFT_RAILS.workspace` and `WorkspaceContextList.tsx`.",
    groundingConfidence: "high",
  },
  {
    id: "open_settings",
    title: "Open Settings",
    primaryRoute: "/settings",
    entryPoints: ["Dock **Settings**"],
    steps: [
      "Click **Settings** in the dock or go to `/settings`.",
      "Use the hub to reach account, Gmail, and other configuration sections.",
    ],
    notes: "Sub-pages evolve — stay at hub level unless the catalog lists a stable child route.",
    groundingConfidence: "high",
  },
  {
    id: "connect_gmail_and_import_labels",
    title: "Connect Gmail and work import / label review",
    primaryRoute: "/settings",
    entryPoints: ["Settings hub → Gmail section"],
    steps: [
      "Open **Settings** (`/settings`).",
      "Find the **Gmail** area on the hub (see `SettingsHubPage.tsx` — connect OAuth, then work label selection / batch review in the live flow).",
    ],
    notes:
      "Coarse: there is no single “Import labels” label to quote; sequence is connect → load → select → review batches. Do not invent per-step button text.",
    groundingConfidence: "medium",
  },
  {
    id: "see_delivered_projects",
    title: "See delivered-stage projects in Pipeline",
    primaryRoute: "/pipeline",
    entryPoints: ["Pipeline"],
    steps: [
      "Go to **Pipeline** (`/pipeline`).",
      "Open the **Deliverables** bucket in the left rail (delivered + final-balance–stage projects per `bucketForStage`).",
      "If the bucket is empty, there are no rows in that stage grouping to show.",
    ],
    notes: "The UI bucket title is **Deliverables** (not “Delivered” alone).",
    groundingConfidence: "high",
  },
];

/**
 * Explicit gaps (catalog §4). Ana must be honest — no fabricated review dashboards or filters.
 */
export const APP_WORKFLOW_HONESTY_NOTES: readonly OperatorAppWorkflowHonestyNote[] = [
  {
    id: "ne1_no_manual_task_ui",
    title: "No manual “new task” UI",
    shortGuidance:
      "`/tasks` redirects to Today; tasks are created via automations or Ana’s task propose-confirm — do not claim a +New task form.",
  },
  {
    id: "ne2_no_rule_candidate_dashboard",
    title: "No playbook rule-candidate review dashboard",
    shortGuidance:
      "No operator UI to approve/reject `playbook_rule_candidates` yet — use the widget’s playbook rule proposal or wait for a future review surface.",
  },
  {
    id: "ne3_onboarding_reentry",
    title: "Onboarding re-entry via Settings link",
    shortGuidance:
      "Onboarding is at `/onboarding` directly; do not claim a re-open button in Settings that is not present.",
  },
  {
    id: "ne4_no_autofiled_filter",
    title: "No Auto-filed inbox quick filter",
    shortGuidance:
      "Inbox quick filters are All messages / Needs reply / Unfiled / Has draft / Planner — suggest Unfiled or Has draft as the closest.",
  },
  {
    id: "ne5_ana_drafts_label",
    title: "No dedicated “Ana drafts” list label",
    shortGuidance:
      "Point to **Today** for pending work and Inbox **Has draft**; do not insist on an “Ana drafts” label.",
  },
  {
    id: "ne6_today_tab_detail",
    title: "Today per-tab walkthroughs deferred",
    shortGuidance:
      "Open `/today` and describe the hub at a high level — internal Zen tab names may still shift.",
  },
];

/** Short route hints; detailed steps live in `APP_PROCEDURAL_WORKFLOWS`. */
export const APP_WORKFLOW_POINTERS: WorkflowPointer[] = [
  { id: "edit-venue", pointer: "Venue/date/package: Pipeline → project → **Wedding** card → **Edit** — see workflow `edit_project_facts`." },
  {
    id: "rule-candidate-honest",
    pointer:
      "Playbook rule candidates: **no** review dashboard in the app — see `APP_WORKFLOW_HONESTY_NOTES.ne2_no_rule_candidate_dashboard` and use Ana’s propose-confirm when appropriate.",
  },
  {
    id: "automation-mode",
    pointer: "Automation mode: **Pauses and automation** card on the project → **Automation mode (all threads)** (workflow `change_automation_mode`).",
  },
  {
    id: "see-drafts-today",
    pointer: "Pending drafts: **Today** (`/today`); legacy `/approvals` redirects to Today. Inbox quick filter: **Has draft** — see `find_pending_drafts`.",
  },
  {
    id: "see-escalations",
    pointer: "Escalations: work them from **Today** (`/today`); legacy `/escalations` redirects to Today — see `find_escalations`.",
  },
  {
    id: "see-autofiled",
    pointer: "No Auto-filed message-list filter in Inbox — honesty `ne4_no_autofiled_filter` (suggest Unfiled / Has draft).",
  },
  { id: "settings", pointer: "Settings: dock **Settings** or `/settings` (workflow `open_settings`)." },
  { id: "onboarding", pointer: "Onboarding: `/onboarding` direct; honesty `ne3_onboarding_reentry` if they expect a Settings button." },
];

function getAssistantAppCatalogPayloadObject() {
  return {
    APP_ROUTES,
    APP_DOCK_ITEMS,
    APP_MODE_LEFT_RAILS,
    APP_STATUS_VOCABULARY,
    APP_WORKFLOW_POINTERS,
    APP_PROCEDURAL_WORKFLOWS,
    APP_WORKFLOW_HONESTY_NOTES,
  };
}

function formatAppCatalogMarkdownExcerptForOperatorPrompt(): string {
  const o = getAssistantAppCatalogPayloadObject();
  const lines: string[] = [];
  lines.push("### Dock (main nav)");
  for (const d of o.APP_DOCK_ITEMS) {
    lines.push(`- **${d.label}** → \`${d.route}\``);
  }
  lines.push("");
  lines.push("### Key routes (paths)");
  for (const r of o.APP_ROUTES) {
    lines.push(`- \`${r.path}\` — **${r.title}** — ${r.purpose}`);
  }
  lines.push("");
  lines.push("### Left-rail / mode sections (labels)");
  for (const [mode, sections] of Object.entries(o.APP_MODE_LEFT_RAILS)) {
    lines.push(`**${mode}**`);
    for (const sec of sections) {
      const labels = sec.items.map((i) => i.label).join(", ");
      lines.push(`- ${sec.section}: ${labels}`);
    }
  }
  lines.push("");
  lines.push("### Status / vocabulary (value → label)");
  const v = o.APP_STATUS_VOCABULARY;
  lines.push(
    `**Inbox thread buckets:** ${v.inboxThreadBuckets.map((b) => `${b.humanLabel} (${b.meaning})`).join(" · ")}`,
  );
  lines.push("**Project stages (pipeline):** " + v.projectStages.map((s) => s.humanLabel).join(", "));
  lines.push(
    "**Automation mode (thread):** " + v.automationMode.map((a) => `${a.humanLabel}`).join(", "),
  );
  lines.push("");
  lines.push("### Procedural workflows (how-to)");
  lines.push("Use `APP_PROCEDURAL_WORKFLOWS` for step lists. **groundingConfidence** `medium` = stay coarse; do not add unstated UI.");
  for (const w of o.APP_PROCEDURAL_WORKFLOWS) {
    lines.push(`- **${w.id}** (${w.groundingConfidence}): **${w.title}** — primary \`${w.primaryRoute}\``);
    for (const s of w.steps) {
      lines.push(`  ${s}`);
    }
  }
  lines.push("");
  lines.push("### Where to (short pointers)");
  for (const w of o.APP_WORKFLOW_POINTERS) {
    lines.push(`- **${w.id}:** ${w.pointer}`);
  }
  lines.push("");
  lines.push("### Honesty notes (gaps / not built yet)");
  for (const n of o.APP_WORKFLOW_HONESTY_NOTES) {
    lines.push(`- **${n.id}:** ${n.title} — ${n.shortGuidance}`);
  }
  return lines.join("\n");
}

/**
 * Slice 5 — bounded snapshot for `AssistantContext` (operator assistant only). Same data as the JSON payload, plus a short markdown view for the LLM.
 */
export function getAssistantAppCatalogForContext(): AssistantAppCatalogForContext {
  const payload = getAssistantAppCatalogPayloadObject();
  const catalogJson = JSON.stringify(payload);
  const serializedUtf8Bytes = new TextEncoder().encode(catalogJson).length;
  return {
    version: 1,
    serializedUtf8Bytes,
    catalogJson,
    markdownExcerpt: formatAppCatalogMarkdownExcerptForOperatorPrompt(),
  };
}

/** JSON size guard (Slice 4) — same payload as `getAssistantAppCatalogForContext`. */
export function serializedOperatorAppCatalogSizeBytes(): number {
  return new TextEncoder().encode(JSON.stringify(getAssistantAppCatalogPayloadObject())).length;
}
