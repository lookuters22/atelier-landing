# Onboarding Backend Reality And Final Question Set

This document is based on the backend and runtime as they exist today.

It is not a product-theory document.

It answers three things:

1. What onboarding data is actually stored today?
2. What onboarding data is actually used by runtime/backend today?
3. Given the backend as it exists now, what should the final onboarding question set be?

## The Main Reality

Today, onboarding writes into four backend buckets:

- `photographers.settings`
- `studio_business_profiles`
- `playbook_rules`
- `knowledge_base`

But those buckets are not equally real in runtime today.

Some fields are:

- stored and actively used

Some are:

- stored but mostly just sitting there

Some are:

- more like target architecture than proven current runtime need

So the correct question is not “what could exist in the schema?”

The correct question is:

- what data is already backed by real behavior today
- what data is stored but not really used yet
- what questions are missing even though the backend could support them and they would genuinely help

---

## What The Backend Actually Stores Today

## 1. `photographers.settings`

Current onboarding identity fields map here:

- `studio_name`
- `manager_name`
- `photographer_names`
- `timezone`
- `currency`
- `admin_mobile_number`

Also:

- `onboarding_completed_at`
- `playbook_version`
- `business_profile_version`

### What is actually used today

Based on current code:

- `studio_name` is used by persona
- `manager_name` is used by persona
- `photographer_names` is used by persona
- `admin_mobile_number` is used by WhatsApp operator routing / urgent escalation delivery
- `timezone` and `currency` are stored and meaningful, but runtime usage is less consistently wired across the app

Important backend truth:

- `manager_name` is not just dead storage today
- it is actively inserted into the persona prompt
- that means if you remove the question, persona behavior must change too

So the real issue is not “this field is unused.”
The real issue is:

- it is used, but maybe used for the wrong product reason

## 2. `studio_business_profiles`

Onboarding maps business scope into this table.

Available columns:

- `service_types`
- `service_availability`
- `geographic_scope`
- `travel_policy`
- `booking_scope`
- `client_types`
- `deliverable_types`
- `lead_acceptance_rules`
- `language_support`
- `team_structure`
- `extensions`

### What is actually used today

What is clearly wired in onboarding/runtime today:

- `service_types`
- `geographic_scope`
- `travel_policy`
- `deliverable_types`
- `lead_acceptance_rules`
- `language_support`

What appears to exist in schema/payload but is not meaningfully surfaced in onboarding today:

- `service_availability`
- `booking_scope`
- `client_types`
- `team_structure`

Important backend truth:

- those four are real columns in the canonical table
- onboarding does not really ask for them today
- current runtime usage of them appears weak or absent

So these are not fake fields, but they are also not fully living product surfaces yet.

## 3. `playbook_rules`

Onboarding authority and escalation become `playbook_rules`.

Current onboarding explicitly maps:

- `discount_quote`
- `schedule_call`
- `move_call`
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
- `operator_notification_routing`

And escalation preferences also derive a routing rule.

### What is actually used today

This is very important:

The orchestrator today clearly works with action families such as:

- `send_message`
- `schedule_call`
- `move_call`
- `share_document`
- `update_crm`
- `operator_notification_routing`

This means there is a mismatch:

Current onboarding asks about many authority situations, but it does **not** ask about some action families that the orchestrator already reasons about today.

Most important missing ones:

- `send_message`
- `share_document`
- `update_crm`

These are the clearest backend-backed missing authority questions.

There are also schema-doc-level suggested action families like:

- `banking_exception`
- `payment_reconciliation`
- `release_gallery_assets`
- `vendor_credit_approval`
- `visual_review_required`
- `pause_automation`
- `await_client_reply`

But based on the current code, those are less clearly realized as onboarding surfaces today than:

- `send_message`
- `share_document`
- `update_crm`

## 4. `knowledge_base`

Onboarding writes:

- voice facts
- vault facts

These become structured knowledge seeds.

### What is actually used today

Persona explicitly searches:

- `brand_voice`
- `past_email`

The onboarding voice/vault seeds are real storage, but their exact downstream impact looks less direct than the identity/persona/settings and authority/playbook paths.

So the backend truth is:

- this is not fake
- but it is a softer layer
- and the current onboarding is asking users for more free-text policy writing than the current product probably deserves

---

## Questions That Are Clearly Justified By Backend Today

These questions are justified because the backend stores them and runtime clearly benefits from them now.

## Identity / studio basics

### 1. What is your studio called?

Why it belongs:

- stored in `photographers.settings.studio_name`
- used by persona

### 2. What timezone should Ana use?

Why it belongs:

- stored in `photographers.settings.timezone`
- clearly meaningful for scheduling behavior and future app consistency

### 3. Which currency do you usually quote in?

Why it belongs:

- stored in `photographers.settings.currency`
- clearly meaningful for pricing/financial consistency

### 4. What WhatsApp number should urgent operator escalations go to?

Why it belongs:

- stored in `photographers.settings.admin_mobile_number`
- actively used by WhatsApp/operator escalation paths

This is one of the strongest backend-backed questions in the whole flow.

## Scope / business profile

### 5. Which services do you offer?

Why it belongs:

- maps to `studio_business_profiles.service_types`
- clearly part of deterministic business scope

### 6. Where are you based?

Why it should exist:

- backend does not currently have a clean dedicated “home base” question in onboarding
- but geography logic is weaker without it
- this is the single most obvious missing business-scope question

This should feed:

- home market understanding
- geographic interpretation
- future travel/routing decisions

### 7. Which areas do you want to work in?

Why it belongs:

- maps to `geographic_scope`
- current bubble UI is weak, but the backend concept is real

### 8. How do you handle travel?

Why it belongs:

- maps to `travel_policy`
- clearly part of studio scope

### 9. What deliverables do you offer?

Why it belongs:

- maps to `deliverable_types`
- deterministic business scope

### 10. Which languages do you work in?

Why it belongs:

- maps to `language_support`

### 11. What should happen when a lead asks for something outside your scope?

Why it belongs:

- maps to `lead_acceptance_rules`
- this is real business-scope behavior

But it should be clearer and probably simpler than it is now.

## Authority

### 12. Can Ana send ordinary client replies on her own?

Why this should exist:

- backend/orchestrator clearly reasons around `send_message`
- current onboarding surprisingly does not ask this directly

This is one of the biggest missing questions in the current flow.

### 13. Can Ana schedule a discovery call?

Why it belongs:

- maps to `schedule_call`
- explicitly real in runtime and onboarding

### 14. Can Ana move a scheduled discovery call?

Why it belongs:

- maps to `move_call`
- explicitly real in runtime and onboarding

### 15. Can Ana share documents/files on her own?

Why this should exist:

- orchestrator has `share_document`
- current onboarding does not ask it directly

This is a real missing authority question.

### 16. Can Ana update CRM/project status automatically?

Why this should exist:

- orchestrator has `update_crm`
- current onboarding does not ask it directly

This is another real missing authority question.

### 17. Can Ana handle quote/discount changes on her own?

Why it belongs:

- `discount_quote` exists
- already used in onboarding-derived playbook rules

### 18. Can Ana send invoices?

Why it belongs:

- `send_invoice` exists in authority onboarding

### 19. Can Ana handle payment exceptions or late-payment extensions?

Why it belongs:

- these are real authority rows today

May eventually be one or two questions rather than separate ones.

### 20. Can Ana release RAW files?

Why it belongs:

- real authority row today

### 21. Can Ana decide publication/gallery permissions?

Why it belongs:

- real authority row today

### 22. Can Ana coordinate with planners/vendors?

Why it belongs:

- real authority row today

### 23. Can Ana respond to creative feedback?

Why it belongs:

- real authority row today

### 24. Can Ana share private client data?

Why it belongs:

- real authority row today

### 25. Can Ana proactively follow up without being prompted?

Why it belongs:

- `proactive_followup` exists

---

## Questions That Exist Today But Are Weak Or Problematic

These are backend-real, but the product question is still weak.

### 1. `manager_name`

Backend reality:

- stored
- used by persona

But:

- in your ecosystem, this role is conceptually weak
- Ana already occupies the manager-like communication layer
- human escalation goes to Today / operator channels

My backend-based opinion:

- this field is real today because persona uses it
- but product-wise it is the weakest identity field
- if you remove it, persona prompting needs to stop relying on it

### 2. `photographer_names`

Backend reality:

- stored
- used by persona

But:

- current question is too broad
- could mean lead photographer, all photographers, or team roles

My backend-based opinion:

- keep the data concept
- split or clarify the question

### 3. Escalation batching / immediate topics

Backend reality:

- this is a real captured structure
- becomes playbook/escalation routing configuration

But:

- in your actual workflow model, escalation already means operator attention
- so this may be over-parameterized relative to the real UX

My backend-based opinion:

- this is real storage
- but it feels more infrastructure-driven than operator-driven

### 4. Vault free-text policy language

Backend reality:

- real storage
- real knowledge seed path

But:

- too much authored prose for onboarding
- too rigid if treated literally

My backend-based opinion:

- the storage path is real
- the current UX is too heavy for what this layer actually is

---

## Questions Missing From Onboarding That Backend Could Support And Would Be Useful

This is the most important section.

These are the missing questions that are justified by backend reality, not just by product imagination.

## Missing question 1: Where are you based?

Why it is missing:

- current onboarding jumps into geography stance without capturing home base

Why it matters:

- helps interpret “local,” “regional,” and travel
- useful for routing and geography logic

Backend fit:

- should live in `photographers.settings` or a clearly structured geography profile extension

Strong recommendation:
- add it

## Missing question 2: Can Ana send ordinary client messages without approval?

Why it is missing:

- orchestrator clearly uses `send_message`
- current authority onboarding oddly does not ask the baseline messaging authority directly

Why it matters:

- this is probably the single most important automation permission in the whole product

Backend fit:

- should map to `playbook_rules.action_key = send_message`

Strong recommendation:
- add it

## Missing question 3: Can Ana share documents/files automatically?

Why it is missing:

- orchestrator uses `share_document`
- onboarding does not ask it

Backend fit:

- should map to `playbook_rules.action_key = share_document`

Strong recommendation:
- add it

## Missing question 4: Can Ana update CRM/project state automatically?

Why it is missing:

- orchestrator uses `update_crm`
- onboarding does not ask it

Backend fit:

- should map to `playbook_rules.action_key = update_crm`

Strong recommendation:
- add it

## Missing question 5: Who is the lead photographer?

Why it is missing:

- current `photographer_names` is too vague

Why it matters:

- persona and studio identity need a stable named person more than a vague team blob

Backend fit:

- could replace or clarify current `photographer_names`

Strong recommendation:
- add explicitly or split current question

## Missing question 6: What does your home market include?

Why it is missing:

- current geography stance is too broad
- backend has `geographic_scope` and extensions, but no good capture of precise local area

Backend fit:

- should live in structured geography / extensions

Recommendation:
- add as a follow-up to geography

---

## Fields The Backend Can Store But I Would Not Turn Into Onboarding Questions Yet

These exist in schema/payload, but based on today’s runtime I would not force them into onboarding yet.

### 1. `service_availability`

Why not yet:

- exists in canonical table
- does not appear meaningfully surfaced in runtime today

### 2. `booking_scope`

Why not yet:

- exists in canonical table
- useful in theory
- not clearly alive enough in runtime today

### 3. `client_types`

Why not yet:

- exists in canonical table
- but current system does not seem to drive much behavior from it today

### 4. `team_structure`

Why not yet:

- exists in canonical table
- but there is not yet a strong runtime use pattern visible in current code

These are candidates for future onboarding expansion, not immediate must-haves.

---

## Final Recommended Onboarding Question List Based On Backend Today

This is the version I would recommend if the goal is:

- match actual backend/runtime reality
- remove weak questions
- add missing questions that are already justified by current backend capabilities

## Section A: Studio basics

### 1. What is your studio called?

Would do:

- set `photographers.settings.studio_name`
- used by persona and identity

### 2. Where are you based?

Would do:

- define studio home base
- support geography and travel interpretation

### 3. What timezone should Ana use?

Would do:

- set scheduling default timezone

### 4. Which currency do you usually quote in?

Would do:

- set pricing/financial default currency

### 5. What WhatsApp number should urgent operator escalations go to? (optional)

Would do:

- set `admin_mobile_number`
- used by urgent escalation delivery

## Section B: Team identity

### 6. Who is the lead photographer?

Would do:

- give the backend/persona a clear primary human photography identity

### 7. Does the studio have other photographers or team members Ana should know about?

Would do:

- optionally capture broader team structure
- better than current vague `photographer_names`

## Section C: Services and geography

### 8. Which services do you offer?

Would do:

- set `service_types`

### 9. What areas do you want to work in?

Would do:

- define geographic operating scope

### 10. What counts as your home market?

Would do:

- give the geography system a usable local-area interpretation

### 11. How do you handle travel?

Would do:

- set travel posture

### 12. What deliverables do you offer?

Would do:

- set deliverables scope

### 13. Which languages do you work in?

Would do:

- set `language_support`

### 14. What should happen when a lead is outside your scope?

Would do:

- set `lead_acceptance_rules`

## Section D: Ana authority

### 15. Can Ana send ordinary client replies without approval?

Would do:

- set `send_message`
- this is a major missing question today

### 16. Can Ana schedule discovery calls?

Would do:

- set `schedule_call`

### 17. Can Ana move scheduled discovery calls?

Would do:

- set `move_call`

### 18. Can Ana share documents/files?

Would do:

- set `share_document`
- another major missing question today

### 19. Can Ana update CRM/project state automatically?

Would do:

- set `update_crm`
- another major missing question today

### 20. Can Ana handle quotes/discounts?

Would do:

- set `discount_quote`

### 21. Can Ana send invoices?

Would do:

- set `send_invoice`

### 22. Can Ana handle payment exceptions or late-payment extensions?

Would do:

- set payment authority defaults

### 23. Can Ana release RAW files?

Would do:

- set `release_raw_files`

### 24. Can Ana decide gallery/publication permissions?

Would do:

- set `publication_permission`

### 25. Can Ana coordinate with planners/vendors?

Would do:

- set planner/vendor coordination authority

### 26. Can Ana respond to creative feedback?

Would do:

- set art-feedback authority

### 27. Can Ana share private client data?

Would do:

- set privacy-sensitive authority

### 28. Can Ana proactively follow up without being prompted?

Would do:

- set proactive-follow-up authority

## Section E: Communication style

### 29. How should Ana sound?

Would do:

- set tone archetype

### 30. Any words Ana should avoid?

Would do:

- guide voice style without overengineering

### 31. What sign-off should Ana usually use?

Would do:

- give a standard closing

This is a better backend-aligned replacement for the current overcomplicated wording page.

## Section F: Optional advanced wording

### 32. Sensitive-topic communication presets

Would do:

- optionally guide how Ana phrases discounts, RAWs, privacy, etc.

But:

- should be preset-driven or optional
- should not be a heavy free-text mandatory page

---

## What I Would Remove Or Rework Immediately

### Remove or rethink

- `Who should Ana name as the manager when it matters?`
- current `photographer_names` wording
- current geography bubble interpretation as the whole answer
- current “What phrases and standard lines should shape the final wording?” framing
- current escalation batching question as a major onboarding decision
- current Vault free-text heavy experience

### Add immediately

- Where are you based?
- What counts as your home market?
- Can Ana send ordinary client replies without approval?
- Can Ana share documents/files?
- Can Ana update CRM/project state automatically?
- A clearer lead photographer / team identity question

---

## Final Backend-Based Opinion

If I ignore product taste and judge this strictly by backend reality today:

- the current onboarding is missing some of the most important actual action permissions
- especially `send_message`, `share_document`, and `update_crm`
- it includes some questions that are real in storage but weak in product meaning
- especially `manager_name`
- it also has schema-backed areas that exist but are not mature enough to force into onboarding yet
- especially `service_availability`, `booking_scope`, `client_types`, and `team_structure`

So the real backend-based conclusion is:

- some current questions should be removed or reframed
- some missing questions should be added because the runtime already has the action family for them
- and some schema fields should stay out of onboarding until they have stronger real behavior
