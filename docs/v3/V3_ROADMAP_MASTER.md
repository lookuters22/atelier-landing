# V3 Roadmap Master

## Purpose
This is the master roadmap for finishing V3 from its current state to a production-ready, operator-safe luxury CRM runtime.

It consolidates the major remaining work into six tracks:

1. audience/RBAC hardening
2. operator WhatsApp completion
3. security hardening
4. real-conversation stress-test replay
5. automation pause/state controls
6. memory upgrade
7. unified action-model UI mapping

## Current Proven State
- live V3 routing works on the intended known-wedding branches
- persona rewrite works
- deterministic commercial output auditor is proven end to end
- grounded commercial happy path is proven
- unsupported commercial commitments can be blocked and escalated
- CRM grounding is working
- orchestrator **`executeClientOrchestratorV1Core`** enriches compliance attach proposals with **storage-backed** `compliance_asset_resolution` (bucket, exact object path, `found`); private bucket `compliance_asset_library` + optional `photographers.settings.v3_compliance_asset_overrides`; missing files surface **`v3_compliance_asset_library_missing_collect`** + WhatsApp request copy; **`uploadComplianceAssetToLibrary`** stores inbound bytes at the canonical path — automated WhatsApp send, inbound attachment routing, operator download UI, and email attach remain follow-on work
- Today, Escalations, tasks, and contextual wedding homes are now recognized as a fragmented action model that needs deliberate unification

## What Is Not Fully Complete Yet
- audience/RBAC beyond the **closed** `clientOrchestratorV1` + shared redaction path (other channels, optional verifier expansion — see [V3_RBAC_AUDIENCE_PHASE1_CLOSEOUT.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_RBAC_AUDIENCE_PHASE1_CLOSEOUT.md))
- two-way operator loop and durable silent hold
- broader security audit and hardening
- replay against real stress-test threads
- pause-state behavior across all automation
- stronger memory hygiene, ranking, and traceability
- unified Today/contextual/escalation action model

## Priority Order
### Phase 1
Audience / RBAC Hardening

Why first:
- highest-risk information leak
- smallest slice with major safety payoff
- needed before richer memory and deeper operator flows

Plan:
- [V3_RBAC_AUDIENCE_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_RBAC_AUDIENCE_PLAN.md)
- **Closeout (implementation slice for `clientOrchestratorV1`):** [V3_RBAC_AUDIENCE_PHASE1_CLOSEOUT.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_RBAC_AUDIENCE_PHASE1_CLOSEOUT.md)

### Phase 2
Operator WhatsApp Completion

Why second:
- unlocks silent-hold luxury behavior
- gives the system a clean human-resolution path
- necessary before broader replay on blocked scenarios

Plan:
- [V3_OPERATOR_WHATSAPP_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_OPERATOR_WHATSAPP_PLAN.md)

### Phase 3
Security Hardening

Why third:
- operator lane and richer memory increase blast radius
- security should be tightened before making the system more autonomous

Plan:
- [V3_SECURITY_HARDENING_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_SECURITY_HARDENING_PLAN.md)

### Phase 4
Real-Conversation Stress Replay

Why fourth:
- once RBAC, operator path, and security rails are stronger, replay results become meaningful

Plan:
- [V3_STRESS_REPLAY_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_STRESS_REPLAY_PLAN.md)

### Phase 5
Automation Pause / State Controls

Why fifth:
- needed for polish and trust
- dependent on strong escalation + operator resolution flows

Plan:
- [V3_AUTOMATION_PAUSE_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_AUTOMATION_PAUSE_PLAN.md)

### Phase 6
Memory Upgrade

Why sixth:
- important for quality and scale
- not the first thing preventing dangerous mistakes
- should be built on top of correct safety and control boundaries

Plan:
- [V3_MEMORY_UPGRADE_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_MEMORY_UPGRADE_PLAN.md)

### Phase 7
Unified Action Model

Why seventh:
- the product now has enough real action-producing systems that UI fragmentation is becoming a correctness problem
- `Today` should become the single inbox of all open user-input work
- `Escalations` should become a queue/filter lens, not a separate home of work
- this work should build on the already-proven operator/compliance slices rather than precede them

Plan:
- [V3_UNIFIED_ACTION_MODEL_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_UNIFIED_ACTION_MODEL_PLAN.md)

## Cross-Track Rules
- do not weaken the writer boundary
- do not let self-organizing memory mutate playbook or authoritative CRM
- mixed audience with client present must be treated as client-visible
- blocked threads must not be touched by automated follow-ups
- all new behavior must preserve tenant isolation and auditability
- new pending-work flows must map to a canonical contextual home and Today visibility instead of inventing page-local state

## Suggested Execution Rhythm
For each track:
1. implement the narrowest safe slice
2. run targeted proof harnesses
3. write a report in `reports/`
4. only then proceed to the next slice

## Exit Condition For “Ready For Controlled Rollout”
V3 can be considered ready for a controlled rollout when all of the following are true:
- RBAC / audience safety is proven
- operator silent hold and resolution are proven
- security audit high-severity items are closed
- core stress-test families pass
- automation pauses behave correctly
- memory upgrade does not regress safety
