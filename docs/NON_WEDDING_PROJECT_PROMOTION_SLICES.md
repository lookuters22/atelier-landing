# NON-WEDDING PROJECT PROMOTION SLICES

## Purpose

This plan exists to stop non-wedding customer leads from being treated as second-class, thread-only fallback cases.

The product is still **mostly wedding-first in practice**, but it is **not wedding-only**.
Studios can accept other work based on:

- onboarding
- `studio_business_profiles`
- playbook rules
- studio operating rules

So the system must treat:

- wedding leads as first-class projects
- non-wedding **in-scope customer leads** as first-class projects
- non-client human outreach as thread-scoped operator work

This file is the execution plan for getting there in slices without losing repo context.

## Source Of Truth

Read these before implementing any slice:

- [ARCHITECTURE.md](/C:/Users/Despot/Desktop/wedding/docs/ARCHITECTURE.md)
- [DATABASE_SCHEMA.md](/C:/Users/Despot/Desktop/wedding/docs/DATABASE_SCHEMA.md)
- [v3/ARCHITECTURE.md](/C:/Users/Despot/Desktop/wedding/docs/v3/ARCHITECTURE.md)
- [v3/DATABASE_SCHEMA.md](/C:/Users/Despot/Desktop/wedding/docs/v3/DATABASE_SCHEMA.md)
- [v3/INBOUND_SUPPRESSION_NON_CLIENT_MAIL.md](/C:/Users/Despot/Desktop/wedding/docs/v3/INBOUND_SUPPRESSION_NON_CLIENT_MAIL.md)
- [database.types.ts](/C:/Users/Despot/Desktop/wedding/src/types/database.types.ts)
- [decisionContext.types.ts](/C:/Users/Despot/Desktop/wedding/src/types/decisionContext.types.ts)

## Current Repo Truth

These are the important constraints Composer must not forget:

### 0. Business scope authority already exists

Do **not** invent a second business-scope configuration system.

The repo already has studio-scope authority in the right places:

- `studio_business_profiles.service_types`
- `studio_business_profiles.core_services`
- `studio_business_profiles.lead_acceptance_rules`
- onboarding-owned `playbook_rules`

Relevant anchors:

- [nonWeddingInquiryProfileFit.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/nonWeddingInquiryProfileFit.ts)
- [20260430193000_studio_business_profiles.sql](/C:/Users/Despot/Desktop/wedding/supabase/migrations/20260430193000_studio_business_profiles.sql)
- [20260506000000_finalize_onboarding_briefing_v1_geography_guard.sql](/C:/Users/Despot/Desktop/wedding/supabase/migrations/20260506000000_finalize_onboarding_briefing_v1_geography_guard.sql)

This means:

- existing studios already declare what kinds of work they do
- existing onboarding already writes both business profile truth and onboarding-owned playbook rows
- `project_type` must be a **per-project classification field**, not a new parallel source of truth for studio capabilities

Rule for implementation:

- use existing onboarding/profile/playbook data to decide whether a lead is in scope
- infer and store `project_type` on the promoted project row
- do **not** add new onboarding fields just to support this slice
- do **not** assume older tenants are wedding-only if their stored profile/rules already say otherwise

### 1. The first-class managed object is still `weddings`

Today the repo's first-class project object is the `weddings` table.
That is a naming mismatch, not proof that the product should remain wedding-only.

Important fields are still wedding-coded:

- `couple_names`
- `wedding_date`
- `threads.wedding_id`
- `clients.wedding_id`

But the lifecycle itself is already generic:

- `stage` uses the generic `project_stage` flow
- downstream specialists and pipeline logic are keyed to `weddingId`, but functionally behave like project-scoped workflows

### 2. Only wedding intake currently bootstraps a first-class project

Important file:

- [bootstrapInquiryWeddingForCanonicalThread.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/resolvers/bootstrapInquiryWeddingForCanonicalThread.ts)

Today this is the only project/materialization bootstrap path.
It runs when the system treats an inbound as wedding intake.

That means:

- wedding lead -> project row exists
- non-wedding customer lead -> often stays thread-scoped

That is the structural gap this plan fixes.

### 3. Triage and sender-role are different layers

Important files:

- [triage.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/agents/triage.ts)
- [processInboxThreadRequiresTriage.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)
- [nonWeddingBusinessInquiryPolicy.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/nonWeddingBusinessInquiryPolicy.ts)
- [nonWeddingBusinessInquiryRouter.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/nonWeddingBusinessInquiryRouter.ts)
- [inboundSenderRoleClassifier.ts](/C:/Users/Despot/Desktop/wedding/src/lib/inboundSenderRoleClassifier.ts)

Keep this distinction:

- `dispatchIntent` answers workflow-ish questions like `intake`, `commercial`, `concierge`, etc.
- `senderRole` answers who is writing and why:
  - `customer_lead`
  - `vendor_solicitation`
  - `partnership_or_collaboration`
  - `billing_or_account_followup`
  - `recruiter_or_job_outreach`
  - `unclear`

Do not collapse those back together.

### 4. Two important routing fixes already exist

These are prerequisites and should be preserved:

- additive post-ingest suppression gate for obvious promo/system mail
- sender-role classification for human-written non-client mail

This plan assumes those are already in place and **must remain intact**.

## Correct Product Model

Use this as the behavioral target.

### First-class project creation

A real customer lead should become a first-class managed project if it is in scope for the studio.

That applies to:

- weddings
- portraits
- family sessions
- commercial shoots
- editorials
- brand content
- other configured services

### Thread-scoped operator work only

These should **not** bootstrap projects by default:

- vendor / agency solicitation
- partnership / collaboration outreach
- billing or account follow-up on an unlinked thread
- recruiter / job outreach
- unclear human outreach

### Authority model

Promotion from inbound thread to first-class project should be gated by all of:

1. sender-role says this is a `customer_lead`
2. profile / studio fit says the work is in scope
3. playbook rules do not forbid the workflow

No single signal should create a project on its own.

Important clarification:

- `project_type` is **not** the authority for what the studio offers
- it is the stored type of a specific project row after the authority checks above pass
- studio offering truth remains onboarding + `studio_business_profiles` + playbook rules

## Explicit Non-Goals For The Minimum Work

Do not do these in the first structural pass:

- rename `weddings` to `projects`
- rename `couple_names` or `wedding_date`
- create a parallel `projects` or `non_wedding_projects` table
- redesign Pipeline or Inbox UI in the same pass
- change `TriageIntent`
- remove the existing wedding intake/bootstrap path
- weaken promo suppression or sender-role safeguards
- add a second onboarding or settings schema for service-scope truth

## Slice Overview

Implement in this order.
Do not merge slices together unless the later slice is blocked by the earlier one.

### Slice 0: Planning And Guardrails

Goal:

- lock the architecture and acceptance criteria in writing before schema/routing changes

Deliverables:

- this plan file
- explicit list of files/systems touched per slice
- explicit non-goals

Acceptance:

- future Composer chats can use this file as the context anchor

### Slice 1: Schema Foundation

Goal:

- make the first-class project row type-aware without changing behavior
- add row-level project typing without introducing a second business-scope authority

Required changes:

- add `project_type` to `weddings`
- default existing and new rows to `wedding`
- add an enum or check constraint for the allowed values
- regenerate [database.types.ts](/C:/Users/Despot/Desktop/wedding/src/types/database.types.ts)

Suggested starting set:

- `wedding`
- `portrait`
- `commercial`
- `family`
- `editorial`
- `brand_content`
- `other`

Files likely involved:

- `supabase/migrations/<timestamp>_add_project_type_to_weddings.sql`
- [database.types.ts](/C:/Users/Despot/Desktop/wedding/src/types/database.types.ts)
- possibly schema docs if this repo updates docs alongside migrations

Acceptance:

- existing rows backfill to `wedding`
- existing wedding flows are unchanged
- generated types expose `project_type`
- no new onboarding/profile configuration is introduced in this slice

Do not:

- rename tables or columns
- change routing yet

### Slice 2: Bootstrap Generalization

Goal:

- make the existing inquiry bootstrap capable of creating non-wedding first-class projects

Required changes:

- extend [bootstrapInquiryWeddingForCanonicalThread.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/resolvers/bootstrapInquiryWeddingForCanonicalThread.ts) to accept `projectType`
- optionally introduce a clearer internal/exported name like `bootstrapInquiryProjectForCanonicalThread`
- preserve backward compatibility for existing wedding callers

Behavior:

- wedding path still writes `project_type = 'wedding'`
- non-wedding callers can write a different `project_type`
- `stage` stays `inquiry`
- thread linking still uses `threads.wedding_id`

Files likely involved:

- [bootstrapInquiryWeddingForCanonicalThread.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/resolvers/bootstrapInquiryWeddingForCanonicalThread.ts)
- any resolver tests covering inquiry bootstrap

Acceptance:

- existing wedding bootstrap still works unchanged
- bootstrap can now create a first-class row with a non-wedding `project_type`

Do not:

- add promotion logic yet
- change operator escalation behavior yet

### Slice 3: Customer-Lead Promotion In Non-Wedding Routing

Goal:

- allow in-scope non-wedding customer leads to become first-class projects instead of thread-only fallback cases

Required changes:

- add a new terminal policy decision in [nonWeddingBusinessInquiryPolicy.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/nonWeddingBusinessInquiryPolicy.ts)
- route that decision in [nonWeddingBusinessInquiryRouter.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/nonWeddingBusinessInquiryRouter.ts)
- thread metadata through [processInboxThreadRequiresTriage.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)
- persist audit metadata in [emailIngressClassification.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/emailIngressClassification.ts)

Suggested decision naming:

- `decision: allowed_promote_to_project`
- `reasonCode: CUSTOMER_LEAD_PROMOTE_TO_PROJECT`
- `decisionSource: customer_lead_promote_to_project`

Promotion gate:

Only promote when all are true:

1. `senderRole === "customer_lead"` with medium/high confidence
2. profile fit is `fit`
3. no explicit forbidden playbook rule blocks the flow

Everything else stays on current safe paths:

- vendor/partnership/billing/recruiter -> operator review only
- unclear -> existing conservative logic
- customer lead but forbidden/unfit -> existing decline/escalation logic

Project type inference:

Keep it deterministic and small in v1.
Do not over-engineer.
Use existing business-scope truth as input, not a new config source.

Suggested v1 mapping:

- `commercial` -> `commercial`
- `concierge` + portrait/family/session signals -> `portrait` or `family`
- fallback -> `other`

Acceptance:

- real non-wedding customer lead creates a first-class row in `weddings`
- `threads.wedding_id` links to that row
- existing wedding flow remains intact
- non-client human mail still does **not** create a project

Do not:

- change triage prompt vocabulary
- create new tables
- create new onboarding/business-scope inputs

### Slice 4: Reuse Existing Inquiry / Project Lifecycle

Goal:

- after promotion, hand off into the existing project-scoped pipeline instead of inventing a separate non-wedding sub-system

Required changes:

- reuse the existing inquiry/intake-style downstream path once the thread is linked
- ensure the promoted project behaves like an inquiry-stage project in the existing orchestrator flow

Files likely involved:

- [processInboxThreadRequiresTriage.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)
- bootstrap resolver
- whichever existing event or resolver the intake-linked flow already uses

Acceptance:

- non-wedding customer leads stop living only as drafted inbox threads
- they enter the same first-class lifecycle object that weddings use

Do not:

- fork the orchestrator into a separate non-wedding orchestration stack

### Slice 5: UI Follow-Up

Goal:

- make the dashboard reflect mixed project types without pretending everything is a wedding

This slice is intentionally **after** the backend structural work.

Likely work:

- Pipeline grouping/filtering by `project_type`
- safer labels when `project_type !== 'wedding'`
- fewer wedding-native labels in mixed project views

Not required to unlock the backend promotion behavior.

## Files Composer Will Likely Need

### Routing / triage / bootstrap

- [processInboxThreadRequiresTriage.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/processInboxThreadRequiresTriage.ts)
- [emailIngressClassification.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/emailIngressClassification.ts)
- [nonWeddingBusinessInquiryPolicy.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/nonWeddingBusinessInquiryPolicy.ts)
- [nonWeddingBusinessInquiryRouter.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/nonWeddingBusinessInquiryRouter.ts)
- [nonWeddingInquiryProfileFit.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/nonWeddingInquiryProfileFit.ts)
- [bootstrapInquiryWeddingForCanonicalThread.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/resolvers/bootstrapInquiryWeddingForCanonicalThread.ts)
- [createIntakeLeadRecords.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/resolvers/createIntakeLeadRecords.ts)
- [linkOriginThreadToIntakeWedding.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/resolvers/linkOriginThreadToIntakeWedding.ts)

### Existing sender-role / suppression prerequisites

- [inboundSenderRoleClassifier.ts](/C:/Users/Despot/Desktop/wedding/src/lib/inboundSenderRoleClassifier.ts)
- [postIngestSuppressionGate.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/postIngestSuppressionGate.ts)
- [preLlmEmailRouting.ts](/C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/triage/preLlmEmailRouting.ts)

### Schema / types

- [database.types.ts](/C:/Users/Despot/Desktop/wedding/src/types/database.types.ts)
- [decisionContext.types.ts](/C:/Users/Despot/Desktop/wedding/src/types/decisionContext.types.ts)
- `supabase/migrations/*`

## Testing Strategy

Each slice should land with tests before moving to the next one.

### Slice 1 tests

- migration applies cleanly
- existing wedding rows read as `project_type = wedding`
- generated types match schema

### Slice 2 tests

- wedding bootstrap still creates `project_type = wedding`
- generalized bootstrap can create `project_type = commercial` or `other`

### Slice 3 tests

- `customer_lead` + fit + allowed path -> project bootstrap occurs
- vendor solicitation -> no project
- partnership -> no project
- billing/account follow-up -> no project
- recruiter -> no project
- customer lead + forbidden rule -> no project
- rerun/idempotency -> no duplicate projects

### Slice 4 tests

- promoted non-wedding customer lead follows the existing linked-project flow
- existing wedding inquiry flow remains unchanged

## Rollout Notes

Recommended rollout order:

1. land Slice 1
2. verify no behavior change
3. land Slice 2
4. verify existing wedding bootstrap still works
5. land Slice 3 behind conservative logic if needed
6. land Slice 4 only after Slice 3 is stable
7. do UI follow-up afterward

## Composer Instructions

If you are Composer picking up this work:

1. Read the source-of-truth docs at the top of this file first.
2. Preserve existing suppression and sender-role safeguards.
3. Do not widen scope into Inbox redesign, copy tuning, or pipeline polish in the same PR unless explicitly asked.
4. Implement one slice at a time.
5. After each slice, report:
   - exact files changed
   - tests run
   - what was intentionally deferred

## Decision Summary

We are choosing:

- additive extension of `weddings` into a typed first-class project object
- sender-role-gated promotion of in-scope non-wedding customer leads
- reuse of the existing project lifecycle
- reuse of existing onboarding/profile/playbook truth as the business-scope authority

We are explicitly not choosing:

- a parallel non-wedding project system
- a schema rename in the first pass
- UI-first workaround logic
- a second configuration system for what the studio offers
