# V3 Unified Action Model Plan

## Purpose
This document defines the product and implementation plan for unifying all pending work in the dashboard.

It exists to solve a real repo problem:

- `Today` currently aggregates only a subset of pending work
- `Escalations` is treated like a separate universe
- `tasks` and `escalation_requests` can overlap conceptually
- some newer flows still use local pending state outside the main UI model

The target rule is:

- every pending item has one canonical underlying record
- every pending item has one contextual home
- every pending item that needs user input appears on `Today`
- resolving an item anywhere resolves it everywhere

This plan is intentionally grounded in the repo as it exists today.

---

## 1. Audit: Current Action Sources

### Today page sources

Current Today surfaces are backed by three separate hooks:

- [usePendingApprovals.ts](C:/Users/Despot/Desktop/wedding/src/hooks/usePendingApprovals.ts)
- [useUnfiledInbox.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useUnfiledInbox.ts)
- [useTasks.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useTasks.ts)

These feed:

- [TodayPage.tsx](C:/Users/Despot/Desktop/wedding/src/pages/TodayPage.tsx)
- [TodayWorkspace.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/TodayWorkspace.tsx)
- [TodayContextList.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/TodayContextList.tsx)
- [ZenLobby.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/ZenLobby.tsx)

### Escalations source

Escalations are a separate UI surface backed only by:

- [EscalationsPage.tsx](C:/Users/Despot/Desktop/wedding/src/pages/EscalationsPage.tsx)

It reads:

- `escalation_requests`

The dock badge in:

- [NavigationDock.tsx](C:/Users/Despot/Desktop/wedding/src/components/Dock/NavigationDock.tsx)

also counts open `escalation_requests` directly.

### Current action-producing tables / state

The repo currently has multiple pending-work systems:

- `drafts`
  - pending approval artifacts
- `threads`
  - unfiled work when `wedding_id IS NULL`
- `tasks`
  - due-date operational work
- `escalation_requests`
  - blocked human-input work
- `threads.v3_operator_automation_hold`
  - thread-level suppression state linked to escalation
- `v3_thread_workflow_state`
  - proactive automation state, not a general inbox model
- local JSON/settings pending helpers
  - example: compliance asset pending collect

### Contextual homes already present in UI

The product already has domain/context surfaces that should own many actions:

- Inbox / thread views
- Pipeline / wedding views
- Wedding tabs:
  - timeline
  - by thread
  - tasks
  - files
  - financials
  - travel

Relevant files:

- [FourPaneLayout.tsx](C:/Users/Despot/Desktop/wedding/src/layouts/FourPaneLayout.tsx)
- [WeddingDetailTabContent.tsx](C:/Users/Despot/Desktop/wedding/src/components/wedding-detail/WeddingDetailTabContent.tsx)
- [PipelineWeddingContext.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/pipeline/PipelineWeddingContext.tsx)

---

## 2. Audit Findings: Where The Duplication Risk Is Real

### A. `tasks` vs `escalation_requests`

These are different in intent, but they can look similar in product behavior.

Current intended distinction:

- `tasks`
  - time-based operational work
  - reminders
  - checklist items
  - follow-up due by a date
- `escalation_requests`
  - blocked actions
  - missing approval/fact/policy
  - operator answer needed

Duplication risk appears when something is phrased as:

- waiting for reply
- need operator action
- unresolved item
- follow up on blocked thing

The repo already contains `Awaiting reply:` tasks via:

- [operatorAwaitingReplyTask.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/operatorAwaitingReplyTask.ts)

This is valid, but only after the blocked decision is settled or when the real work is time-based.

### B. Today vs Escalations

Today currently shows:

- drafts
- unfiled
- tasks

Escalations currently shows:

- open `escalation_requests`

So the same user can have:

- urgent human-input work on Escalations
- separate urgent action feed on Today

That is a product split, not a safe final model.

### C. Contextual home vs queue home

Today and Escalations are both acting like primary homes in places where they should be inbox/filter layers.

Examples:

- missing compliance asset belongs in wedding `Files`
- banking exception belongs in wedding `Financials`
- trust-repair belongs in the thread or wedding overview

But those items are currently more likely to be thought of as “escalations” than as contextual wedding work.

### D. Local pending state outside canonical action model

Recent slices introduced narrow pending helpers for operational correctness.

Example:

- compliance asset missing collect / WhatsApp pending collection

This was acceptable as a narrow implementation step, but it must not remain the long-term action model if the item is supposed to appear on Today and be resolvable from Files, Today, or WhatsApp.

---

## 3. Canonical Product Rules

### Rule 1: `Today` is the unified inbox

`Today` must list every open item that currently needs user input or operator action.

This includes:

- pending approvals
- unfiled linking work
- due tasks
- open escalations
- missing compliance asset collection
- future file/rights/banking actions that need user input

### Rule 2: Every action has a contextual home

Each item should belong somewhere specific:

- thread
- wedding overview
- files
- financials
- travel
- inbox
- fallback operator queue

### Rule 3: Escalations page is not the canonical home of work

`Escalations` should become:

- operator filter
- specialty queue
- audit lens
- debugging/operations surface

It should not be the conceptual owner of the action.

### Rule 4: Resolve anywhere, close everywhere

If an action is resolved from:

- Today
- wedding Files
- wedding Financials
- thread view
- WhatsApp ingestion
- manual operator flow

the same underlying item must become resolved across all surfaces.

### Rule 5: `tasks` and `escalation_requests` both stay, but with strict semantics

#### `tasks`
Use only for:

- time-based work
- reminders
- checklists
- due-date follow-up

#### `escalation_requests`
Use only for:

- blocked human-input work
- missing policy/fact/approval
- operator decision or exception handling

Do not duplicate the same unresolved issue in both tables unless there is a deliberate lifecycle handoff.

---

## 4. Regrouped Action Taxonomy

### A. Approval actions

- Source: `drafts`
- Action type: `draft_approval`
- Canonical home: Inbox / thread
- Show on Today: yes
- Show on Escalations: no

### B. Inbox filing actions

- Source: `threads` with `wedding_id IS NULL`
- Action type: `unfiled_thread`
- Canonical home: Inbox
- Show on Today: yes
- Show on Escalations: no

### C. Operational due work

- Source: `tasks`
- Action type: `task_due`
- Canonical home: wedding/task/thread depending on metadata
- Show on Today: yes when due or overdue
- Show on Escalations: no

### D. Blocked operator decisions

- Source: `escalation_requests`
- Action type: `operator_escalation`
- Canonical home: contextual domain based on `action_key` / `reason_code`
- Show on Today: yes when `status = open`
- Show on Escalations: yes

### E. File / compliance collection

- Source: should be represented by a canonical open action, not just local pending state
- Action type: `missing_compliance_asset`
- Canonical home: wedding `Files`
- Show on Today: yes while unresolved
- Show on Escalations: yes if still modeled as blocked human-input work

### F. Finance / banking exception handling

- Source: `escalation_requests`
- Action type: `banking_or_financial_exception`
- Canonical home: wedding `Financials`
- Show on Today: yes while open
- Show on Escalations: yes

### G. Rights / publication / PR

- Source: `escalation_requests`
- Action type: `publication_rights_review`
- Canonical home: wedding overview or future publication domain
- Show on Today: yes while open
- Show on Escalations: yes

### H. Trust-repair / contradiction / sensitive operator review

- Source: `escalation_requests`
- Action type: `trust_repair_review`
- Canonical home: thread or wedding overview
- Show on Today: yes while open
- Show on Escalations: yes

---

## 5. Canonical Home Mapping

| Action type | Canonical home | Today | Escalations |
|---|---|---|---|
| `draft_approval` | Inbox / thread | yes | no |
| `unfiled_thread` | Inbox | yes | no |
| `task_due` | wedding or thread task context | yes | no |
| `missing_compliance_asset` | Wedding > Files | yes | maybe |
| `banking_or_financial_exception` | Wedding > Financials | yes | yes |
| `sensitive_document_review` | Wedding > Files or secure doc context | yes | yes |
| `trust_repair_review` | Thread or wedding overview | yes | yes |
| `publication_rights_review` | Wedding/domain context | yes | yes |
| `operator_fallback` | Escalations/operator queue only when no better context exists | yes if actionable | yes |

Rule:

- if a contextual home exists, use it
- Escalations is a lens, not the owner

---

## 6. Implementation Strategy

### Stage 1. Audit and taxonomy lock

Deliverables:

- this document
- explicit distinction between `tasks` and `escalation_requests`
- canonical-home mapping

Status:

- current stage

### Stage 2. Unified Today read model

Build a read-model/aggregation layer over existing sources:

- `drafts`
- `threads` (unfiled)
- `tasks`
- `escalation_requests`

Do not rewrite storage first.

Minimum normalized fields:

- `action_type`
- `source_table`
- `source_id`
- `title`
- `subtitle`
- `status_label`
- `canonical_home_type`
- `canonical_home_id`
- `today_visible`
- `needs_user_input`
- `created_at`
- `due_at`
- `route_to`

### Stage 3. Add escalations to Today

Today must include open escalations that need human input.

This is the first visible merge:

- Today stops being `drafts/unfiled/tasks only`
- Today becomes the real cross-system action inbox

### Stage 4. Contextual action panels

Add open action panels/counts to contextual homes:

- Inbox / thread
- Wedding overview
- Files
- Financials
- Travel

### Stage 5. Shared resolution semantics

Every action must resolve through one underlying record:

- resolve from Today
- resolve from contextual home
- resolve from WhatsApp ingestion

All should close the same action everywhere.

### Stage 6. Reframe Escalations page

Keep Escalations, but reposition it as:

- queue/filter
- specialty views
- operator audit surface

not the primary ownership model.

### Stage 7. Remove hidden pending-state shortcuts

Migrate local pending helpers into canonical action behavior.

Example:

- compliance asset pending collect must align with Today/contextual action state

---

## 7. Immediate Duplicate-Risk Conclusions

### Keep `tasks`

They are still valid and needed for due-date work.

### Keep `escalation_requests`

They are still valid and needed for blocked human-input work.

### Do not merge the tables yet

The immediate problem is not storage duplication first.
The immediate problem is UI and product-model duplication.

### Merge the read model first

The first fix is:

- one unified action feed
- one canonical-home mapping
- one shared resolution model

This is safer than replacing both tables with one new write table.

---

## 8. Success Criteria

This plan is successful when:

- Today lists all open items needing user input
- contextual pages show the same work in the right place
- Escalations becomes a filtered operator lens, not a separate work universe
- `tasks` remain time-based
- `escalation_requests` remain blocked-input-based
- no unresolved issue silently survives in hidden local state after being resolved elsewhere

---

## 9. Current Status

As of April 2026:

- the repo has all the raw pieces needed for this direction
- the action model is still fragmented
- this plan supersedes page-first escalation thinking
- future operator/document/compliance/UI slices should reference this document before adding new pending-work flows
