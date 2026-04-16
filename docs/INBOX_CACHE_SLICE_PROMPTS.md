# Inbox Cache Slice Prompts

Use this file as the handoff pack for Vibecoder while implementing the inbox caching plan in [docs/INBOX_CACHE_SLICES.md](C:/Users/Despot/Desktop/wedding/docs/INBOX_CACHE_SLICES.md).

## Shared Context

Atelier OS currently feels jumpy in Inbox / inquiry / project navigation because frontend data loading is mostly:

- direct Supabase reads inside custom hooks
- local `useState` / `useEffect`
- `fireDataChanged()` / `onDataChanged()` invalidation
- no shared query cache
- no persistence layer

We want the smallest high-impact change first:

1. shared query cache
2. migrate the highest-value inbox reads
3. bridge existing invalidation to the query cache
4. optimistic inbox mutations
5. prefetch likely next views
6. only then evaluate virtualization
7. only then evaluate IndexedDB persistence

Important constraints:

- do not break the working Gmail inbox flow
- do not turn this into a large state-management rewrite
- preserve the current product behavior while improving perceived performance
- migrate incrementally and keep return shapes stable where possible

## Useful Repo Resources

High-level docs:

- [docs/INBOX_CACHE_SLICES.md](C:/Users/Despot/Desktop/wedding/docs/INBOX_CACHE_SLICES.md)
- [docs/ARCHITECTURE.md](C:/Users/Despot/Desktop/wedding/docs/ARCHITECTURE.md)
- [docs/DATABASE_SCHEMA.md](C:/Users/Despot/Desktop/wedding/docs/DATABASE_SCHEMA.md)

Frontend entry point:

- [src/main.tsx](C:/Users/Despot/Desktop/wedding/src/main.tsx)

Current hooks and invalidation system:

- [src/hooks/useUnfiledInbox.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useUnfiledInbox.ts)
- [src/hooks/useWeddings.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useWeddings.ts)
- [src/hooks/useThreadMessagesForInbox.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useThreadMessagesForInbox.ts)
- [src/lib/events.ts](C:/Users/Despot/Desktop/wedding/src/lib/events.ts)

Primary inbox UI surfaces:

- [src/pages/InboxPage.tsx](C:/Users/Despot/Desktop/wedding/src/pages/InboxPage.tsx)
- [src/components/modes/inbox/InboxContextList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxContextList.tsx)
- [src/components/modes/inbox/InboxMessageList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxMessageList.tsx)
- [src/components/modes/inbox/InboxThreadDetailPane.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxThreadDetailPane.tsx)
- [src/components/modes/inbox/InboxInspector.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxInspector.tsx)

Mutation-related helpers:

- [src/lib/gmailInboxModify.ts](C:/Users/Despot/Desktop/wedding/src/lib/gmailInboxModify.ts)
- [src/lib/inboxThreadLinking.ts](C:/Users/Despot/Desktop/wedding/src/lib/inboxThreadLinking.ts)

## Slice 1 Prompt: Query Cache Foundation

```md
We are implementing Slice 1 of the inbox cache plan.

Goal:
Introduce TanStack Query as the shared client cache layer with the smallest safe footprint.

Context:
- The app entry is in `src/main.tsx`
- The current frontend does not use TanStack Query / SWR / IndexedDB
- Existing reads still live in custom hooks and should remain untouched in this slice
- This slice should only lay the foundation for later migration

What to do:
1. Add TanStack Query to the project.
2. Create a shared `QueryClient`.
3. Wrap the app root in `QueryClientProvider` in `src/main.tsx`.
4. Choose conservative defaults for:
   - `staleTime`
   - `gcTime`
   - `refetchOnWindowFocus`
   - retry behavior
5. Keep the defaults friendly for a dashboard app with Supabase-backed data.
6. Do not migrate any hooks yet.

Constraints:
- no product behavior changes
- no broad refactors
- keep it easy to verify and easy to build on in Slice 2

Useful references:
- `docs/INBOX_CACHE_SLICES.md`
- `src/main.tsx`
- `docs/ARCHITECTURE.md`

Final output:
- files changed
- query client/provider added
- defaults chosen and why
- verification result
```

## Slice 2 Prompt: Migrate Highest-Value Read Hooks

```md
We are implementing Slice 2 of the inbox cache plan.

Goal:
Move the highest-value inbox/project read hooks onto TanStack Query so previously loaded data stays visible while background refresh happens.

Context:
- Query foundation already exists from Slice 1
- The highest-value hooks are:
  - `src/hooks/useUnfiledInbox.ts`
  - `src/hooks/useWeddings.ts`
  - `src/hooks/useThreadMessagesForInbox.ts`
- These hooks currently use ad hoc local fetch state and event subscriptions
- They power Inbox, inquiry/project rails, and thread detail

What to do:
1. Convert those 3 hooks to query-backed reads.
2. Keep their external return shape as stable as possible so calling components need minimal churn.
3. Use narrow query keys that reflect:
   - photographer id
   - folder/tab/filter state
   - thread id
   - wedding id where relevant
4. Keep background refresh behavior, but avoid clearing old data while fetching.
5. Do not migrate every hook in the repo in this slice.

Constraints:
- no broad invalidation rewrite yet
- no mutation rewrites yet
- preserve current Gmail inbox behavior

Useful references:
- `src/hooks/useUnfiledInbox.ts`
- `src/hooks/useWeddings.ts`
- `src/hooks/useThreadMessagesForInbox.ts`
- `src/pages/InboxPage.tsx`
- `src/components/modes/inbox/InboxContextList.tsx`
- `src/components/modes/inbox/InboxThreadDetailPane.tsx`
- `docs/DATABASE_SCHEMA.md`

Final output:
- files changed
- hooks migrated
- query keys used
- what remained unchanged for callers
- verification result
```

## Slice 3 Prompt: Bridge Existing Data Events to Query Invalidation

```md
We are implementing Slice 3 of the inbox cache plan.

Goal:
Bridge the existing `fireDataChanged()` / `onDataChanged()` model into TanStack Query invalidation so we can migrate incrementally instead of rewriting every mutation immediately.

Context:
- The event helpers live in `src/lib/events.ts`
- Multiple screens and Supabase realtime handlers already call `fireDataChanged(...)`
- Query-backed hooks from Slice 2 now exist
- We want current write flows to keep working while query-backed reads refresh correctly

What to do:
1. Inspect `src/lib/events.ts` and the existing `onDataChanged` consumers.
2. Add a bridge so data-change events invalidate relevant query keys.
3. Preserve the current event API for existing callers.
4. Keep invalidation as narrow as practical for:
   - inbox
   - weddings
   - drafts
   - tasks
   - escalations
5. Avoid introducing loops or double-refetch storms.

Constraints:
- do not remove the event system in this slice
- do not rewrite every caller
- keep it incremental and low-risk

Useful references:
- `src/lib/events.ts`
- `src/layouts/DashboardLayout.tsx`
- `src/hooks/useUnfiledInbox.ts`
- `src/hooks/useWeddings.ts`
- `src/hooks/useThreadMessagesForInbox.ts`

Final output:
- files changed
- how event scopes map to query invalidation
- any existing code kept for compatibility
- verification result
```

## Slice 4 Prompt: Optimistic Inbox Mutations

```md
We are implementing Slice 4 of the inbox cache plan.

Goal:
Make core inbox actions feel instant using optimistic updates with rollback on failure.

Priority actions:
- star / unstar
- mark read / unread
- link thread to project
- convert thread to inquiry

Context:
- Query-backed inbox/project/thread reads exist from earlier slices
- Current mutation helpers include:
  - `src/lib/gmailInboxModify.ts`
  - `src/lib/inboxThreadLinking.ts`
- Inbox UI surfaces include:
  - `src/components/modes/inbox/InboxMessageRow.tsx`
  - `src/components/modes/inbox/InboxInspector.tsx`
  - `src/components/modes/inbox/InboxThreadDetailPane.tsx`

What to do:
1. Add optimistic cache updates for the priority actions.
2. Update visible UI immediately.
3. Roll back cleanly on failure.
4. Invalidate only the necessary queries after mutation settlement.
5. Keep user-facing error handling intact or better.

Constraints:
- do not wait for a full refetch before updating UI
- do not break Gmail modify/link/convert semantics
- avoid broad cache invalidation when a local cache patch is enough

Useful references:
- `src/lib/gmailInboxModify.ts`
- `src/lib/inboxThreadLinking.ts`
- `src/components/modes/inbox/InboxMessageRow.tsx`
- `src/components/modes/inbox/InboxInspector.tsx`
- `docs/DATABASE_SCHEMA.md`

Final output:
- files changed
- optimistic actions implemented
- rollback behavior
- query keys affected
- verification result
```

## Slice 5 Prompt: Prefetch Likely Next Views

```md
We are implementing Slice 5 of the inbox cache plan.

Goal:
Prefetch the most likely next inbox/project data so navigation feels instant.

Context:
- Shared query cache already exists
- The most likely next views are:
  - thread detail after hovering/selecting an inbox row
  - inquiry/project context after hovering/selecting an inquiry/project rail item
- Primary UI surfaces:
  - `src/components/modes/inbox/InboxMessageList.tsx`
  - `src/components/modes/inbox/InboxContextList.tsx`
  - `src/components/modes/inbox/InboxThreadDetailPane.tsx`

What to do:
1. Add targeted prefetching for likely next views.
2. Prefer hover/select-driven prefetch for:
   - thread messages
   - project/inquiry context
3. Keep the strategy narrow; do not prefetch everything in sight.
4. Avoid redundant or spammy background fetches.

Constraints:
- no major component redesign
- prefetch only where it materially improves UX
- keep network usage sane

Useful references:
- `src/components/modes/inbox/InboxMessageList.tsx`
- `src/components/modes/inbox/InboxContextList.tsx`
- `src/hooks/useThreadMessagesForInbox.ts`
- `src/hooks/useWeddings.ts`

Final output:
- files changed
- prefetch points added
- query keys prefetched
- verification result
```

## Slice 6 Prompt: Evaluate Virtualization

```md
We are implementing Slice 6 of the inbox cache plan.

Goal:
Only add list virtualization if long inbox lists are still measurably slow after caching improvements.

Context:
- This is intentionally a conditional slice
- We should not add virtualization just because it sounds modern
- Likely surfaces to inspect:
  - `src/components/modes/inbox/InboxMessageList.tsx`
  - any long filtered inbox/thread rails

What to do:
1. Evaluate whether inbox list rendering is still a bottleneck.
2. If yes, add narrow virtualization only to the lists that need it.
3. If no, explicitly document why virtualization is deferred.

Constraints:
- do not add complexity without clear benefit
- do not break selection, hover, or keyboard behavior in inbox lists

Useful references:
- `src/components/modes/inbox/InboxMessageList.tsx`
- `docs/INBOX_CACHE_SLICES.md`

Final output:
- whether virtualization was needed
- files changed if implemented
- measured reason for implementation or deferral
- verification result
```

## Slice 7 Prompt: Evaluate IndexedDB Persistence

```md
We are implementing Slice 7 of the inbox cache plan.

Goal:
Evaluate whether browser-persistent cache is worth adding after query caching, invalidation, and optimistic updates are already stable.

Context:
- This app now has a shared query cache
- We only want persistence if it materially improves reload/restart experience
- We do not want to introduce a large local-first architecture prematurely

What to do:
1. Evaluate whether IndexedDB-backed query persistence is still needed.
2. If it is clearly valuable, add the smallest sane persistence layer on top of the query cache.
3. If not, explicitly defer it and document why.

Constraints:
- do not add a bespoke persistence system if TanStack Query persistence can cover the need
- do not expand scope into full offline mode
- keep this slice optional and evidence-driven

Useful references:
- `docs/INBOX_CACHE_SLICES.md`
- `src/main.tsx`
- the query client/provider files added in Slice 1

Final output:
- whether IndexedDB persistence was added or deferred
- why
- files changed if implemented
- verification result
```

## Recommended Order To Send

1. Slice 1
2. Slice 2
3. Slice 3
4. Slice 4
5. Slice 5
6. Slice 6
7. Slice 7

## First Four Slices Are the Real Win

If time or appetite is limited, the best stopping point is after Slice 4. That should deliver most of the perceived UX gain without turning this into a bigger system than needed.
