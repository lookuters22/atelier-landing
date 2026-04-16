# V3 Generalization Pass Plan

## Purpose
This document answers a future-facing question:

How do we take the current V3, which is being proven in a wedding/luxury-photography environment, and generalize it into a broader photographer operating system without breaking the safety architecture?

This is not the current implementation roadmap.
It is the planned cleanup and abstraction pass that should happen after the current safety/correctness slices are finished.

## Core Principle
Do not generalize by deleting hard-won safety rules.

Generalize by:
- preserving the orchestrator shape
- preserving deterministic proposal / verifier / auditor boundaries
- preserving operator escalation and hold behavior
- extracting domain-specific assumptions into capability categories and policy layers

In short:
- keep the safety kernel
- broaden the domain model around it

---

## What Must Stay Stable

These are the parts of V3 that should remain foundational even after a generalization pass:

- deterministic candidate proposal layer
- verifier / auditor backstops
- operator escalation and silent hold
- audience visibility / RBAC protections
- tenant isolation
- structured workflow state
- narrow writer boundary
- authoritative CRM / playbook / case-memory separation

These are not wedding-specific ideas.
They are the reusable core of the system.

---

## What Is Still Too Domain-Shaped Today

The current code and tests are still heavily shaped by the present domain:

- wedding-specific roles
  - couple
  - planner
  - payer
  - vendor
- wedding-specific artifacts
  - timeline
  - album proof
  - mockup PDF
  - venue insurance / public liability
- wedding-specific commercial language
  - deposit
  - retainer
  - package
  - travel miles
- wedding-specific workflow assumptions
  - planner-mediated comms
  - approval-contact patterns
  - dual-wedding thread ambiguity

That is acceptable for the current proof phase.
But these should eventually become broader abstractions.

---

## Target Generalization Strategy

### 1. Convert Wedding Terms Into Capability Terms

Examples:

- `planner` becomes:
  - intermediary / representative
- `couple` becomes:
  - principal client
- `payer` remains:
  - financial authority
- `timeline` becomes:
  - required artifact / schedule artifact
- `album proof / mockup` becomes:
  - visual deliverable verification
- `venue insurance / certificate` becomes:
  - compliance document request
- `package / retainer / travel` becomes:
  - commercial terms

The rule should be:
- keep the current behavior
- rename the conceptual layer around it

### 2. Separate Domain Data From Policy Categories

We should aim for:

- domain data
  - wedding
  - portrait session
  - brand shoot
  - editorial job
  - family session

vs

- policy categories
  - commercial authority
  - audience visibility
  - compliance routing
  - artifact collection
  - visual verification
  - workflow follow-up
  - operator escalation

This keeps the orchestrator reusable across verticals.

### 3. Keep Proposal Families Generic

Current families are already fairly reusable:

- `send_message`
- `schedule_call`
- `move_call`
- `share_document`
- `update_crm`
- `operator_notification_routing`

This is good.
Do not explode these into domain-specific families unless truly necessary.

Instead, generalize through:
- action keys
- reason codes
- capability classes
- workflow state

### 4. Turn Role Rules Into Principal / Intermediary / Unknown Policy

Many current rules can later be generalized from wedding examples into broader policy classes:

- principal
  - client with decision authority
  - payer
- intermediary
  - planner
  - producer
  - studio manager
  - art director
  - coordinator
- vendor / external collaborator
- assistant / team member
- unknown

The future question becomes:
- who is allowed to see this?
- who is allowed to request this?
- who is allowed to approve this?

That is more universal than wedding-specific labels.

---

## Tracks For The Generalization Pass

### Track 1
Vocabulary Normalization

Goal:
- rename capability classes, reason codes, and docs to broader concepts where possible

Examples:
- planner-private commercial -> intermediary-private commercial
- wedding identity ambiguity -> booking/project identity ambiguity
- timeline suppression -> required artifact suppression

Do not change runtime behavior yet.
This is a naming and taxonomy cleanup pass.

### Track 2
Role Model Generalization

Goal:
- map current wedding roles into broader authority categories

Examples:
- couple -> principal client
- planner -> intermediary
- payer -> financial authority
- vendor -> external collaborator

Keep wedding-specific aliases for backward compatibility where useful.

### Track 3
Workflow State Generalization

Goal:
- generalize workflow state from wedding-specific artifacts into reusable task classes

Examples:
- `timeline` -> required artifact
- `payment_wire` -> payment expectation
- `stalled_inquiry` -> unresolved inquiry
- `album proof review` -> visual deliverable verification

### Track 4
Stress Replay Expansion Beyond Weddings

Goal:
- build replay sets for other photographer workflows

Examples:
- commercial brand shoot
- editorial licensing question
- portrait/family scheduling edge cases
- associate-shooter studio workflow

This is where universality gets proven, not just declared.

### Track 5
Business Profile Layer

Goal:
- allow the same safety kernel to operate across different studio archetypes

Examples:
- luxury wedding studio
- portrait/family studio
- commercial/editorial photographer
- agency/associate-shooter studio

This should be configured through:
- playbook rules
- role/policy mappings
- artifact/workflow policies

not through hardcoded branch logic.

---

## What We Should Not Generalize Too Early

Avoid these mistakes:

- replacing precise safety rules with vague “universal” logic
- deleting domain-specific tests before broader equivalents exist
- flattening all roles into generic “contact”
- assuming every workflow is just a generic CRM thread
- moving too much into prompts instead of deterministic policy

A good generalization pass should make the system:
- broader
- cleaner
- more reusable

without making it:
- less safe
- less inspectable
- less deterministic

---

## Recommended Timing

Do the generalization pass after:

- the current wedding-first safety stack is finished
- stress replay core gaps are closed
- authority and sender-resolution slices are stable
- WhatsApp/operator transport is proven enough

In other words:
- do not pause core safety work for generalization
- do the abstraction pass once the present domain is reliable

---

## Exit Criteria For “Generalized Core”

We can say the V3 core is meaningfully generalized when:

- role policy is described in principal/intermediary/vendor terms
- artifact/workflow classes are not wedding-only in concept
- at least one non-wedding replay batch is added
- proposal and workflow behavior still pass the existing safety proofs
- the docs describe both:
  - current wedding deployment
  - broader target architecture

---

## Short Version

The plan is:

1. finish the current wedding-first safety and correctness work
2. keep slices modular and category-based
3. then perform a dedicated abstraction pass
4. generalize names, roles, workflows, and replay coverage
5. preserve the same deterministic safety kernel underneath

This keeps V3 from becoming either:
- a pile of wedding hacks
or
- an over-generic system that loses its safety guarantees
