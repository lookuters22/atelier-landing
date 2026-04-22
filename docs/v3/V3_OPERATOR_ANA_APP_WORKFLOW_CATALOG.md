# V3 Operator Ana Widget — App Workflow Catalog (grounded source)

> **Status:** Active. Source-of-truth for procedural app-help content.
> **Intent:** Human-curated, repo-grounded workflow catalog that a later slice will encode into `src/lib/operatorAssistantAppCatalog.ts` as structured `workflowSteps[]`.
> **Audience:** Implementation agents planning the procedural-app-help slice (see `V3_OPERATOR_ANA_WIDGET_CAPABILITY_SLICES.md` Slice 4).
> **Implementation:** Procedural workflows are encoded in `src/lib/operatorAssistantAppCatalog.ts` as `APP_PROCEDURAL_WORKFLOWS` (keep this doc and that module in sync).

---

## 1. Purpose

The operator Ana widget currently grounds app-help answers in `src/lib/operatorAssistantAppCatalog.ts`, which is **route- and label-oriented**. That covers "where does X live" but not "how do I do X." Operators ask procedural questions — *"how do I create a new wedding project?"*, *"how do I approve a rule candidate?"* — and Ana paraphrases into vague navigation prose because there are no step-by-step entries to ground against.

This document is the curated, repo-grounded list of the most important operator workflows, written so a later implementation slice can drop the entries directly into `operatorAssistantAppCatalog.ts` as a new `WORKFLOW_STEPS` export. Every step below cites a real component, button, route, or label observed in the current repo. Workflows whose UI path is ambiguous or missing are called out explicitly in §4 rather than invented.

The downstream use: `buildAssistantContext` includes a bounded excerpt of `WORKFLOW_STEPS` in the `App help / navigation` block; the prompt instructs Ana to **quote** step wording exactly and never invent steps; divergence tests keep the catalog honest against the real UI.

---

## 2. Workflow selection criteria

A workflow is included here **only if all four conditions hold**:

1. **High-value for operators.** The question comes up in daily studio operation, not once a quarter.
2. **Grounded in the current UI.** There is a concrete route, visible label, or verifiable button in the current codebase.
3. **Stable.** The surface is unlikely to change this quarter; encoding it now will not immediately drift.
4. **Describable without hallucination.** Every step maps to a real click-target with a label we can quote.

If any condition fails, the workflow is listed in §4 (ambiguous / not-yet-safe) instead of the curated list. The catalog prefers omission over invention.

---

## 3. Curated workflows

Fifteen workflows are confident enough to encode. Each entry uses a stable fixed shape so the future `workflowSteps[]` TypeScript shape is obvious.

---

### W1 — Create a new wedding / project

- **id:** `create_new_project`
- **title:** Create a new wedding or project
- **primary_route:** `/add-wedding`
- **entry_points:**
  - Direct URL `/add-wedding`
  - Reachable from the Pipeline left rail
- **steps:**
  1. Go to **Pipeline** in the left rail (or navigate directly to `/add-wedding`).
  2. Use the **new project** entry on that page.
  3. Fill couple names, stage (start with *inquiry*), and the known details.
  4. Click **Create & open** to create the project and open it.
- **notes:** The visible button label on the create page is **"Create & open"** (verbatim). Stage typically begins at `inquiry`; event date is nullable by schema (`weddings.wedding_date`) so the operator can save without committing a date yet.
- **grounding_confidence:** high

---

### W2 — Open an existing project

- **id:** `open_existing_project`
- **title:** Open a specific project's detail page
- **primary_route:** `/pipeline`
- **entry_points:**
  - Pipeline list
  - Ana widget focus (if operator has already focused the project)
- **steps:**
  1. Go to **Pipeline**.
  2. Find the project in the **Action required (Inquiry–Contract)**, **Cruising (Booked & Prep)**, or **Delivered** section.
  3. **Click the couple name** on the project card. It is a link — no separate "Open" button.
- **notes:** There is no dedicated "Open" button; the couple name itself is the link to `/wedding/:id`. Sections render only when non-empty; *Delivered* in particular does not render when it is empty.
- **grounding_confidence:** high

---

### W3 — Edit venue, date, package, or other project facts

- **id:** `edit_project_facts`
- **title:** Edit a project's venue, dates, package, or value
- **primary_route:** `/wedding/:id`
- **entry_points:**
  - Open the project via W2
- **steps:**
  1. Open the project (see W2).
  2. On the **Overview** card, click **Edit** (top right of the card).
  3. Update any of: **couple/title**, **stage**, **when** (date), **where** (venue/location), **package**, **value**, **balance/status**.
  4. Click **Save** to commit, or **Cancel** to discard.
- **notes:** Editable field set matches `WeddingOverviewCard`. Save/Cancel controls are on the card itself. Field labels above are verbatim from the current UI.
- **grounding_confidence:** high

---

### W4 — Change automation mode for a project

- **id:** `change_automation_mode`
- **title:** Change a project's automation mode
- **primary_route:** `/wedding/:id`
- **entry_points:**
  - Open the project via W2
- **steps:**
  1. Open the project (see W2).
  2. On the **Manual controls** card, find **Automation mode (all threads)**.
  3. Choose one of the visible options: **Auto**, **Draft only**, or **Human only**.
- **notes:** Dropdown label is verbatim **"Automation mode (all threads)"** (from `WeddingManualControlsCard`). The three options are the full visible set. This is project-scoped, not tenant-global.
- **grounding_confidence:** high

---

### W5 — Pause or lock automation on a project

- **id:** `toggle_project_automation_flags`
- **title:** Toggle Compassion pause, Strategic pause, or Agency CC lock
- **primary_route:** `/wedding/:id`
- **entry_points:**
  - Open the project via W2
- **steps:**
  1. Open the project (see W2).
  2. On the **Manual controls** card, toggle any of:
     - **Compassion pause**
     - **Strategic pause**
     - **Agency CC lock**
- **notes:** These three toggles sit on the same card as Automation mode. Labels are verbatim. Semantics are documented on the card itself in the UI; do not re-paraphrase.
- **grounding_confidence:** high

---

### W6 — Find and review pending client drafts

- **id:** `find_pending_drafts`
- **title:** Review drafts awaiting operator approval
- **primary_route:** `/approvals`
- **entry_points:**
  - Dedicated **Approvals** page
  - Inbox quick filter: **Has draft** (secondary surface)
- **steps:**
  1. Go to **/approvals** (the Approvals page is the operator-centric hub for pending drafts).
  2. Browse the list of drafts awaiting your action.
- **notes:** `/approvals` is the authoritative surface for pending-approval drafts. The Inbox page also exposes a **Has draft** quick filter as a secondary surface. There is no "Drafts" tab in Inbox; if the operator asks for "drafts," prefer directing them to `/approvals`.
- **grounding_confidence:** high

---

### W7 — Approve or reject a pending draft

- **id:** `approve_or_reject_draft`
- **title:** Approve, edit, or reject a pending draft
- **primary_route:** `/approvals`
- **entry_points:**
  - Approvals page (W6)
- **steps:**
  1. Go to **/approvals**.
  2. On the draft card, choose one:
     - **Approve & send** — sends the draft as-is.
     - **Edit** — opens the draft editor modal for changes before sending.
     - **Reject** — discards the draft; you will be prompted for feedback.
- **notes:** Button labels are verbatim from the Approvals page. Reject prompts via a browser confirm/prompt dialog. The editor opens `ApprovalDraftAiModal`.
- **grounding_confidence:** high

---

### W8 — Find and work escalations

- **id:** `find_escalations`
- **title:** See open escalations and resolve them
- **primary_route:** `/escalations`
- **entry_points:**
  - Dedicated **Escalations** page
  - **/today** — escalations also surface there as part of the operator hub
- **steps:**
  1. Go to **/escalations**.
  2. Use the tabs to narrow the list:
     - **Open** — all open escalation requests.
     - **Resolved** — answered, dismissed, or promoted.
     - **Visual review** — gallery / proof / retouch / selection escalations.
     - **Banking** — payments / invoices / tax / refunds.
     - **PR / publication** — press / credits / usage / publication.
  3. Click into an escalation to review and resolve.
- **notes:** Tab labels are verbatim from `EscalationsPage`. Today's note on the Escalations page reads *"Today is your operator hub"* — operators can also resolve some items from `/today`.
- **grounding_confidence:** high

---

### W9 — See the pipeline of projects by stage

- **id:** `see_pipeline_by_stage`
- **title:** View projects grouped by stage
- **primary_route:** `/pipeline`
- **entry_points:**
  - Pipeline page
- **steps:**
  1. Go to **Pipeline**.
  2. Scroll the three stage groups:
     - **Action required (Inquiry–Contract)**
     - **Cruising (Booked & Prep)**
     - **Delivered** (appears only when there are delivered projects).
- **notes:** Section labels are verbatim. The Delivered section is conditional: it does not render when empty. There is no separate "Archived" section on this page; archive-stage projects are filtered out of the default view.
- **grounding_confidence:** high

---

### W10 — Open Today (operator hub)

- **id:** `open_today`
- **title:** Open the operator "Today" hub
- **primary_route:** `/today`
- **entry_points:**
  - Navigation dock → **Today**
  - Direct URL `/today`
- **steps:**
  1. Click **Today** in the navigation dock (or go to `/today`).
  2. Work the priority feed and tabs that appear on the page.
- **notes:** Exact tab labels and priority-feed layout are governed by the Today redesign plan and may evolve; keep the step simple — *"open Today; work the priorities shown there"* — rather than encoding specific tab names in this workflow until they stabilize in code.
- **grounding_confidence:** medium *(route is stable; internal tab labels are still shifting)*

---

### W11 — Open Inbox and filter threads

- **id:** `open_inbox_and_filter`
- **title:** Open Inbox and apply a quick filter
- **primary_route:** `/inbox`
- **entry_points:**
  - Navigation dock → **Inbox**
  - Direct URL `/inbox`
- **steps:**
  1. Click **Inbox** in the navigation dock (or go to `/inbox`).
  2. Choose a quick filter from the top of the list:
     - **All messages**
     - **Needs reply**
     - **Unfiled**
     - **Has draft**
     - **Planner**
- **notes:** Quick-filter labels are verbatim from the InboxPage. There is no **Auto-filed** quick filter and no **Ana drafts** quick filter in the current UI. If an operator asks for those specifically, Ana should say the specific filter isn't surfaced and direct them to **Has draft** or **Unfiled** as the closest available options (see §4).
- **grounding_confidence:** high

---

### W12 — Open Workspace studio tools

- **id:** `open_workspace_tools`
- **title:** Open Pricing Calculator, Offer Builder, or Invoice PDF Setup
- **primary_route:** `/workspace`
- **entry_points:**
  - Navigation dock → **Projects / Workspace**
  - Direct routes
- **steps:**
  1. Go to **Workspace**.
  2. In the left rail, pick the tool:
     - **Pricing Calculator** → `/workspace/pricing-calculator`
     - **Offer Builder** → `/workspace/offer-builder`
     - **Invoice PDF Setup** → `/workspace/invoices`
- **notes:** Labels and routes are verbatim from `WorkspaceContextList.tsx`. Offer Builder opens a hub; individual offers edit at `/workspace/offer-builder/edit/:projectId`.
- **grounding_confidence:** high

---

### W13 — Open Settings

- **id:** `open_settings`
- **title:** Open the Settings hub
- **primary_route:** `/settings`
- **entry_points:**
  - Navigation dock → **Settings**
  - Direct URL `/settings`
- **steps:**
  1. Click **Settings** in the navigation dock (or go to `/settings`).
  2. Use the Settings hub to reach specific configuration surfaces (Gmail, account, identity, etc.).
- **notes:** Settings hub is a composite page; internal sub-navigation labels evolve, so the workflow stops at "reach the hub." Sub-workflows should be added only when their surfaces are stable.
- **grounding_confidence:** high *(hub entry is stable; internal sub-sections evolve)*

---

### W14 — Connect Gmail and import label groups

- **id:** `connect_gmail_and_import_labels`
- **title:** Connect Gmail and import label-grouped threads
- **primary_route:** `/settings`
- **entry_points:**
  - Settings hub → Gmail section
- **steps:**
  1. Go to **/settings**.
  2. In the **Gmail** section, connect the account (OAuth flow) if not already connected.
  3. Once labels load, select the labels to import.
  4. Approve the resulting import group(s) when the batch review appears.
- **notes:** The Gmail workflow is a multi-step flow spread across `SettingsHubPage` and the `gmail_label_import_groups` review surface. There is no single "Import labels" button; the flow is sequenced (connect → load → select → approve batch). Encode this workflow at a coarse granularity and point the operator at the Gmail section of Settings; do not invent individual button labels.
- **grounding_confidence:** medium *(flow exists but is multi-step and UI-heavy; coarse description is honest, fine-grained would invent steps)*

---

### W15 — See delivered / completed projects

- **id:** `see_delivered_projects`
- **title:** See projects that have been delivered
- **primary_route:** `/pipeline`
- **entry_points:**
  - Pipeline page
- **steps:**
  1. Go to **Pipeline**.
  2. Scroll to the **Delivered** section.
  3. If the section is not visible, you have no projects in the delivered stage.
- **notes:** *Delivered* renders only when non-empty. There is no separate *Archived* section on this page in the current UI.
- **grounding_confidence:** high

---

## 4. Workflows explicitly NOT safe to encode yet

These came up in the analysis but do not have a concrete, labeled UI path in the current repo. Encoding them now would force Ana to invent buttons. They should wait for a UI slice that ships the missing surface.

### NE1 — Create a task manually from the UI

- **Finding:** `/tasks` page renders a **read-only** task list with a completion checkbox. No "+ New task" button, no task-creation form, no in-page affordance anywhere.
- **Reality:** Tasks are created only by (a) workflow automations in Inngest functions and (b) the operator-assistant `task` propose-confirm path (`insert-operator-assistant-task` endpoint).
- **If asked:** Ana should say there is no manual task-creation UI today, offer to propose a task via the widget (propose → confirm), and note that it will be saved as a studio/project task.
- **Encode later:** only when a visible UI task-creation affordance ships.

### NE2 — Review / approve / reject playbook rule candidates

- **Finding:** No operator dashboard for `playbook_rule_candidates` exists. The backend table and `review_playbook_rule_candidate` RPC exist; there is no UI that lists candidates or exposes the review action.
- **Reality:** The Escalations page uses a `promote_to_playbook` flag on resolved escalations, but that is not a candidate-review dashboard.
- **If asked:** Ana should acknowledge that a candidate-review UI is not yet available and propose the rule change via the widget's `playbook_rule_candidate` propose-confirm path instead. The rule then accumulates for a future review surface.
- **Encode later:** when the candidate-review dashboard ships (this is a known gap in the widget capability plan).

### NE3 — Re-enter onboarding after completion

- **Finding:** The `/onboarding` route exists and `OnboardingBriefingPage` renders it. The Settings page shows an "Onboarding completed" timestamp as read-only text with no re-entry button.
- **Reality:** Operators can navigate to `/onboarding` directly, but there is no discoverable link in Settings.
- **If asked:** Ana can safely point the operator at `/onboarding` as a direct URL. She must not invent a Settings button that does not exist.
- **Encode later:** encode a minimal workflow only once a discoverable entry link is added to Settings; until then, keep the advice to "go to /onboarding directly" and call that out.

### NE4 — Find auto-filed threads

- **Finding:** There is no "Auto-filed" quick filter in Inbox (`InboxPage` quick filters are `All messages`, `Needs reply`, `Unfiled`, `Has draft`, `Planner`). Inbox's left-rail may label an "Auto-filed" section in some contexts, but that label does not correspond to a live operator-facing filter in the message list.
- **Reality:** Suppression / auto-filing exists as routing metadata (`routing_disposition`, bucket derivation) but does not surface as a dedicated operator-facing filter.
- **If asked:** Ana should say there is no dedicated Auto-filed filter yet and suggest **Unfiled** or **Has draft** as closest surfaces. Do not invent a filter.
- **Encode later:** when a user-facing Auto-filed filter ships in the Inbox quick filters.

### NE5 — Find "Ana drafts" specifically (as opposed to all pending drafts)

- **Finding:** Two reads of the Inbox surface disagree about whether a dedicated "Ana drafts" section or filter exists. The canonical pending-drafts surface today is `/approvals` (W6). Inbox has a `Has draft` quick filter (W11) which is close but not labeled "Ana drafts."
- **Reality:** Operator-facing language of "Ana drafts" is not a confirmed UI surface today.
- **If asked:** Direct the operator to `/approvals` (authoritative) or to the Inbox `Has draft` filter (secondary). Do not reference an "Ana drafts" label that may not exist.
- **Encode later:** only if/when a labelled "Ana drafts" section lands in the Inbox UI.

### NE6 — Fine-grained Today-tab workflows

- **Finding:** Today is the operator hub and the layout is stable at the route level, but internal tab/section labels are still evolving (see the Today tabs semantics work in `V3_OPERATOR_ANA_WIDGET_CAPABILITY_PLAN.md`).
- **If asked:** Direct the operator to `/today` and describe the page at a high level. Avoid encoding specific tab labels into the workflow catalog until they stabilize.
- **Encode later:** once the Today tabs land in stable form; this workflow can then be expanded with per-tab entries.

---

## 5. Recommendation

### Safe to encode first (Slice 4 priority — confident)

Ship these fifteen into `operatorAssistantAppCatalog.ts` as the first `WORKFLOW_STEPS` cut:

- **W1** Create a new project
- **W2** Open an existing project
- **W3** Edit project facts (venue / date / package / value)
- **W4** Change automation mode
- **W5** Pause / lock automation flags
- **W6** Find pending drafts (prefer `/approvals`)
- **W7** Approve / reject a draft
- **W8** Find and work escalations (with tabs)
- **W9** See pipeline by stage
- **W10** Open Today *(route-level only; do not encode internal tabs yet)*
- **W11** Open Inbox + quick filters
- **W12** Open Workspace tools
- **W13** Open Settings *(hub-level only)*
- **W14** Connect Gmail + import labels *(coarse granularity)*
- **W15** See delivered projects

Every entry above cites a real component, route, label, or button observed in the repo. The `grounding_confidence` field per workflow is the signal for how deep a future slice should encode steps: **high** entries can encode full imperative steps; **medium** entries should stop at coarse descriptions until the UI stabilizes.

### Wait until UI ships the surface (do not encode yet)

Do **not** encode the following until the referenced UI exists:

- **NE1** Create a task manually — no UI affordance
- **NE2** Review / approve a rule candidate — no operator dashboard
- **NE3** Re-enter onboarding — no discoverable Settings link (direct-URL guidance only)
- **NE4** Find auto-filed threads — no dedicated filter
- **NE5** "Ana drafts"-labeled surface — unconfirmed; use `/approvals` or `Has draft` filter instead
- **NE6** Today per-tab workflows — tabs still evolving

For each of these, Ana's correct behavior today is defined in the §4 entry: state the gap honestly and point at the nearest real surface. That is consistent with the operator widget guardrails (*"no fabricated app surfaces"*) in `V3_OPERATOR_ANA_WIDGET_CAPABILITY_PLAN.md`.

### Encoding rules for the future slice

When a later slice converts this document into TypeScript:

1. Every `WORKFLOW_STEPS` entry must carry a `groundingConfidence` field mirroring this doc.
2. Divergence tests (per Slice 4 in the capability slices doc) must assert that each `primary_route` exists in `APP_ROUTES` and that label strings referenced in steps appear somewhere in the authoring-source files (`WeddingOverviewCard.tsx`, `WeddingManualControlsCard.tsx`, `EscalationsPage.tsx`, `ApprovalsPage.tsx`, `InboxPage.tsx`, `WorkspaceContextList.tsx`, etc.).
3. The widget prompt already forbids inventing UI surfaces — the catalog's correctness is what makes that guardrail real.
4. When a workflow is updated in this document (e.g. because UI shipped), update the TypeScript catalog in the same PR. Do not let this markdown and the code drift.

---

## Appendix — Authoring sources consulted

Workflow steps are grounded against these repo surfaces, listed for future divergence-test wiring:

- `src/App.tsx` — route definitions.
- `src/components/Dock/NavigationDock.tsx` — top-level navigation labels.
- `src/pages/AddWeddingPage.tsx` — new-project page ("Create & open").
- `src/pages/PipelinePage.tsx` — stage groups, link-to-project pattern, Delivered conditional.
- `src/components/wedding-detail/WeddingOverviewCard.tsx` — Edit / Save / field labels (couple, stage, when, where, package, value, balance).
- `src/components/wedding-detail/WeddingManualControlsCard.tsx` — Automation mode dropdown + pause / lock toggles.
- `src/pages/ApprovalsPage.tsx` — Approve & send / Edit / Reject buttons; `ApprovalDraftAiModal`.
- `src/pages/EscalationsPage.tsx` — Open / Resolved / Visual review / Banking / PR tabs.
- `src/pages/InboxPage.tsx` — quick filters (All messages / Needs reply / Unfiled / Has draft / Planner).
- `src/pages/TasksPage.tsx` — confirms no task-creation affordance today.
- `src/components/modes/workspace/WorkspaceContextList.tsx` — Studio Tools labels + routes.
- `src/pages/SettingsHubPage.tsx` — Gmail section; onboarding-completed read-only.
- `src/lib/operatorAssistantAppCatalog.ts` — the current route/label catalog this document is staged to extend.

The `grounding_confidence` value on each workflow above is a direct reflection of how deterministically that workflow can be derived from these sources today. Lowering confidence is always preferable to adding steps that would invent UI.

---

## 6. Repo implementation notes (routing + four-pane shell)

These notes align the catalog with `src/App.tsx` and the primary **FourPaneLayout** dashboard (the in-app experience), without changing §3 intent.

1. **Legacy redirects in `App.tsx`:** `path="approvals"`, `path="escalations"`, and `path="tasks"` all **navigate to `/today`** (bookmark compatibility). A standalone `ApprovalsPage` / `EscalationsPage` exist as components but are **not** the mounted route in the current router. Procedural help should prefer **`/today`** for pending drafts and open escalations in this build.
2. **Pipeline (two UIs in repo):** The dashboard uses `PipelineContextList` with section titles **Inquiries**, **Active bookings**, **Deliverables**, **Archived** (`BUCKET_TITLE`). A separate `PipelinePage` marketing-style view uses different section copy (**Action required (Inquiry–Contract)**, etc.). Encode operator guidance against **ContextList** for the main shell.
3. **Create project (`/add-wedding`):** `AddWeddingPage` includes a **Create & open** button, but that page is **not** registered on `App.tsx` routes, so it is not a real browser path today. W1 in code must be honest (see `APP_PROCEDURAL_WORKFLOWS` in `operatorAssistantAppCatalog.ts`).
4. **Project deep link:** `path="wedding/:weddingId"` redirects to `/pipeline/:weddingId`. Prefer **`/pipeline/:id`** for new guidance.
