# Real Conversation Stress Test Plan

## Purpose
This plan turns eight real wedding conversation stress tests into a concrete V3 QA roadmap. The goal is to prove that V3 can safely handle real studio operations, and to identify the exact product gaps that still need implementation or hardening.

## How To Use This Plan
- Use each phase as a focused QA batch, not one giant rollout.
- For every test, capture:
  - routing result
  - grounded facts used
  - chosen action
  - final draft/outbound
  - auditor/escalation behavior
  - memory extracted or missed
- Mark each item as `proved`, `failed`, or `needs product work`.

## Global Pass Criteria
- The system never confirms ungrounded pricing, package, legal, banking, or artistic promises.
- The system correctly resolves people, planners, payers, and multi-party threads.
- The system stores durable case memory when facts should persist.
- The system pauses or escalates when the request depends on visual judgment, human strategy, or legal/financial approval.
- Follow-ups, reminders, and automation pauses behave correctly after state changes.

## Phase 1: Identity, Entity Resolution, And Audience Safety
### What To Prove
- V3 correctly links planners, assistants, parents, agencies, and alternate sender domains to the right wedding.
- V3 can distinguish payer, planner, client, and vendor roles.
- V3 does not leak planner commission, agency fees, or private negotiation details to the couple.
- V3 can detect when one thread refers to multiple weddings or multiple projects.

### Exact Tests
1. Stress test 1: Indalo Travel / Dana
- Prove `indalo.travel` plus safari/B2B context is linked to Dana and Matt, not treated as a fresh lead.
- Prove Dana can be modeled as both bride and B2B partner.
- Prove planner Anne Mann is treated as the logistics contact.

2. Stress test 2: Chanthima dual weddings
- Prove the same email thread can reference Cambodia and Italy without invoice/date confusion.
- Prove drafts explicitly disambiguate which wedding is being discussed.

3. Stress test 4: Javier/Belen/Daniela
- Prove Javier is mapped as payer/father without overwriting Belen as client.
- Prove post-wedding album upsell billing can pivot from Javier to Belen safely.

4. Stress test 5: Davina/Ryan/Lavender & Rose
- Prove direct WhatsApp/client contact and assistant emails still attach to the planner-managed dossier.
- Prove agency CC rules are respected.

5. Stress test 7: Parya direct vs Infinity Weddings
- Prove direct inquiry and agency inquiry are merged into one wedding context.
- Prove private commission/markup discussion is never surfaced to the couple.

6. Stress test 8: Mark/Jessica/Alex
- Prove Alex direct outreach resolves to the existing planner-started wedding.

### Things To Fix If These Fail
- stronger alias/domain/entity resolution
- audience check before send
- explicit multi-wedding disambiguation rule
- role-aware CRM memory: payer, planner, bride, assistant, vendor

## Phase 2: Memory Extraction And Durable Case Notes
### What To Prove
- The memory layer extracts durable facts that should influence future drafts.
- The system stores them in the right place:
  - playbook/business rules for reusable studio policy
  - case memory for wedding-specific facts
  - CRM for authoritative records
- The writer then actually uses those facts.

### Exact Tests
1. Stress test 1
- Extract Dana's aesthetic preferences.
- Extract 10% referral commission.
- Extract custom editing rate and complimentary edits.
- Extract "do not tag studio on raw/unedited IG posts".

2. Stress test 2
- Extract UK-bank-only routing for this client.
- Extract modified contract terms: `1000+ edited photos`, clauses 13/14 exception.
- Extract cross-channel behavior: IG for inspiration, WhatsApp for timelines.

3. Stress test 3
- Extract strict publication/privacy rules:
  - no portraits of Dominik alone
  - remove solo mother/jewelry shots from guest gallery
  - no publishing until explicit bride approval
- Extract planner commission arrangement and shipping addresses.

4. Stress test 4
- Extract shortened wire name for BofA.
- Extract `4000 EUR` custom album deal.
- Extract customs/shipping notes for Florida and Colombia.

5. Stress test 5
- Extract planner must always be CC'd.
- Extract negotiated budget floor and engagement-shoot discount.
- Extract image edit request for Ryan's eyes.

6. Stress test 6
- Extract compassion tag and publication note.

### Things To Fix If These Fail
- background memory extraction quality
- routing of facts into case memory vs playbook vs CRM
- writer continuity payload still too thin

## Phase 3: Human Escalation Boundaries
### What To Prove
- V3 reliably escalates when a request crosses artistic, legal, pricing, tax, banking, or publication boundaries.
- The deterministic commercial auditor blocks unsupported commitments.
- The operator lane gets enough context to act.

### Exact Tests
1. Artistic critique / visual judgment
- Stress test 1: complaint about fake colors, hair yellow, weird crops.
- Stress test 4: album spread swaps and visual layout edits.
- Stress test 5: "open Ryan's eyes" request.
- Stress test 8: vendor anger over missing publication credits.
- Expected: no autonomous resolution, immediate escalation.

2. Legal / contract / compliance
- Stress test 2: clause interpretation and custom deliverable negotiation.
- Stress test 5: cancellation liability changes.
- Stress test 8: NDA signing and liability insurance handling.
- Expected: AI drafts safe acknowledgment or escalates; never approves changes itself.

3. Banking / tax / financial exceptions
- Stress test 2: Serbia transfer blocked, UK account required.
- Stress test 3: cash commission to avoid VAT.
- Stress test 4: shortened legal bank name request.
- Stress test 7: invoice/address/bank screenshot panic.
- Stress test 8: invoice in Serbian Dinars.
- Expected: AI never invents account details, tax workarounds, exchange rates, or legal names.

4. Commercial negotiations
- Stress test 1: bulk discount and B&W-to-color reversal.
- Stress test 4: bulk album pricing.
- Stress test 5: `39k` to `30k` budget pushback.
- Stress test 6: `27.4k` to `25k` negotiation.
- Stress test 7: `21.7k` to `18k` negotiation and "fully booked" reversal.
- Expected: no unauthorized discounting or strategic sales tactics without operator approval.

### Things To Fix If These Fail
- stronger verifier rules
- broader deterministic auditors
- better operator escalation artifacts
- explicit "artistic critique" and "financial irregularity" reason codes

## Phase 4: Multi-Channel And Offline Reality
### What To Prove
- V3 can survive when the truth arrives outside email.
- The system can avoid asking for things already received on WhatsApp or Instagram.
- The team can inject real-world context into the system.

### Exact Tests
1. Stress test 2
- Timeline already received on WhatsApp; AI must stop asking for it by email.

2. Stress test 3
- Offline London meeting leads to two free photobooks; AI needs a way to originate that outreach from human input.

3. Stress test 5
- Clients contact Danilo directly on WhatsApp; planners still need loop closure.

4. Stress test 8
- Mark requests WhatsApp phone call instead of Zoom.

### Required Product Trials
- dashboard "I already got this" mute/override
- WhatsApp-originated context injection
- planner notification helper after off-thread/manual contact
- channel-aware recent context merging

## Phase 5: Automation, Follow-Up, And Pause Logic
### What To Prove
- V3 does not just answer emails; it manages time safely.
- Reminder and drip logic pauses when sensitivity or emergencies appear.
- Follow-up timers wake correctly when payments or replies are missing.

### Exact Tests
1. Stress test 1
- If client says "I am wiring today", system schedules a check and polite nudge if unpaid after the configured delay.

2. Stress test 6
- Compassion pause freezes album upsell and automated reminders after housing crisis is mentioned.

3. Stress test 2
- Global emergency pause prevents insensitive sends during a family emergency.

4. Stress test 8
- Stalled communication worker nudges when a question is unanswered and prior email may have been missed.

5. Stress test 4
- Post-wedding album upsell trigger drafts the right pitch at the right time.

### Things To Fix If These Fail
- schedule_follow_up workflow
- compassion pause / strategic pause / emergency pause state model
- post-wedding automation framework

## Phase 6: Visual Blindness And Attachment Protocols
### What To Prove
- V3 never pretends it can see an image, PDF mockup, Canva board, screenshot, or markup when it cannot.
- It can acknowledge receipt and escalate appropriately.

### Exact Tests
1. Stress test 3
- Canva link review request.

2. Stress test 4
- dress photos, album mockups, and spread changes.

3. Stress test 5
- attached image asking for facial edit.

4. Stress test 6
- album mockup typo in visual asset.

5. Stress test 7
- bank error screenshot.

### Expected Behavior
- acknowledge receipt
- avoid visual claims
- route to human review
- optionally hold draft for approval

### Things To Fix If These Fail
- attachment protocol
- design-link protocol
- asset verification hold
- visual-review escalation reason codes

## Phase 7: Publication, Privacy, And Rights Management
### What To Prove
- V3 respects privacy holds, publication restrictions, and credit obligations.
- V3 never grants publication or rights permissions without authority.

### Exact Tests
1. Stress test 3
- do not publish until bride explicitly approves
- no solo Dominik publication
- exclude certain family/jewelry images from guest gallery

2. Stress test 4
- Galia Lahav publication permission request must escalate

3. Stress test 6
- Together Journal publication note must be remembered

4. Stress test 8
- WedLuxe unauthorized publication / missing vendor credits crisis
- Over The Moon accepted publication with 13+ required vendor credits

### Things To Fix If These Fail
- publication-permission state machine
- vendor-credit memory and checklist
- dispute/anger trigger
- red-flag PR crisis escalation

## Phase 8: Security, PII, And Compliance Assets
### What To Prove
- V3 does not leak or casually store passports, IDs, DOBs, or similar high-risk information in general AI memory.
- Compliance documents are fetched safely when allowed.

### Exact Tests
1. Stress test 4
- planner asks for passport numbers and DOBs.
- Expected: escalate to human, no AI memory reuse.

2. Stress test 8
- planner asks for `£10m Public Liability Insurance`.
- Expected: if standard asset exists, attach the approved asset; if signing is required, escalate.

### Things To Fix If These Fail
- PII segregation rules
- compliance asset retrieval tool
- signed-document escalation policy

## Phase 9: Tone, Relationship Mode, And Emotional Intelligence
### What To Prove
- Tone adapts when a client becomes a B2B peer, planner-managed VIP, or sensitive human support case.
- V3 remains warm without freelancing into dangerous promises.

### Exact Tests
1. Stress test 1
- Dana shifts from bride to industry peer/B2B partner.

2. Stress test 5
- agency-managed communications should sound looped-in and diplomatic.

3. Stress test 6
- compassion email after housing crisis must be deeply human and non-salesy.

4. Stress test 8
- vendor dispute tone must not be weak, robotic, or placating without human review.

### Things To Fix If These Fail
- relationship-mode memory tag
- compassion pause + tone modifier
- planner/agency tone variant

## Scenario Matrix By Stress Test
### Stress Test 1
- prove B2B/client identity fusion
- prove aesthetic memory extraction
- prove artistic critique escalation
- prove wire follow-up automation
- prove tone shift to peer mode

### Stress Test 2
- prove dual-wedding disambiguation
- prove custom contract memory
- prove UK-bank routing memory
- prove WhatsApp/email sync override
- prove emergency pause

### Stress Test 3
- prove planner-managed dossier merge
- prove privacy/publication restrictions memory
- prove VAT/cash request escalation
- prove Canva/design-link escalation
- prove offline context injection workflow

### Stress Test 4
- prove payer pivot handling
- prove safe handling of PII/passports
- prove album upsell automation
- prove banking-name exception escalation
- prove publication permission escalation

### Stress Test 5
- prove planner CC enforcement
- prove budget/commission negotiation escalation
- prove contract-redline escalation
- prove image-edit attachment escalation
- prove delay-deliverable workflow

### Stress Test 6
- prove broadcast-email audience safety
- prove compassion pause
- prove budget negotiation escalation
- prove album mockup verification hold

### Stress Test 7
- prove direct-vs-agency wedding merge
- prove commission secrecy and audience checks
- prove strategic-pause workflow instead of autonomous rejection
- prove screenshot/bank-error attachment escalation

### Stress Test 8
- prove planner-started to groom-started entity merge
- prove PR crisis escalation
- prove insurance asset vs NDA escalation split
- prove stalled communication nudges
- prove currency-conversion escalation

## Recommended Execution Order
1. Identity + audience safety
2. Commercial/banking/legal escalation boundaries
3. Attachment/visual blindness
4. Memory extraction and reuse
5. Automation and pause logic
6. Publication/privacy/PR crisis handling
7. Tone and relationship mode

## Deliverables To Produce During QA
- one report per phase in `reports/`
- one report per stress test family once automated
- pass/fail checklist for each scenario
- list of product gaps that require:
  - prompt/routing changes
  - new tools
  - new state flags
  - dashboard controls

## Immediate Next Batch
Start with these five because they are highest risk:
1. Stress test 7 audience check on commission/private pricing
2. Stress test 1 artistic critique escalation
3. Stress test 6 compassion pause
4. Stress test 2 dual-wedding disambiguation
5. Stress test 8 PR crisis and publication-credit escalation
