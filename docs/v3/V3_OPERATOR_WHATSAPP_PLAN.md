# V3 Operator WhatsApp Completion Plan

## Goal
Finish the two-way operator lane so blocked cases pause silently, notify the photographer, and resume only after explicit operator input.

## Why This Track Exists
Luxury-service behavior should not expose internal friction to the client. The client thread should hold silently while the operator resolves the question over WhatsApp.

## Phase 1
Silent Hold State

### Progress (implementation slices)
- **2026-04 — bounded near-match triage:** `insertBoundedUnresolvedMatchApprovalEscalation` now sets `threads.v3_operator_automation_hold` + `v3_operator_hold_escalation_id` on the **client email thread** when a `bounded_matchmaker_near_match` escalation is filed, so workflow/milestone/calendar automations that respect `isThreadV3OperatorHold` pause until dashboard/WhatsApp resolution (`resolveOperatorEscalationResolution` clears hold). Other escalation sources already set hold where applicable (e.g. V3 output auditor, STR).

### Objective
Persist an explicit suspension state when a thread escalates.

### Implement
- thread-level suspended/escalated state
- no client-facing “let me check with my team” hedge
- operator escalation artifact creation

### Proof
- blocked thread enters suspended state
- no outbound client message is sent automatically

## Phase 2
Operator Notification Delivery

### Objective
Make sure blocked cases become high-signal operator items.

### Implement
- WhatsApp operator notification event
- concise escalation payload
- clear escalation identifiers for resumption

### Proof
- escalation event emitted
- linked escalation record exists

## Phase 3
Operator Resolution Intake

### Objective
Allow the photographer’s reply to resolve the blocked case.

### Implement
- inbound operator message handling
- match reply to pending escalation
- structured resolution artifact

### Proof
- operator reply resolves the right escalation
- decision is stored in the correct layer

## Phase 4
Durable Resume Contract

### Objective
Resume the paused thread only through explicit operator resolution.

### Implement
- durable wait or explicit re-entry flow
- no auto-timeout into client-facing action

### Proof
- thread remains paused until resolved
- after resolution, the next artifact is generated correctly

## Phase 5
Learning / Writeback Boundary

### Objective
Decide whether the operator answer becomes playbook, case memory, or one-off resolution.

### Proof
- one-off answer stays case-specific
- reusable operator answer can be promoted deliberately

