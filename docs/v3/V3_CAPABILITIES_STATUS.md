# V3 Capabilities Status

## Purpose
This document answers a simple question:

What does V3 currently do, exactly how does it do it, what has been proven, and what is still incomplete?

It is a status document, not a target-state fantasy. It reflects the repo and the proof work completed so far.

## Summary
V3 is no longer just an idea. The core orchestrator path is real and proven in important ways:
- live routing works on the intended known-wedding branches
- persona rewrite works
- real approval and outbound flow works
- authoritative CRM grounding works
- grounded commercial confirmations work
- unsupported commercial commitments are deterministically blocked by the output auditor

What is still incomplete is mostly around:
- audience/RBAC safety
- operator WhatsApp completion
- automation pause/state control
- memory quality and hygiene
- broader replay proof across real conversation stress tests
- unified action-model UI mapping (`Today` vs contextual homes vs `Escalations`)

---

## 1. Live Known-Wedding Routing

## What V3 Does
V3 routes known-wedding email/web traffic from ingress through triage into the orchestrator path:
- `comms/email.received`
- `triage`
- `ai/orchestrator.client.v1`

This replaces the legacy specialist worker path on the live gated branches.

## How It Does It
- triage checks live cutover env gates
- triage dispatches `ai/orchestrator.client.v1` with `requestedExecutionMode: "draft_only"` for the live known-wedding branches

## Main Code
- [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts)
- [clientOrchestratorV1.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/clientOrchestratorV1.ts)

## Proven
- yes

## Notes
- this is proven by Inngest traces and harness reports showing live orchestrator dispatch on active CUT branches

---

## 2. Policy-Aware Decision Context

## What V3 Does
V3 builds a tenant-scoped decision context before reasoning.

## How It Does It
Base context:
- `crmSnapshot`
- `recentMessages`
- `threadSummary`
- `memoryHeaders`

Decision-time additions:
- `audience`
- `candidateWeddingIds`
- `playbookRules`
- optional `selectedMemories`
- `threadDraftsSummary`

## Main Code
- [buildAgentContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildAgentContext.ts)
- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)

## Proven
- yes

## Notes
- tenant scoping is explicit and enforced
- deeper memory promotion exists architecturally but is still thinner than ideal operationally
- when `thread_participants.is_sender` is absent, `inboundSenderAuthority` may still resolve via exact normalized email on tenant-scoped `contact_points` for persons on the effective wedding (single match only; `source: wedding_contact_email`)
- **Authority policy Phase 2 (commercial AP1):** commitment-level commercial language (discounts, waivers, contract/payment-term changes, etc.) requires `client_primary` or `payer` for the routine commercial allow-path; `planner` is not equivalent. A narrow deterministic “planner coordination” pattern (billing visibility / CC / forward only, no commitment shape) still allows `planner` alongside client/payer — see `detectAuthorityPolicyRisk.ts`.
- **Authority policy Phase 3 (binding approval AP1):** binding approval/authorization language is matched conservatively (`matchesBindingApprovalAuthorizationShape`); only `isApprovalContact`, `client_primary`, and `payer` pass without escalation — planners and other roles do not automatically bind. Implementation: `detectAuthorityPolicyRisk.ts`.

---

## 3. Deterministic Candidate Action Proposals

## What V3 Does
Instead of directly free-writing business logic, V3 proposes structured candidate actions.

## Candidate Families
- `send_message`
- `schedule_call`
- `move_call`
- `share_document`
- `update_crm`
- `operator_notification_routing`

## How It Does It
The proposals are shaped from:
- requested execution mode
- playbook rules
- audience state
- message content
- thread draft state
- CRM pause hints

## Main Code
- [proposeClientOrchestratorCandidateActions.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/proposeClientOrchestratorCandidateActions.ts)
- [complianceAssetLibraryAttach.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/complianceAssetLibraryAttach.ts) (narrow COI / venue-portal attach hints; NDA/signature-shaped compliance stays on generic BC)
- [resolveComplianceAssetStorage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/resolveComplianceAssetStorage.ts) (tenant bucket + exact object path + `found` via Storage download check; optional `photographers.settings.v3_compliance_asset_overrides`; signed URLs only via `createComplianceAssetSignedUrlForOperator`, not on proposals; `getComplianceAssetStorageTarget`, `uploadComplianceAssetToLibrary` for inbound capture)
- [complianceAssetMissingCapture.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/complianceAssetMissingCapture.ts) (when `found === false`, operator action `v3_compliance_asset_library_missing_collect` + deterministic WhatsApp request copy for photographer — no automated WhatsApp send)
- Storage bucket migration: [`20260415120000_compliance_asset_library_storage.sql`](C:/Users/Despot/Desktop/wedding/supabase/migrations/20260415120000_compliance_asset_library_storage.sql)

## Proven
- yes

## Notes
- this layer is deterministic and intentionally narrow
- recurring **compliance_document_request** threads that match attachable insurance / venue-portal patterns propose **`v3_compliance_asset_library_attach`** with **`compliance_asset_library_key`** (`public_liability_coi` | `venue_security_compliance_packet`); payment-rail BC and NDA/DocuSign mixes keep **`v3_banking_compliance_exception`**
- **`executeClientOrchestratorV1Core`** enriches proposals with **`compliance_asset_resolution`** (`storage_bucket`, `object_path`, `found`) against bucket **`compliance_asset_library`** (default paths `{photographer_id}/{fixed_filename}.pdf`); if **`found === false`**, the operator row is remapped to **`v3_compliance_asset_library_missing_collect`** with deterministic photographer WhatsApp copy; blocked send gains blocker `compliance_asset_missing_in_storage_v3`; no DAM, no signed URLs on logged proposal payloads, no real WhatsApp transport

---

## 3A. Current Action Surface Fragmentation

## What V3 Does
The product already has multiple pending-work systems:

- drafts awaiting approval
- unfiled threads
- tasks
- escalations
- newer local pending-state helpers

## How It Does It
These are currently surfaced through separate UI and storage paths:

- Today reads drafts/unfiled/tasks
- Escalations reads `escalation_requests`
- contextual wedding homes exist, but are not yet the canonical ownership model for all action types

## Main Code
- [ZenLobby.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/ZenLobby.tsx)
- [TodayWorkspace.tsx](C:/Users/Despot/Desktop/wedding/src/components/modes/today/TodayWorkspace.tsx)
- [EscalationsPage.tsx](C:/Users/Despot/Desktop/wedding/src/pages/EscalationsPage.tsx)
- [V3_UNIFIED_ACTION_MODEL_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_UNIFIED_ACTION_MODEL_PLAN.md)

## Proven
- yes, as current repo truth

## Notes
- this is now explicitly recognized as a product-model gap
- the intended direction is:
  - `Today` = unified inbox of all open items needing user input
  - contextual screens = canonical home of the work
  - `Escalations` = operator queue/filter lens, not the canonical home
- `tasks` and `escalation_requests` are both still valid, but with different semantics:
  - `tasks` = time-based work
  - `escalation_requests` = blocked human-input work

---

## 4. Draft-Only Decision Mode

## What V3 Does
On the active live known-wedding branches, V3 currently runs in `draft_only`.

## How It Does It
- triage sets `requestedExecutionMode: "draft_only"`
- orchestrator maps outcome to draft creation, not auto-send

## Main Code
- [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts)
- [clientOrchestratorV1Core.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/clientOrchestratorV1Core.ts)

## Proven
- yes

## Notes
- this is by design in the current live CUT posture

---

## 5. Real Draft Creation And Real Approval/Outbound Flow

## What V3 Does
V3 creates real drafts and uses the real approval and outbound worker path.

## How It Does It
- orchestrator inserts a `drafts` row
- approval flow emits `approval/draft.approved`
- outbound worker claims and sends the draft
- outbound is persisted as a real system send

## Main Code
- [attemptOrchestratorDraft.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/attemptOrchestratorDraft.ts)
- [api-resolve-draft/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/api-resolve-draft/index.ts)
- [outbound.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/outbound.ts)

## Proven
- yes

## Notes
- earlier harness bypass behavior was fixed; current proof uses the real approval event path

---

## 6. Persona Rewrite Of Orchestrator Drafts

## What V3 Does
After draft creation, V3 can replace the deterministic orchestrator stub with real client-facing prose.

## How It Does It
- orchestrator creates draft
- post-draft rewrite calls persona writer
- resulting body is written back to the draft

## Main Code
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)
- [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts)

## Proven
- yes

## Notes
- this replaced the earlier unconditional QA stub-only behavior

---

## 7. Authoritative CRM Grounding

## What V3 Does
V3 can ground replies on authoritative CRM values such as:
- couple names
- wedding date
- location
- stage
- package name
- contract value

## How It Does It
- `crmSnapshot` is loaded from `weddings`
- authoritative CRM block is injected into writer facts
- writer prompt tells the model to treat that block as verified truth

## Main Code
- [buildAgentContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildAgentContext.ts)
- [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts)
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)

## Proven
- yes

## Notes
- this is why replies followed December when CRM said December, even when scenario text casually said June

---

## 8. Compact Continuity Grounding

## What V3 Does
V3 can pass compact continuity into the writer:
- thread summary
- a bounded recent transcript excerpt

## How It Does It
- thread summary and recent messages are formatted into a compact continuity block
- writer is instructed to use continuity for thread awareness, not to override CRM or playbook

## Main Code
- [buildPersonaRawFacts.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildPersonaRawFacts.ts)
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)

## Proven
- partially

## Notes
- continuity is wired in
- the actual lift from continuity vs no continuity is not fully proven yet

---

## 9. Playbook-Grounded Commercial Confirmations

## What V3 Does
V3 can confidently confirm commercial terms when they are grounded in the actual runtime policy layer.

## Example Proven
- `Elite collection`
- `30% retainer`
- `50 miles of Florence engagement travel`

## How It Does It
- those facts are seeded into `playbook_rules`
- decision context loads active playbook rules
- writer facts include verified playbook excerpts
- writer confirms only what is grounded

## Main Code
- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)

## Proven
- yes

## Notes
- proved with the verified-package happy path

---

## 10. Ungrounded Package Guardrails

## What V3 Does
V3 can avoid treating a client-invented package name as a real studio offering when it is not grounded.

## How It Does It
- writer facts include explicit package/product guardrails
- writer prompt forbids confirming package names not present in verified context

## Main Code
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)
- [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts)

## Proven
- yes

## Notes
- in the ungrounded case, the system pivots to neutral wording rather than confirming the fake SKU

---

## 11. Deterministic Commercial Output Auditor

## What V3 Does
V3 deterministically audits what the writer is actually committing the business to in commercial replies.

## Audited Terms
- package names
- deposit percentage
- travel miles included

## How It Does It
- writer returns structured output:
  - `email_draft`
  - `committed_terms`
- auditor validates those terms against grounded context

## Main Code
- [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts)
- [auditDraftCommercialTerms.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/auditDraftCommercialTerms.ts)

## Proven
- yes

## Notes
- proven both with deterministic/in-process tests and live deployed path

---

## 12. Live Rejection Path For Unsupported Commercial Commitments

## What V3 Does
When the auditor finds unsupported commercial commitments, V3 rejects the persona draft and escalates.

## How It Does It
- persona prose is not accepted
- draft body is replaced with deterministic stub-safe content
- escalation row is created
- operator escalation event is emitted

## Main Code
- [maybeRewriteOrchestratorDraftWithPersona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)
- [recordV3OutputAuditorEscalation.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/orchestrator/recordV3OutputAuditorEscalation.ts)

## Proven
- yes

## Notes
- the live rejection path was proven with the fault-injection proof slice, then the test hook was scheduled for cleanup

---

## 13. Narrow Writer Boundary

## What V3 Does
The writer is not the decision-maker.

## Writer Responsibilities
- adopt persona/tone
- draft client-facing prose
- return structured committed terms

## Writer Does Not Do
- action classification
- escalation decision
- permissioning
- unrestricted memory reasoning

## Main Code
- [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts)

## Proven
- yes

## Notes
- this boundary has held across the latest slices

---

## 14. Separation Of Playbook, Case Memory, And CRM

## What V3 Does
It distinguishes:
- playbook rules as reusable verified policy
- case memory as local truth or learning signal
- CRM as canonical record

## How It Does It
- playbook loads from `playbook_rules`
- learning and case-specific facts land in `memories`
- CRM comes from `weddings`

## Main Code
- [buildDecisionContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/context/buildDecisionContext.ts)
- [captureDraftLearningInput.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/captureDraftLearningInput.ts)
- [buildAgentContext.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/memory/buildAgentContext.ts)

## Proven
- yes

## Notes
- one major proof here was discovering that settings blobs are not the real runtime grounding layer

---

## 15. Context-Layer Evaluation Harness

## What V3 Does
There is now a harness that compares grounding conditions across:
- CRM only
- CRM + playbook
- CRM + playbook + case memory
- CRM + playbook + case memory + continuity
- missing-key-layer failure mode

## Main Code
- [v3_context_layer_eval_harness.ts](C:/Users/Despot/Desktop/wedding/scripts/v3_context_layer_eval_harness.ts)

## Proven
- yes

## Notes
- this proved that playbook is currently the strongest grounding layer
- case memory is secondary
- continuity is not fully proven
- CRM-only is not enough for safe commercial commitment behavior

---

## 16. Real Conversation Stress-Test Planning

## What V3 Does
V3 now has a documented real-thread stress-test plan based on eight actual wedding conversation stress cases.

## Main Docs
- [REAL_CONVERSATION_STRESS_TEST_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/REAL_CONVERSATION_STRESS_TEST_PLAN.md)
- [V3_STRESS_REPLAY_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_STRESS_REPLAY_PLAN.md)

## Proven
- planning only

## Notes
- the planning exists
- the full replay proof set is not complete yet

---

## What Is Proven Now
- live V3 routing on known-wedding branches
- policy-aware decision context assembly
- deterministic candidate action proposals
- draft-only orchestrator behavior
- real draft approval and outbound flow
- persona rewrite
- authoritative CRM grounding
- grounded commercial confirmations
- ungrounded package guardrails
- deterministic commercial output auditor
- live rejection path with fallback + escalation
- narrow writer boundary
- separation of playbook vs memories vs CRM
- context-layer evaluation harness

---

## What Is Not Yet Fully Complete
- audience/RBAC hardening for planner-private vs client-visible facts — **Stress Tests 7, 5, and 8** are proved at the classification/redaction/auditor layer via `npm run v3:proof-stress7-rbac-audience`, `npm run v3:proof-stress5-8-rbac-audience`, and optional live `npm run v3:proof-rbac-audience` (`reports/v3-rbac-audience-proof-*.md`); **hosted Inngest** ST7 three-class matrix (planner-only, client-visible, mixed): `npm run v3:proof-rbac-inngest-hosted` → `reports/v3-rbac-inngest-hosted-matrix-*.md` — with `ANTHROPIC_API_KEY` on Supabase + redeploy, the matrix report can evidence persona + `v3_output_auditor_*` steps on real drafts
- full two-way operator WhatsApp command-center flow
- durable silent hold/resume
- broad automation pause/state controls
- memory scoring, promotion, hygiene, and retrieval citations
- broader security hardening
- full stress-test replay across the real conversation set
- unified Today/contextual/escalation action model

---

## Current Best Description Of V3
V3 today is:
- a real live orchestrator path
- grounded by CRM and playbook
- capable of real persona drafting
- protected by a deterministic commercial auditor
- audience safety: Stress Tests 7 / 5 / 8 RBAC paths are proven offline; live DB harness covers eight shapes; optional **runtime E2E** (`npm run v3:proof-rbac-audience-e2e`) exercises `executeClientOrchestratorV1Core` with persona + leakage auditors on a Stress Test 7 mixed-audience seed; optional **hosted Inngest worker matrix** (`npm run v3:proof-rbac-inngest-hosted`) runs three ST7-shaped seeds (planner-only, client-visible, mixed) through the Event API and observes drafts/escalations/instruction_history from the deployed `clientOrchestratorV1` path; identity merge, triage-originated replay, and UI still pending
- not yet fully finished on operator completion, automation pause control, memory quality, or total replay coverage

## Related Roadmap Docs
- [V3_ROADMAP_MASTER.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_ROADMAP_MASTER.md)
- [V3_RBAC_AUDIENCE_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_RBAC_AUDIENCE_PLAN.md)
- [V3_OPERATOR_WHATSAPP_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_OPERATOR_WHATSAPP_PLAN.md)
- [V3_SECURITY_HARDENING_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_SECURITY_HARDENING_PLAN.md)
- [V3_AUTOMATION_PAUSE_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_AUTOMATION_PAUSE_PLAN.md)
- [V3_MEMORY_UPGRADE_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_MEMORY_UPGRADE_PLAN.md)
- [V3_UNIFIED_ACTION_MODEL_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_UNIFIED_ACTION_MODEL_PLAN.md)
