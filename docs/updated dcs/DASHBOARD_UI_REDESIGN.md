# ANA: SHADCN UI DASHBOARD REDESIGN MASTERPLAN

## 1. THE PRIME DIRECTIVE: THE "STRANGLER FIG" UI MIGRATION
We are transitioning the Atelier OS dashboard to `shadcn/ui`. This is a high-risk operation because the underlying Supabase data hooks and Inngest event triggers MUST remain perfectly intact.

**Rule 1: Never Rewrite Data Logic.** If you are replacing a legacy `<table>` with a shadcn `<DataTable>`, you must copy the exact `useQuery`, `useMutation`, or Supabase fetch logic from the old file into the new one.
**Rule 2: Component-by-Component.** Do not rewrite an entire page at once. If a page has a Header, a Stats Row, and a Table, we migrate them as three separate tasks.
**Rule 3: Maintain the Vibe.** Shadcn is stark and utilitarian by default. We must customize `globals.css` (warm grays, rounded corners, elegant typography) to maintain the Atelier luxury brand.

---

## 2. THE TACTICAL WORKFLOW (HOW TO MIGRATE A COMPONENT)

When instructed to migrate a specific component (e.g., `src/components/ClientList.tsx`), the AI must follow this exact sequence:

### Step 1: Analyze the Target Component
* Read the existing component file.
* Identify all State (`useState`), Data Fetching (Supabase hooks), and Event Handlers (`onClick`, form submissions).
* *Crucial:* Do not change the names of the props or the shape of the data the component expects.

### Step 2: Install Required Primitives
* If the component needs a button, dialog, or table, instruct the user to run the shadcn CLI command first:
  `npx shadcn-ui@latest add button dialog table`
* *Wait for the user to confirm installation before proceeding.*

### Step 3: Scaffold the New Component (Side-by-Side)
* Create a new file (e.g., `src/components/ClientListShadcn.tsx`).
* Import the newly installed shadcn primitives.
* Copy the entire data layer (hooks, state, event handlers) from the old component into the new component exactly as they were.

### Step 4: Map the UI to the Data
* Build the new UI using the shadcn primitives.
* Wire the existing `onClick` handlers, `onSubmit` functions, and mapped data arrays into the new shadcn elements.
* Example: `<button onClick={handleDelete}>` becomes `<Button onClick={handleDelete} variant="destructive">`.

### Step 5: Test and Swap
* Replace the import in the parent page to use the new `ClientListShadcn` component.
* Once verified, the old file can be deleted and the new file renamed.

---

## 3. THE EXECUTION ROADMAP

### [ ] PHASE 1: SHADCN INITIALIZATION & THEME
**Goal:** Setup the design system and luxury theme.
* **Task 1A:** Run `npx shadcn-ui@latest init`.
* **Task 1B:** Update `globals.css` with the Atelier Luxury theme (warm palettes, elegant radii).
* **Task 1C:** Install base primitives: `npx shadcn-ui@latest add button input card dialog dropdown-menu`.

### [ ] PHASE 2: GLOBAL LAYOUT (APP SHELL)
**Goal:** Replace the navigation and layout wrapping the dashboard.
* **Task 2A:** Install `sheet`, `separator`, `avatar`.
* **Task 2B:** Refactor `Sidebar.tsx` to use shadcn components, maintaining all `react-router-dom` links.
* **Task 2C:** Refactor `Header.tsx` (User profile dropdown, notifications).

### [ ] PHASE 3: CORE DASHBOARD VIEWS
**Goal:** Upgrade the primary data views.
* **Task 3A:** Migrate the "Weddings/Projects" Grid View (Using `Card`, `Badge`).
* **Task 3B:** Install `table`. Migrate the "Clients" List View to a shadcn Data Table. *Ensure Supabase pagination/sorting remains intact.*
* **Task 3C:** Install `tabs`. Migrate the individual "Wedding Details" page layout.

### [ ] PHASE 4: FORMS & MUTATIONS
**Goal:** Upgrade the data-entry modals.
* **Task 4A:** Install `form`, `select`, `popover`, `calendar`.
* **Task 4B:** Migrate the "New Wedding" modal. Combine shadcn `Dialog` with `Form` (react-hook-form + zod). Wire it to the existing Supabase insert mutation.
* **Task 4C:** Migrate the "Edit Client" sheet/modal.

---

## 4. AI INSTRUCTIONS (HOW TO READ THIS FILE)
When this file is provided in a prompt:
1. Determine which Phase and Task we are currently executing.
2. If starting a new migration, explicitly list the shadcn CLI commands the user needs to run.
3. When outputting code, prioritize the safe transfer of existing data hooks over clever UI tricks.