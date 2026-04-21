# Ana Dashboard Redesign Integration Plan

## Source of truth

- Visual redesign source: [Ana Dashboard.html](C:/Users/Despot/Desktop/wedding/export/redesign/Ana%20Dashboard.html)
- Live implementation root: [src/layouts/FourPaneLayout.tsx](C:/Users/Despot/Desktop/wedding/src/layouts/FourPaneLayout.tsx)
- This plan applies only to the main dashboard shell and these four modes:
  - `Today`
  - `Inbox`
  - `Pipeline`
  - `Calendar`

## What we learned

- The final redesign is a static HTML/CSS prototype, not a ready React implementation.
- The `export/redesign/uploads/src/...` tree is not the redesigned code. It matches the old export and should not be treated as implementation output.
- The live app already has the correct top-level architecture for the redesign:
  - shared shell in `FourPaneLayout`
  - route-based mode switching for `/today`, `/inbox`, `/pipeline`, `/calendar`
  - existing mode contexts/providers for inbox, pipeline, and calendar
  - existing data hooks and Supabase wiring
- Because of that, we do **not** need a new app architecture. We need a controlled visual and structural translation of the final prototype into the current codebase.

## Non-negotiable rules

- Do not change the database schema.
- Do not replace live data with mock data from the HTML prototype.
- Do not rewrite route structure unless absolutely required.
- Do not remove or bypass existing providers, hooks, Gmail wiring, URL hydration, or Supabase logic.
- Do not touch manager pages unless explicitly requested. This redesign is for the main dashboard shell, not `/manager/*`.
- Treat the HTML as a visual reference only:
  - keep layout, hierarchy, spacing, typography, and interaction cues
  - ignore hardcoded names, counts, dates, and fake prototype JS

## Existing architecture to preserve

### Shell and routes

- [src/App.tsx](C:/Users/Despot/Desktop/wedding/src/App.tsx)
- [src/layouts/FourPaneLayout.tsx](C:/Users/Despot/Desktop/wedding/src/layouts/FourPaneLayout.tsx)
- [src/components/Dock/NavigationDock.tsx](C:/Users/Despot/Desktop/wedding/src/components/Dock/NavigationDock.tsx)
- [src/components/PageTransition.tsx](C:/Users/Despot/Desktop/wedding/src/components/PageTransition.tsx)

### Today

- [src/components/modes/today/ZenLobby.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/ZenLobby.tsx)
- [src/components/modes/today/DynamicBackground.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/DynamicBackground.tsx)
- [src/hooks/useTodayMetrics.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useTodayMetrics.ts)
- [src/hooks/useTodayActions.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useTodayActions.ts)

### Inbox

- [src/components/modes/inbox/InboxModeContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxModeContext.tsx)
- [src/components/modes/inbox/InboxUrlHydrator.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxUrlHydrator.tsx)
- [src/components/modes/inbox/InboxThreePaneShell.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxThreePaneShell.tsx)
- [src/components/modes/inbox/InboxContextList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxContextList.tsx)
- [src/components/modes/inbox/InboxWorkspace.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxWorkspace.tsx)
- [src/components/modes/inbox/InboxMessageList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxMessageList.tsx)
- [src/components/modes/inbox/InboxMessageRow.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxMessageRow.tsx)
- [src/components/modes/inbox/InboxThreadDetailPane.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxThreadDetailPane.tsx)
- [src/components/modes/inbox/InboxInspector.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxInspector.tsx)
- [src/components/modes/inbox/GmailThreadInlineReplyDock.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/GmailThreadInlineReplyDock.tsx)

### Pipeline

- [src/components/modes/pipeline/PipelineModeContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineModeContext.tsx)
- [src/components/modes/pipeline/PipelineWeddingContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineWeddingContext.tsx)
- [src/components/modes/pipeline/PipelineContextList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineContextList.tsx)
- [src/components/modes/pipeline/PipelineWorkspace.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineWorkspace.tsx)
- [src/components/modes/pipeline/PipelineInspector.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineInspector.tsx)
- [src/hooks/usePipelineWeddings.ts](C:/Users/Despot/Desktop/wedding/src/hooks/usePipelineWeddings.ts)

### Calendar

- [src/components/modes/calendar/CalendarModeContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarModeContext.tsx)
- [src/components/modes/calendar/CalendarContextList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarContextList.tsx)
- [src/components/modes/calendar/CalendarGrid.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarGrid.tsx)
- [src/components/modes/calendar/CalendarScheduleGrid.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarScheduleGrid.tsx)
- [src/components/modes/calendar/BookingLinksTable.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/BookingLinksTable.tsx)
- [src/components/modes/calendar/TravelBlockedView.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/TravelBlockedView.tsx)
- [src/components/modes/calendar/CalendarInspector.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarInspector.tsx)
- [src/components/modes/calendar/EventForm.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/EventForm.tsx)

## Routing conclusion

Top-level routing is already present and matches the redesign:

- `/today`
- `/inbox`
- `/pipeline`
- `/pipeline/:id`
- `/calendar`

So:

- no new top-level routes are required for this redesign
- no new mode providers are required
- any new UI tabs, toggles, or subviews should first try to use existing component state or existing mode context
- only add new URL state if the current architecture truly needs deep-linking for a newly introduced subview

## Integration strategy

Build this in small slices. Each slice should land working, visually closer to the redesign, and still fully wired to live data and existing behavior.

The vibecoder should work from the final HTML prototype section-by-section, but implement inside the existing files listed in this plan.

## Slice order

### Slice 1: Global shell, tokens, and dock

Goal:
- Bring the shell closer to the redesign without breaking any mode behavior.

Files:
- [src/layouts/FourPaneLayout.tsx](C:/Users/Despot/Desktop/wedding/src/layouts/FourPaneLayout.tsx)
- [src/components/Dock/NavigationDock.tsx](C:/Users/Despot/Desktop/wedding/src/components/Dock/NavigationDock.tsx)
- [src/components/Dock/FloatingDock.tsx](C:/Users/Despot/Desktop/wedding/src/components/Dock/FloatingDock.tsx)
- [src/components/PageTransition.tsx](C:/Users/Despot/Desktop/wedding/src/components/PageTransition.tsx)
- [src/index.css](C:/Users/Despot/Desktop/wedding/src/index.css)
- [src/components/panes/paneClasses.ts](C:/Users/Despot/Desktop/wedding/src/components/panes/paneClasses.ts)

Tasks:
- Port shared visual tokens from the redesign into the app theme safely.
- Update dock look and spacing to match final prototype.
- Keep mode detection and route transitions unchanged.
- Keep `DynamicBackground` behavior for Today.

Must not break:
- route switching
- resizable pane behavior
- support widget / spotlight mounting

Acceptance:
- all 4 modes still render
- dock still navigates correctly
- no logic moved out of providers/hooks

### Slice 2: Today redesign

Goal:
- Rebuild `Today` to match the final redesign while keeping real data and real actions.

Files:
- [src/components/modes/today/ZenLobby.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/ZenLobby.tsx)
- [src/components/modes/today/DynamicBackground.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/DynamicBackground.tsx)
- optionally small token support in [src/index.css](C:/Users/Despot/Desktop/wedding/src/index.css)

Data sources to preserve:
- [src/hooks/useTodayMetrics.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useTodayMetrics.ts)
- [src/hooks/useTodayActions.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useTodayActions.ts)

Tasks:
- Map final HTML Today hero, stat row, priority panel, and activity ticker into `ZenLobby`.
- Keep priority actions wired to real today actions.
- Keep draft approval, escalation, and navigation behavior intact.
- Preserve deep-link behavior to inbox/pipeline where the current code already supports it.

Must not break:
- draft approval flows
- escalation resolution flow
- keyboard/open navigation
- live greeting/time/background behavior

Acceptance:
- Today uses live counts and live action feed
- clicking priority items still opens the correct place
- no fake hardcoded metrics from the prototype remain

### Slice 3: Inbox left rail and list

Goal:
- Redesign the Inbox context rail and thread list first, without changing message detail behavior yet.

Files:
- [src/components/modes/inbox/InboxThreePaneShell.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxThreePaneShell.tsx)
- [src/components/modes/inbox/InboxContextList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxContextList.tsx)
- [src/components/modes/inbox/InboxWorkspace.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxWorkspace.tsx)
- [src/components/modes/inbox/InboxMessageList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxMessageList.tsx)
- [src/components/modes/inbox/InboxMessageRow.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxMessageRow.tsx)
- [src/components/modes/inbox/InboxListTabs.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxListTabs.tsx)
- pane primitives in [src/components/panes](C:/Users/Despot/Desktop/wedding/src/components/panes)

Context/logic to preserve:
- [src/components/modes/inbox/InboxModeContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxModeContext.tsx)
- [src/components/modes/inbox/InboxUrlHydrator.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxUrlHydrator.tsx)

Tasks:
- Port redesign layout/styling for left rail and thread list.
- Keep current folder, tab, project filter, and URL hydration logic.
- Keep real thread rows, selection state, search, and Gmail label filtering.

Must not break:
- thread selection
- project filter behavior
- deep links into inbox
- list scrolling and pane resizing

Acceptance:
- selecting a thread still opens detail correctly
- folder/tab/filter state still works
- no regression in inbox URL hydration

### Slice 4: Inbox thread detail, inspector, and reply dock

Goal:
- Finish Inbox by translating the thread view and right inspector to the redesign.

Files:
- [src/components/modes/inbox/InboxThreadDetailPane.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxThreadDetailPane.tsx)
- [src/components/chat/ConversationFeed.tsx](C:/Users/Despot/Desktop/wedding/src/components/chat/ConversationFeed.tsx)
- [src/components/modes/inbox/GmailThreadInlineReplyDock.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/GmailThreadInlineReplyDock.tsx)
- [src/components/modes/inbox/InboxInlineReplyComposer.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxInlineReplyComposer.tsx)
- [src/components/modes/inbox/InboxReplyActions.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxReplyActions.tsx)
- [src/components/modes/inbox/InboxInspector.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxInspector.tsx)
- [src/components/modes/inbox/InboxSenderContactActions.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/inbox/InboxSenderContactActions.tsx)

Logic/libs to preserve:
- Gmail send/modify/labels libs in `src/lib/*gmail*`
- message fetch hooks
- thread/contact linking behavior

Tasks:
- Port redesign thread header, message presentation, draft card styling, and inspector cards.
- Keep reply/forward/send logic exactly wired to current implementation.
- If the redesign implies new action buttons, wire them only if existing behavior exists; otherwise render safely as disabled or hidden until specified.

Must not break:
- sending email
- saving inline drafts
- thread message rendering
- link/open project actions

Acceptance:
- a real inbox thread can still be opened, read, drafted, and sent
- inspector still reflects the selected thread state

### Slice 5: Pipeline context list and workspace framing

Goal:
- Move Pipeline to the redesign shell and layout without breaking wedding selection.

Files:
- [src/components/modes/pipeline/PipelineContextList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineContextList.tsx)
- [src/components/modes/pipeline/PipelineWorkspace.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineWorkspace.tsx)
- [src/components/modes/pipeline/PipelineModeContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineModeContext.tsx)

Logic to preserve:
- [src/components/modes/pipeline/PipelineWeddingContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineWeddingContext.tsx)
- [src/hooks/usePipelineWeddings.ts](C:/Users/Despot/Desktop/wedding/src/hooks/usePipelineWeddings.ts)
- route selection via `/pipeline/:id`

Tasks:
- Port redesign left pipeline rail and center workspace framing.
- Keep wedding selection driven by existing route/context.
- Keep empty/loading states valid.

Must not break:
- selecting a wedding row
- direct route to `/pipeline/:id`
- timeline pane mounting

Acceptance:
- pipeline list selects the same wedding ids as before
- direct deep links still open the correct record

### Slice 6: Pipeline inspector and timeline presentation

Goal:
- Finish the redesigned Pipeline experience around the existing wedding detail/timeline data.

Files:
- [src/components/modes/pipeline/PipelineInspector.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineInspector.tsx)
- [src/components/modes/pipeline/PipelineWeddingContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineWeddingContext.tsx)
- any timeline subcomponents used by that context

Tasks:
- Translate redesign inspector panels and center detail composition.
- Keep current source of truth for wedding timeline and notes.
- Do not invent new stage/state models from the prototype.

Must not break:
- timeline data rendering
- note/actions already supported in the current pipeline detail

Acceptance:
- selected pipeline wedding still shows real data in center and inspector panes

### Slice 7: Calendar context rail and top controls

Goal:
- Port calendar shell, filters, mini calendar, and mode controls first.

Files:
- [src/components/modes/calendar/CalendarContextList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarContextList.tsx)
- [src/components/modes/calendar/CalendarModeContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarModeContext.tsx)
- [src/components/modes/calendar/CalendarGrid.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarGrid.tsx)

Tasks:
- Port redesign calendar left rail and top controls.
- Reuse existing `activeNav`, `calendarView`, `selectedDate`, and type filter state.
- Only add context state if the redesign needs a control that truly has no current equivalent.

Must not break:
- month/week/day switching
- schedule / booking links / travel navigation
- selected date behavior

Acceptance:
- all existing calendar modes remain reachable
- view toggles still work from current context

### Slice 8: Calendar main views and inspector

Goal:
- Complete the redesigned calendar grid, day/week/month rendering, and right inspector.

Files:
- [src/components/modes/calendar/CalendarScheduleGrid.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarScheduleGrid.tsx)
- [src/components/modes/calendar/BookingLinksTable.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/BookingLinksTable.tsx)
- [src/components/modes/calendar/TravelBlockedView.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/TravelBlockedView.tsx)
- [src/components/modes/calendar/CalendarInspector.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/CalendarInspector.tsx)
- [src/components/modes/calendar/EventForm.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/calendar/EventForm.tsx)

Tasks:
- Port final redesign week/day/month visuals.
- Keep current event CRUD and inspector flows.
- Keep booking links and travel view wired to current data/context.

Must not break:
- event create/edit/delete
- booking links view
- travel blocked view
- inspector mode transitions

Acceptance:
- real events still render and edit correctly
- no prototype-only fake interactions remain

### Slice 9: Final polish, responsiveness, and regression pass

Goal:
- Make the four redesigned modes production-safe.

Files:
- all touched files above

Tasks:
- clean up duplicated styling
- move repeated style decisions into pane primitives or tokens where appropriate
- verify desktop and smaller laptop widths
- verify pane resize behavior
- verify route transitions
- verify no console errors

Acceptance:
- `/today`, `/inbox`, `/pipeline`, `/calendar` all work end-to-end
- no broken auth/data flows
- no schema changes
- no manager page regressions

## How to prompt the vibecoder for each slice

Use this structure every time:

1. Name the slice clearly.
2. List exact files they are allowed to touch.
3. Tell them to use `Ana Dashboard.html` as visual reference only.
4. Tell them which hooks/providers/libs must remain intact.
5. Ask them to stop after the slice and summarize:
   - what they changed
   - what is still mocked or approximate
   - any wiring blockers they found

## Prompt template for each slice

Use `C:\Users\Despot\Desktop\wedding\export\redesign\Ana Dashboard.html` as the visual source of truth, but implement only inside the live app architecture. Do not use mock data from the HTML. Do not change the database schema, route structure, or core provider/hook wiring unless absolutely necessary. For this slice, only edit: [FILES]. Keep these integrations intact: [HOOKS/CONTEXT/LIBS]. Match the redesign as closely as possible for layout, hierarchy, spacing, and styling, then stop and report exactly what changed, what is still approximate, and any wiring blockers.

## Recommended execution order

1. Slice 1
2. Slice 2
3. Slice 3
4. Slice 4
5. Slice 5
6. Slice 6
7. Slice 7
8. Slice 8
9. Slice 9

## Practical conclusion

- We should proceed with the redesign integration.
- We should not ask the vibecoder to "replace the UI all at once".
- We should give one slice at a time from this plan.
- We already have the correct route architecture, so this is mainly a controlled UI translation problem, not a platform rewrite.
