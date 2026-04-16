# ONBOARDING BRIEFING SLICE 04: AUTHORITY AND THE VAULT

## Goal

Implement the high-stakes sections that define what Ana may do, draft, ask about, or never do.

This slice is where onboarding becomes operationally meaningful.

## Sections In Scope

### 1. Approval Philosophy

Render one scenario row at a time with four explicit chips:

- `Ana handles it`
- `Ana drafts it`
- `Ana asks me`
- `Never do this`

These map directly to:

- `auto`
- `draft_only`
- `ask_first`
- `forbidden`

### 2. The Vault

This section handles high-risk policy families:

- discounts
- invoice handling
- payment exceptions
- late payment extensions
- RAW files
- publication permission
- planner coordination
- vendor credit requests
- artistic feedback responses
- private client data sharing
- proactive follow-up boundaries
- escalation preferences

## Canonical Action Keys For This Slice

Use this v1 set only:

- `schedule_call`
- `move_call`
- `discount_quote`
- `send_invoice`
- `payment_plan_exception`
- `late_payment_extension`
- `release_raw_files`
- `publication_permission`
- `planner_coordination`
- `vendor_credit_request`
- `respond_to_art_feedback`
- `share_private_client_data`
- `proactive_followup`

Escalation preferences still map through:

- `operator_notification_routing`

## UI Rules

- group rows by category; do not present one endless flat list
- one row = one explicit decision
- optional `Why?` note field may expand under a row if needed
- the note is supporting nuance, not the main source of truth

### Visual shift for Vault

The Vault may use a slightly more serious visual treatment, but keep it restrained:

- denser copy
- fewer questions per screen
- stronger emphasis on consequences

Do not turn it into a dark-mode gimmick.

## Mapping Rules

### Approval matrix rows

Map to:

- `payload.scheduling_action_permission_matrix` where applicable
- `payload.playbook_seeds` for the other action families

### Escalation preferences

Map to:

- `payload.escalation_preferences`

### High-stakes notes

If a note is reusable studio-wide, it may later become:

- playbook instruction text
- knowledge seed

But do not treat every note as runtime-ready prose automatically.

## Explicitly Deferred

Do **not** add the unresolved inquiry-progression family here.

Still deferred:

- consultation-first normalization
- brochure-first normalization
- budget-gap communication preference normalization

## Recommended Files

- step components for `authority` and `vault`
- small mapper from chip choice -> `decision_mode`
- action vocabulary constants shared between UI and mapping

## Do Not

- do not invent new action keys inside component files
- do not store these decisions only as prose notes
- do not let the UI bypass the canonical `decision_mode` mapping

## Done Means

- users can define the autonomy matrix
- users can define the vault scenarios
- snapshot data captures these choices in a way the finalizer can turn into `playbook_rules`
