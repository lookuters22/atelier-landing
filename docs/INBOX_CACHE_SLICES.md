# Inbox Cache Slices

Goal: make Inbox, inquiry, and project navigation feel fast and stable without turning this into a large frontend rewrite.

## Principles

- keep the working Gmail inbox flow intact
- prefer shared client cache before browser persistence
- migrate incrementally from the current `useState` / `useEffect` + `fireDataChanged()` model
- optimize the highest-traffic inbox paths first
- only add complexity when the previous slice proves it is needed

## Current State

Today the app mostly uses:

- direct Supabase reads inside custom hooks
- local component state for fetched data
- `fireDataChanged()` / `onDataChanged()` to trigger refetches
- no shared query cache
- no IndexedDB persistence
- no virtualization layer

This is why Inbox and pipeline transitions feel jumpy:

- previously loaded data disappears during refetch
- the same data can be fetched multiple times across views
- small mutations often feel like full reloads
- route and selection changes can remount data-heavy panes

## Decision

Do **not** start with IndexedDB.

Do **not** start with a broad local-first rewrite.

Start with TanStack Query as the shared cache layer, then add optimistic updates, then add prefetching. Evaluate virtualization and IndexedDB only after the core cache model is stable.

## Slice 1: Query Cache Foundation

Scope:

- add TanStack Query to the app
- add a shared `QueryClient` and provider at the app root
- choose conservative defaults for read-heavy screens

Why first:

- biggest UX win for the least architectural churn
- enables stale-while-revalidate behavior
- creates the base for optimistic updates and prefetching

Done when:

- app boots with `QueryClientProvider`
- no product behavior changes yet
- cache defaults are documented in code

## Slice 2: Migrate Highest-Value Read Hooks

Migrate these hooks first:

- `useUnfiledInbox`
- `useWeddings`
- `useThreadMessagesForInbox`

Requirements:

- keep existing return shape as stable as possible
- use narrow query keys for photographer, folder, tab, thread, and wedding state
- avoid broad invalidation where narrower keys work

Why these first:

- they drive the main Inbox / inquiry / project switching experience
- they are the biggest source of visible loading and flicker

Done when:

- these hooks are query-backed instead of ad hoc local fetch state
- previously loaded data stays visible while refetch happens

## Slice 3: Bridge Existing Data Events to Query Invalidation

Scope:

- keep `fireDataChanged()` / `onDataChanged()` for now
- route those events into QueryClient invalidation

Why:

- lets us migrate incrementally without rewriting every mutation first
- preserves working write flows while moving reads onto shared cache

Done when:

- existing event-driven refreshes still work
- query-backed hooks refresh through invalidation instead of bespoke reload logic

## Slice 4: Optimistic Inbox Mutations

Priority actions:

- star / unstar
- mark read / unread
- link thread to project
- convert thread to inquiry

Requirements:

- update visible UI immediately
- roll back cleanly on failure
- invalidate only the necessary queries afterward

Why:

- this is where the app starts feeling native instead of request-driven

Done when:

- inbox actions feel instant
- small mutations do not feel like full-screen reloads

## Slice 5: Prefetch Likely Next Views

Scope:

- prefetch thread detail when a thread row is hovered or selected
- prefetch inquiry/project context when those entries are hovered or selected
- prefetch only likely next data, not everything

Why:

- turns view switches into "already loaded" instead of "wait, then load"

Done when:

- list to thread/project transitions feel materially faster

## Slice 6: Evaluate Virtualization

Scope:

- only if long inbox lists are actually slow or janky
- apply narrowly to the lists that need it

Why later:

- useful, but not the first bottleneck to solve
- adds complexity we may not need once caching is fixed

### Status (Slice 6 decision — **deferred**, no code shipped)

Virtualization was **not** implemented in this pass.

**Why defer (evidence-driven, no automatic build):**

- **Upper bound on rows:** Inbox list data comes from `v_threads_inbox_latest_message` with **`.limit(200)`** in `useUnfiledInbox` / `fetchInboxLatestProjection`. The DOM typically renders **at most on the order of hundreds** of `InboxMessageRow` components, which is usually below the threshold where raw React list rendering dominates on modern hardware.
- **Primary pain was data behavior, not DOM count:** Slices 1–5 addressed **jumpy navigation**, **redundant refetches**, **stale-while-revalidate**, **optimistic mutations**, and **prefetch**—the main perceived issues called out in the cache plan. Those improvements do not require list virtualization.
- **Cost vs benefit:** Virtualizing `InboxMessageList` would need careful integration with **selection**, **scroll-to-selected** (`useLayoutEffect` + `data-inbox-thread-row`), **keyboard navigation** (Alt+arrows), and **hover prefetch** on rows. That is non-trivial risk for an unproven DOM bottleneck.
- **Rails / sidebars:** Inquiry and wedding rails are **short lists** (filtered `weddings`); no evidence they need virtualization.

**What would justify revisiting:**

- Profiling (e.g. React **Profiler** or Performance panel) showing **long tasks** or high commit cost when **scrolling or rendering** the inbox list with a **full ~200 row** dataset on target hardware, *after* Slices 1–5 are live.
- If needed, prefer a **narrow** approach (e.g. `@tanstack/react-virtual` **only** on the scroll container wrapping thread rows), preserving scroll APIs and row `data-*` hooks used for scroll-into-view.

Done when:

- either implemented for a proven long-list bottleneck
- or explicitly deferred because caching solved the perceived issue (**this repo: deferred as documented above**)

## Slice 7: Decide on IndexedDB Persistence

Scope:

- do not implement first
- only evaluate after query cache, invalidation, and optimistic updates are stable

Why later:

- persistent browser cache is valuable, but not the fastest path to fixing current UX
- much easier to add once query structure is already sane

### Status (Slice 7 decision — **deferred**, no persistence shipped)

**IndexedDB (or other durable) TanStack Query persistence was not added** in this pass. The shared client remains **in-memory only** ([`src/lib/queryClient.ts`](src/lib/queryClient.ts)).

**Why defer (evaluation-first, evidence-driven):**

| Factor | Assessment |
|--------|------------|
| **Problem solved elsewhere** | Slices 1–5 already address the main UX goals: stable reads, invalidation, optimistic updates, and prefetch **within a session**. Cold **reload** is a different problem; there is **no in-repo metric** showing reload latency as the top pain after those slices. |
| **Startup vs correctness** | Persistence improves **first paint after hard refresh** by hydrating from disk, but it can briefly show **stale** inbox/wedding/thread state until a refetch completes. That tradeoff needs a **clear product ask**, not a default. |
| **Sensitivity** | Cached rows include **inbox threads, messages, wedding names**—suitable for memory while the app is open; writing them to **IndexedDB** increases **exposure surface** (shared machines, backups of profile data). Any future persistence must treat this as **PII** and scope narrowly. |
| **User isolation** | Persisted query cache **must** be keyed by authenticated identity (e.g. `photographerId` / session `buster`) and **cleared on sign-out**. Getting this wrong risks **cross-user data bleed**—higher stakes than in-memory cache cleared with the tab lifecycle. |
| **Invalidation** | `fireDataChanged` + query invalidation (Slice 3) keeps server truth authoritative **while online**. Persisted state must **revalidate on resume** and respect `maxAge` / stale boundaries so offline disk cache does not override fresh server intent. |
| **Scope creep** | TanStack’s persistence tooling ([`@tanstack/react-query-persist-client`](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient) + an IndexedDB/async persister) is the right **shape** if we ever add this—**not** a bespoke second cache. Still adds bundle size, testing, and sign-out wiring. |
| **Offline mode** | This slice does **not** scope **full offline** or sync—only “faster reload.” Deferring avoids slipping toward a **local-first** architecture prematurely. |

**If persistence becomes justified later (smallest sane path):**

- Use **official** TanStack persistence (`PersistQueryClientProvider` or `persistQueryClient`) with an **async persister** (IndexedDB), not a custom dump of query data.
- Restrict with **`shouldDehydrateQuery`** to **only** query keys from Slices 2–5 (e.g. prefixes `['inbox', …]`, `['weddings', 'by-photographer', …]`), excluding auth tokens or unrelated queries.
- Set a **`buster` or `maxAge`** tied to account/session; **`queryClient.clear()`** + persister remove **`onSignOut`**.
- Accept **one “stale then reconcile”** frame or document UX for slow networks.

Done when:

- we either add intentional query persistence
- or document why in-memory cache is good enough for now (**this repo: deferred as documented above**)

## Recommended Execution Order

1. Slice 1: Query Cache Foundation
2. Slice 2: Highest-Value Read Hooks
3. Slice 3: Event to Query invalidation bridge
4. Slice 4: Optimistic inbox mutations
5. Slice 5: Prefetch likely next views
6. Slice 6: Evaluate virtualization
7. Slice 7: Evaluate IndexedDB persistence

## First Pass Definition of Done

We can stop the first pass after Slice 4 if:

- Inbox / inquiry / project transitions are much less jumpy
- previously loaded data stays visible while refreshing
- star/read/link/convert actions feel immediate
- the Gmail inbox flow still behaves correctly
- we did not introduce a large state-management regression

That gets most of the value without overbuilding.

## First Slice We Start Now

Start with **Slice 1: Query Cache Foundation**.

Concrete first steps:

1. add TanStack Query dependency
2. create a shared `QueryClient`
3. wrap the app root in `QueryClientProvider`
4. choose initial defaults for:
   - `staleTime`
   - `gcTime`
   - `refetchOnWindowFocus`
   - retry behavior
5. leave all existing hooks alone until Slice 2

This keeps the first move small, low-risk, and easy to verify.
