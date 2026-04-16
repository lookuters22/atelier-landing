# Today deep-link QA — inquiry (unfiled), task, escalation

**Date:** 2026-04-08  
**Scope:** Verify Today actions route to the correct problem-solving surface (not only “appears on Today”).  
**Product rule:** WhatsApp is **not** used for inquiry intake; inquiries come from email / web / client-facing paths only.

## Latest DB seed (real rows — 2026-04-08)

Run: `npm run qa:seed-today-deeplink -- <photographer-uuid>` (requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`).  
If multiple auth users exist, the script lists them and you must pass the UUID for the account you will use in the app.

**Photographer used for successful seed:** `3e181c04-a4ca-47b4-a16d-537d93916fe8` (must be logged into the app as this user to see Today items).

| Kind | Table(s) | ID | Label in UI |
|------|----------|-----|-------------|
| Inquiry | `threads`, `messages` | thread `e1547bb6-c10b-4437-b7da-2ec55d922064` | Title: `QA Today inquiry — email intake (manual seed)` — channel **email** (not WhatsApp) |
| Task | `tasks` | `55259b93-c667-4a87-898a-2bc9e33ad370` | `QA Today task — wedding-linked open task` |
| Escalation | `escalation_requests` | `51596573-4561-4767-9554-abcffd4a2390` | Body: `QA Today escalation — operator-blocked seed for Today deep-link QA` |

**Wedding used for task + escalation:** `696bfb69-6a96-495d-90b3-b72e85cb1557`

After refresh, all three should appear on **Today** for that photographer. Delete these rows in Supabase when QA is done (filter titles/bodies by `QA Today`).

---

## Method

1. **Code trace** of `route_to` (`src/lib/todayActionFeed.ts`), navigation (`ZenLobby.tsx` → `navigate(item.routeTo)`), and target surfaces (`InboxUrlHydrator`, `PipelineUrlHydrator`, `EscalationsPage`).
2. **Router check** for legacy redirects (`src/App.tsx`).
3. **Automated:** `todayActionFeed.test.ts` encodes expected URLs for each action type.
4. **Live browser verification** was **not** executed in this pass (no authenticated session in CI). Use the seed SQL template under `scripts/` with your dev Supabase project if you need to click through manually.

---

## Action type: Inquiry (unfiled thread)

| Item | Detail |
|------|--------|
| **Today model** | `action_type: "unfiled_thread"` from `threads` where `wedding_id` IS NULL (and `kind` ≠ `other`), scoped by `photographer_id`. |
| **Intake model** | Email / web / non-WhatsApp ingress that creates a **thread** without a wedding — **not** WhatsApp operator chat. |
| **`route_to`** | `/inbox?threadId=<thread_uuid>` |
| **Target surface** | Inbox → unfiled thread view (`InboxUrlHydrator` → `selectThread`, or project path if product changes). |
| **Identity in URL** | Yes — `threadId` is the stable id. |
| **Refresh** | Inbox keeps canonical params for successful hydration (prior inbox work). |

**Verification result:** **pass** (by code trace + existing inbox deep-link behavior).

**Test record (conceptual):** Any row in `threads` with `wedding_id IS NULL`, `photographer_id` = your user, at least one `messages` row for snippet/sender, `kind` not `other`. Prefix title e.g. `QA Today unfiled inquiry`.

---

## Action type: Open task (wedding-linked)

| Item | Detail |
|------|--------|
| **Today model** | `action_type: "open_task"` from `tasks` with `status = 'open'`. |
| **`route_to`** | `/pipeline/<wedding_id>?tab=tasks&openTask=<task_id>` |
| **Target surface** | Pipeline wedding → **Tasks** tab; `PipelineUrlHydrator` switches tab to `tasks`, scrolls to `id="wedding-task-<task_id>"` (`WeddingDetailTabContent.tsx`). |
| **Identity in URL** | Yes for navigation; **PipelineUrlHydrator** removes `tab` and `openTask` after handling (same pattern as `PipelineUrlHydrator` processed signature). |
| **Refresh after landing** | **partial** — URL is stripped after hydration, so a full refresh may **not** restore the same task anchor unless reproduced from Today again. |

**Verification result:** **pass** for “opens correct wedding + Tasks tab + scroll to task row” on first navigation; **partial** for “refresh preserves exact task in URL” (by design of `PipelineUrlHydrator`).

**Test record (conceptual):** Open task with non-null `wedding_id` and `due_date`, title prefix `QA Today task`.

---

## Action type: Open task (no wedding / orphan)

| Item | Detail |
|------|--------|
| **`route_to` from feed** | `/tasks` with **empty** query (`todayActionFromTask` when `!wedding_id`). |
| **Router** | `src/App.tsx` line 118: `<Route path="tasks" element={<Navigate to="/today" replace />} />` — **legacy redirect**. |
| **Result** | Navigation goes to **Today overview**, **not** a task detail surface; task id is **not** in the URL. |

**Verification result:** **fail** — Today click does **not** land on a task-specific problem-solving place for orphan tasks.

**Follow-up bug:** Either route orphan tasks to a real surface with `?taskId=` (and a page that honors it), or stop emitting Today actions for orphan tasks until that exists.

---

## Action type: Open escalation

| Item | Detail |
|------|--------|
| **Today model** | `action_type: "open_escalation"` from `escalation_requests` where `status = 'open'`, scoped by `photographer_id`. |
| **`route_to`** | `/escalations?escalationId=<id>` |
| **Target surface** | `EscalationsPage` loads rows, resolves tab via `escalationTabForDeepLink`, scrolls to `escalation-row-<id>`, then **removes** `escalationId` from the URL. |
| **Identity in URL** | Present during navigation; **stripped** after handling. |
| **Refresh** | **partial** — after strip, refresh may not re-highlight the same row without navigating from Today again. |

**Verification result:** **pass** for opening the escalations UI on the correct **tab** and scrolling to the row; **partial** for long-lived URL with `escalationId` (stripped by design).

**Test record (conceptual):** Insert into `escalation_requests` with required columns (`action_key`, `reason_code`, `decision_justification`, `question_body`, `operator_delivery`, etc. — see migrations). Prefix `question_body` e.g. `QA Today escalation — operator blocked`.

---

## Files touched in this QA pass

| File | Purpose |
|------|---------|
| `docs/qa/TODAY_DEEPLINK_INQUIRY_TASK_ESCALATION_QA.md` | This report |
| `scripts/qa_seed_today_deeplink_fixtures.sql` | Optional SQL template for manual QA seeds (replace UUIDs) |
| `src/lib/todayActionFeed.test.ts` | Regression test: orphan task `route_to` is `/tasks` with no query (documents gap vs `App.tsx` redirect) |

---

## Summary table

| Action | Appears on Today (data present) | Exact surface | ID in URL | Refresh |
|--------|----------------------------------|---------------|-----------|---------|
| Inquiry (unfiled) | Yes | Inbox thread | `threadId` | OK (inbox canonical URL behavior) |
| Task (with wedding) | Yes | Pipeline → Tasks tab + scroll | On first nav; then stripped | Partial |
| Task (orphan) | Yes | **Broken** → redirects to `/today` | No | Fail |
| Escalation | Yes | Escalations + tab + scroll | Stripped after open | Partial |

---

## Remaining deep-link bugs / follow-ups

1. **Orphan tasks:** `/tasks` → `/today` redirect destroys task deep linking; feed still emits `route_to: "/tasks"` with no task id in query.
2. **Pipeline task URL:** Params stripped after open — acceptable if product accepts; document for support.
3. **Escalations URL:** `escalationId` stripped after open — same note.
