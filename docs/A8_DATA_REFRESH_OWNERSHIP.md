# A8 — Data refresh and client state consistency

## Canonical invalidation

| Mechanism | Role |
|-----------|------|
| `fireDataChanged()` | Single browser event; invalidates all hooks that subscribe via `onDataChanged()`. |
| `onDataChanged` / `onDraftsChanged` | **Identical** — prefer `onDataChanged` in new code. |
| Dashboard `postgres_changes` | Fires `fireDataChanged()` on `drafts`, `threads`, `messages`, `weddings`, `tasks` (after migration `20260430130000_enable_realtime_tasks.sql`). |

## Source-of-truth by surface

| Surface | Query / projection | Invalidation |
|---------|-------------------|--------------|
| Today metrics (sidebar) | `v_threads_inbox_latest_message` count, `v_pending_approval_drafts` count, featured `weddings` | `onDataChanged` + realtime |
| Inbox list | `v_threads_inbox_latest_message` via `useUnfiledInbox` | `onDataChanged` + local `fireDataChanged` after link/delete |
| Today actions | Composes `usePendingApprovals`, `useUnfiledInbox`, `useTasks`, `useOpenEscalations` | Each hook’s own subscription |
| Approvals list | `v_pending_approval_drafts` | `onDataChanged` + realtime on `drafts` |
| Tasks list | `v_open_tasks_with_wedding` | `onDataChanged` + realtime on `tasks` |
| Notifications preview | projections for tasks/drafts/unfiled | `onDataChanged` |
| Wedding detail / pipeline | `useWeddingProject` + `useWeddingThreads` | `onDataChanged` (timeline + per-thread messages) |
| Gmail Settings staging | `SettingsHubPage` local `refetch` | `onDataChanged` + explicit `fireDataChanged` after actions |

## First pass (implemented)

- Documented subscriber list and deprecation of duplicate names in `src/lib/events.ts`.
- `useTasks` subscribes to `onDataChanged` (aligned with other list hooks).
- Realtime channel includes **`tasks`** + publication migration so task changes propagate to metrics/notifications without ad-hoc-only fixes.
- `useTodayMetrics`, `usePendingApprovals`, `useWeddingProject` import **`onDataChanged`** explicitly (clearer than `onDraftsChanged`).

## Later A8 ideas

- Dedupe refetches when multiple stacked hooks mount on the same page (optional context or debounced invalidation).
- Subscribe `escalation_requests` to realtime if open-escalation counts drift.
- ~~`useUnfiledMessages`~~ removed (was unused); Inbox uses `useUnfiledInbox` only.
