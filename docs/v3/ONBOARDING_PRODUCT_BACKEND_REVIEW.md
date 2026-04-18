# Onboarding — Product + Backend Review

Status: review/analysis only. No code changes, no patches.

This is a serious review of the current onboarding system against how the app is actually used and how the backend actually consumes (or does not consume) each captured field today. It is deliberately opinionated.

Revision note (v1.1): §5.1, §5.2, §5.7, §6, §7.7, §8, §9 (Sections A & B), §10 and Appendices A/B have been tightened. Three earlier overreaches are now corrected explicitly:

- Identity questions no longer collapse the client‑manager identity (`settings.manager_name`, used by persona for "I'm the client manager at…" and for the signature) into the lead photographer identity (`settings.photographer_names`, used by persona for "X is currently available on your date"). These are now treated as two distinct fields with two distinct onboarding questions, because that is what the runtime contract already is.
- The escalation recommendation no longer binarizes the runtime. `operatorEscalationDelivery.ts` and `operatorDataTools.parseOperatorDelivery` operate on three real delivery modes (`urgent_now`, `batch_later`, `dashboard_only`). Onboarding should keep a three‑option preference, not a WhatsApp‑vs‑app pill. The gap is the runtime *read*, not the question.
- The `studio_business_profiles` finding is now phrased as "deterministic scope contract is sound, runtime consumer is missing" rather than "speculative / future only". `BusinessScopeDeterministicV1` was explicitly authored as a runtime contract; the correct framing is that the reader has not yet been wired, not that the contract is weak.

Reference product model assumed throughout:

- photographer ⇄ Ana
- Ana ⇄ client
- client ⇄ Ana

There is no third "manager person" in the normal loop. When a human needs to act, it goes to Today / the app / the operator. That is the lens every question is evaluated against.

---

## 1. Current onboarding question inventory

The briefing is 6 steps, driven by `OnboardingPayloadV4`:

### Step 1 — Identity (`OnboardingBriefingIdentityStep`)
Sequential micro‑flow of 6 fields, all writing into `payload.settings_identity`:

1. "What is your studio called?" — `studio_name`
2. "Which currency do you usually quote in?" — `currency`
3. "What timezone should Ana use for scheduling and reminders?" — `timezone`
4. "Who should Ana name as the manager when it matters?" — `manager_name`
5. "Who are the photographers on the team?" — `photographer_names`
6. "Operator WhatsApp in E.164 for urgent escalations (optional)" — `admin_mobile_number`

### Step 2 — Business scope (`OnboardingBriefingScopeStep`)
7 stages:

7. Services (pebble cluster) — `business_scope_deterministic.offered_services` + `business_scope_extensions.custom_services`
8. Geography stance — `business_scope_deterministic.geography.mode` (`local_only` | `domestic` | `regional` | `europe` | `worldwide`)
9. Travel posture — `travel_policy_mode` (`travels_freely` | `selective_travel` | `no_travel` | `destination_minimums`)
10. Deliverables — `allowed_deliverables` (`digital_gallery` | `album` | `raw_files` | `video_deliverable` | `prints`)
11. Languages — `studio_scope.language_support` (ISO‑639 codes)
12. Out‑of‑scope: service not offered — `lead_acceptance.when_service_not_offered`
13. Out‑of‑scope: geography not in scope — `lead_acceptance.when_geography_not_in_scope`

### Step 3 — Voice (`OnboardingBriefingVoiceStep`)
2 stages, writing a single `knowledge_seed` of `document_type = "briefing_voice_v1"`:

14. Tone archetype — `warm_editorial` | `direct_minimal` | `luxury_formal` | `friendly_casual`
15. "What phrases and standard lines should shape the final wording?" — 4 free‑text fields:
    - Banned phrases
    - Signature / closing
    - Standard booking line
    - Standard scope line

### Step 4 — Authority (`OnboardingBriefingAuthorityStep`)
Scheduling matrix + 4 non‑scheduling boards + escalation:

16. Scheduling — `schedule_call`, `move_call` (each: `auto | draft_only | ask_first | forbidden`)
17. Pricing & money — `discount_quote`, `send_invoice`, `payment_plan_exception`, `late_payment_extension`
18. Deliverables & files — `release_raw_files`, `publication_permission`
19. Coordination — `planner_coordination`, `vendor_credit_request`, `respond_to_art_feedback`, `operator_notification_routing`
20. Sensitive communication — `share_private_client_data`, `proactive_followup`
21. "When Ana escalates, what should hit you immediately?" — `escalation_preferences.immediate_notification_topics` (4 topics) + `batching_preference` (3 options)

### Step 5 — Vault (`OnboardingBriefingVaultStep`)
6 free‑text textareas, written to `knowledge_seed` of `document_type = "briefing_vault_v1"`:

22. Discounts & investment — `discount_language`
23. Payment exceptions — `payment_exception_language`
24. Late payment extensions — `late_extension_language`
25. RAW files — `raw_files_language`
26. Publication & gallery use — `publication_permission_language`
27. Sensitive data & privacy — `privacy_language`

### Step 6 — Review
Read‑only dossier; the "Initialize Ana" button runs finalize.

---

## 2. What the backend actually stores

From `onboardingV4Payload.ts` → `mapOnboardingPayloadToStorage()` the payload is sharded into four buckets:

| Bucket | What it holds |
|---|---|
| `photographers.settings` (JSONB) | `studio_name`, `manager_name`, `photographer_names`, `timezone`, `currency`, `whatsapp_number`, `admin_mobile_number`, `onboarding_completed_at`, `playbook_version`, `business_profile_version` |
| `studio_business_profiles` (one row per tenant) | `service_types`, `service_availability`, `geographic_scope`, `travel_policy`, `booking_scope`, `client_types`, `deliverable_types`, `lead_acceptance_rules`, `language_support`, `team_structure`, `extensions` |
| `playbook_rules` (N rows) | Scheduling matrix (`schedule_call`, `move_call`), non‑scheduling authority seeds (12 keys), `operator_notification_routing` (from escalation preferences), plus a default `discount_quote = ask_first` rule if not supplied |
| `knowledge_base` (N rows) | `briefing_voice_v1` seed (5 facts) and `briefing_vault_v1` seed (6 facts), plus any legacy seeds |

So: identity + scope + authority + voice/vault all land somewhere. Schema is not the bottleneck.

---

## 3. What the backend/runtime actually uses today

This is the part that matters. I searched all of `supabase/functions/` for every field onboarding writes. The result is uneven.

### Actively read in runtime today

`photographers.settings`:
- **`studio_name`** — `persona.ts` (line 270), `maybeRewriteOrchestratorDraftWithPersona.ts` (studio identity excerpt). Used in every draft.
- **`manager_name`** — `persona.ts` (interpolated into the signature and the "My name is X" inquiry template), identity excerpt. This is the single strongest backend usage of a name field today.
- **`photographer_names`** — `persona.ts` ("I'm happy to say X are currently available on …"). Direct output surface in every inquiry response.
- **`admin_mobile_number`** — `webhook-whatsapp/index.ts` (recognises the operator sender so only the photographer's inbound WhatsApp is accepted) and `operatorEscalationDelivery.ts` (`urgent_now` policy sends the WhatsApp ping here). Critical.
- **`whatsapp_number`** — `webhook-whatsapp/index.ts` uses it to resolve which tenant a Twilio inbound belongs to. Not currently captured by onboarding (hint shown but field is only surfaced as `admin_mobile_number` in the UI). Contract mismatch — see §5.
- **`timezone`** — passed into the studio identity excerpt for the persona writer; not read as a branching input for scheduling logic yet.
- **`currency`** — same: surfaced in studio identity excerpt, not otherwise consumed.

`playbook_rules`:
- The whole table is loaded through `fetchActivePlaybookRulesForDecisionContext.ts` and fed into `proposeClientOrchestratorCandidateActions.ts`. So any row with a recognized `action_key` lights up as a playbook candidate during the orchestrator turn.
- `playbookFamilyFromRule()` recognizes exactly this set of action families:
  `send_message`, `schedule_call`, `move_call`, `share_document`, `update_crm`, `operator_notification_routing`.
- Other action keys that onboarding writes (`discount_quote`, `send_invoice`, `release_raw_files`, etc.) are mapped to `send_message` in the orchestrator (via the fallback branch) and surface as keyed playbook rows in the reply context for the persona writer. They show up in prompts, they do not individually drive routing.

### Stored but not read by any runtime path today

`studio_business_profiles` — zero consumers across `supabase/functions/**`. Confirmed by searching every column name:
- `service_types`, `service_availability`, `geographic_scope`, `travel_policy`, `booking_scope`, `client_types`, `deliverable_types`, `lead_acceptance_rules`, `language_support`, `team_structure`, `extensions`.
- No runtime branches on geography mode, travel policy, languages, deliverables, or lead acceptance rules.
- The entire Business Scope step is currently **write‑only** at the runtime layer.

Important framing nuance: this is not an accidental shape. `onboardingBusinessScopeDeterministic.ts` authors `BusinessScopeDeterministicV1` as an explicit runtime contract — enumerated services, enumerated geography modes, enumerated travel policies, enumerated deliverables, structured lead‑acceptance rules. The shape is deliberate and branchable. What is missing is the runtime **consumer**, not the contract. The honest conclusion is "the reader has not been written yet", not "this step is speculative capture". Onboarding can (and should) keep filling this contract honestly; nothing in Ana's reply flow depends on it today, but it is the right place for those questions to live when the consumer does land.

`knowledge_base` seeds from onboarding:
- Persona's RAG tool (`rag.ts`) filters by `document_type` enum of `{ brand_voice, past_email, contract }`.
- The global KB fetcher (`fetchRelevantGlobalKnowledgeForDecisionContext.ts`) selects `brand_voice` / `past_email` / `contract` per channel.
- Onboarding writes `briefing_voice_v1` and `briefing_vault_v1` document types. These document types are never queried.
- Additionally, `buildKnowledgeBaseSeedInsertsFromOnboarding` does not produce an embedding, so even if a tool passed `document_type = null`, a similarity match via `match_knowledge` would not find these rows.
- Net: the entire Voice step (banned phrases, signature, standard lines) and the entire Vault step (6 long textareas) are **dead storage** with respect to the writer today.

`escalation_preferences`:
- Onboarding stores `immediate_notification_topics` + `batching_preference` as a `playbook_rules` row (`action_key = operator_notification_routing`, source `onboarding_briefing_escalation_v1`).
- Runtime escalation sites (`recordOrchestratorNoDraftableEscalation.ts`, `recordV3OutputAuditorEscalation.ts`, `recordStrategicTrustRepairEscalation.ts`, `boundedUnresolvedMatchApprovalEscalation.ts`) hard‑code `operator_delivery` to `urgent_now` or `dashboard_only` case‑by‑case. `operatorDataTools.parseOperatorDelivery` defaults to `urgent_now` when the tool call is missing a policy.
- There is no search hit for `immediate_notification_topics`, `batching_preference`, or `escalation_preferences_v1` anywhere in `supabase/`.
- Net: the Authority escalation page's output is stored but not actually consulted by the escalation routing code. It is a contract that is not yet wired.

### Summary matrix — where does each onboarding answer go?

| Onboarding question | Storage | Runtime reader today |
|---|---|---|
| Studio name | `settings.studio_name` | persona, writer excerpt — **actively used** |
| Currency | `settings.currency` | writer excerpt only |
| Timezone | `settings.timezone` | writer excerpt only |
| Manager name | `settings.manager_name` | persona (sign‑off + "My name is X") — **actively used** |
| Photographer names | `settings.photographer_names` | persona ("X are currently available") — **actively used** |
| Operator WhatsApp (`admin_mobile_number`) | `settings.admin_mobile_number` | operator inbound match + urgent escalation delivery — **actively used** |
| Offered services | `studio_business_profiles.service_types` | none |
| Geography mode | `studio_business_profiles.geographic_scope` | none |
| Travel posture | `studio_business_profiles.travel_policy` | none |
| Deliverables | `studio_business_profiles.deliverable_types` | none |
| Languages | `studio_business_profiles.language_support` | none |
| Out‑of‑scope lead rules | `studio_business_profiles.lead_acceptance_rules` | none |
| Tone archetype + voice facts | `knowledge_base` `briefing_voice_v1` | not read (persona filters `brand_voice`/`past_email`) |
| Vault free‑text policies | `knowledge_base` `briefing_vault_v1` | not read |
| Scheduling authority (2 rows) | `playbook_rules schedule_call/move_call` | orchestrator candidate action — **actively used** |
| Non‑scheduling authority (12 rows) | `playbook_rules` | loaded as playbook rows; routed via `send_message` fallback in the orchestrator — **indirectly used** |
| Escalation topics + batching | `playbook_rules operator_notification_routing` | **not read** — but the runtime itself genuinely has three delivery modes (`urgent_now` / `batch_later` / `dashboard_only`) at `operatorEscalationDelivery.ts`; today each escalation site hard‑codes a mode instead of consulting this row |

---

## 4. Current questions that genuinely make sense

These are the keepers — they are backed by behavior Ana actually depends on right now.

- **Studio name** — persona reference, signature block, reply identity. Without it Ana falls back to "Atelier Studio" which is wrong for every real tenant.
- **Timezone** — meaningful default; becomes load‑bearing as soon as scheduling becomes first‑class. Keep and detect via `Intl.DateTimeFormat().resolvedOptions().timeZone` (already done).
- **Currency** — same category as timezone. Low‑cost to ask, clearly right.
- **Operator WhatsApp (`admin_mobile_number`)** — the single highest‑leverage identity question. Without it the operator WhatsApp lane is inert and urgent escalations cannot land on the photographer's phone. This is the strongest backend‑justified question in the entire onboarding.
- **Offered services** — not yet consumed by runtime, but it fills `BusinessScopeDeterministicV1.offered_services`, which is an explicit runtime contract shape. Capture it honestly; the consumer is a later‑wired reader, not a different question. The pebble UI is good.
- **Deliverables** — same story. Fills `allowed_deliverables` in the deterministic contract.
- **Languages** — same. Stores cleanly into `studio_scope.language_support`, easy to answer.
- **Scheduling authority (`schedule_call`, `move_call`)** — directly maps to orchestrator action families with real routing consequences. This is the authority section that pulls the most weight.
- **Discount / invoice / payments / RAW / publication / planner / art‑feedback / private data / proactive follow‑up authority rows** — individually they aren't all orchestrator‑routed today, but they do surface in the playbook excerpt that the persona writer reads, and they are the clearest single artefact of "what Ana may and may not do". Even before the orchestrator routes them, they shape the draft. These belong.
- **Tone archetype** — not consumed by persona today, but it is a single enum, so it's cheap and it is the only voice lever that is preset‑driven rather than free text. Worth keeping with a minor rewording.

---

## 5. Current questions that should be reworded or reworked

### 5.1 "Who should Ana name as the manager when it matters?"
Backend reality: `settings.manager_name` is actively interpolated by persona as the **client‑manager** identity — it appears in "My name is X, and I'm the client manager at…" and again in the signature. This is a real role in the prompt, not a placeholder for the shooter. Removing it breaks the self‑introduction and the sign‑off on every inquiry reply.

Product reality (the one worth being careful about): in your described communication model Ana *is* the manager‑shaped layer. But persona's prompt still needs a human‑shaped name for "who the client is talking to". In a solo studio that is the photographer; in a bigger studio it is whoever runs client comms. Collapsing this into "who is the lead photographer" is wrong — those are genuinely two roles even when one person fills both.

Recommendation: keep the field, keep the runtime contract, rename the question so it matches what persona actually uses it for.

- New question: **"What name should Ana introduce herself as when replying to clients?"**
- Helper text: "This is the name Ana uses for her signature and for the line 'I'm the client manager at ${studio}'. In a solo studio, this is usually you."
- UI: single short text field.
- Storage: `settings.manager_name` (column name is legacy; UX wording is not).
- Default in UI: pre‑fill with the lead photographer's first name from 5.2 so a solo studio can move through it in one keystroke, but keep it editable.

### 5.2 "Who are the photographers on the team?"
Backend reality: persona writes "I'm happy to say `${photographer_names}` are currently available on `${date}` in `${location}`" verbatim. This is a **different** interpolation from the manager/signature one above. `photographer_names` is a group noun phrase for the "who is on your date" sentence; `manager_name` is a first‑person identity for the self‑introduction.

Product reality: the current single question collapses these two runtime consumers and then further collapses "lead shooter" and "the team sentence" on top of that. Three concerns, one input. The sentence breaks when the answer is a team label, a studio name, or a single vague phrase like "our team".

Recommendation: ask two questions that map to the two runtime consumers as they actually exist.

- Q A: **"Who is the lead photographer?"** — single name (first name or first+last). Seeds `settings.photographer_names` as the lead entry. Also used as the default value shown under question 5.1 above, but does not overwrite `settings.manager_name` once the user has set it.
- Q B (optional): **"Anyone else Ana should mention as part of the team?"** — short chip list. If populated, `settings.photographer_names` becomes "Elena & Marco" (lead first, team appended). If left blank, `settings.photographer_names` is just Elena and the "available on your date" sentence still reads grammatically.

Net: two backend consumers, two questions, two storage slots. 5.1 maps to `manager_name`; 5.2 maps to `photographer_names`. Neither silently reinterprets the other.

### 5.3 Geography stance (current single‑pick bubble)
Backend reality: `geographic_scope` is stored but not read. `travel_policy` is stored but not read. So the runtime is not yet losing anything — but the question is also not actually answering what a studio owner wants to tell Ana.

Product reality: the correct mental model is Google‑Business‑Profile‑shaped: there is a home base, then a service radius, then optionally a list of regions you explicitly do or do not work. A single‑enum stance ("local_only / domestic / regional / europe / worldwide") cannot carry that.

Recommendation: replace the single bubble with a layered capture:

- **"Where is your studio based?"** — city + country, free text (optional structured later). Fills a new `geographic_scope.home_base` field. This is the single most obvious missing onboarding question.
- **"What counts as your home market?"** — short text or chips (e.g. "Belgrade & 150 km", "Costa del Sol", "NY tri‑state"). Keeps geography grounded and feeds the existing extensions blob.
- **"Are there places you clearly do or do not work?"** — optional pair of short lists (already supported by `geography.blocked_regions` + `extensions.custom_geography_labels`, just not surfaced).
- Keep the broad stance as a **travel posture** question (see 5.4), not as the entire geography answer.

### 5.4 Travel posture (current "travels freely / selective / no / destination minimums")
Backend reality: written, not read.

Product reality: the enum is usable; the problem is that it is shown as if it were the primary geography answer. Once home base + home market are captured, travel reads naturally.

Recommendation: keep the enum, relabel the step to "Travel", and place it after geography. Plain‑language labels:

- "Happy to travel anywhere"
- "Travels for the right wedding"
- "Doesn't travel — local only"
- "Destination weddings only above a minimum"

### 5.5 Out‑of‑scope lead rules (2 questions of 3 options)
Backend reality: `lead_acceptance_rules` is stored, not read.

Product reality: the decision "what happens when a lead doesn't match" is real, but two separate rows with three options each is overkill. And two of the three options (`decline_politely`, `route_to_operator`) collapse into one in the current product, because "route to you" is where the product already sends things anyway when Ana is unsure.

Recommendation: collapse into a single question with binary + optional nuance.

- **"When a lead asks for something outside your scope, what should Ana do?"**
  - "Decline politely for me"
  - "Always check with me first"
- Optionally remember the answer separately for service‑mismatch and geography‑mismatch, but don't surface that as two pages.

### 5.6 Tone step prompt text
Current prompt copy: "Which emotional voice should Ana naturally fall into?" — fine.
Second stage prompt: **"What phrases and standard lines should shape the final wording?"** — wrong.

Product reality: this reads like a prompt‑engineering interview. Photographers won't have these sentences on file; forcing them to write four policy‑shaped lines in a cinematic overlay produces either empty fields or generic filler. And, critically: none of these four free‑text fields are consumed by the persona writer today.

Recommendation: remove the "Standard booking line" and "Standard scope line" fields entirely. Reduce to two actually useful controls:

- **"Any words or phrases Ana should avoid?"** (optional) — small chip input, fine as today.
- **"What sign‑off should Ana use?"** (optional) — short text, single line.

Both should live under the Voice step alongside the tone archetype. Rename that page to "Voice".

### 5.7 Escalation step ("When Ana escalates, what should hit you immediately?")
Backend reality: the runtime actually has **three** first‑class delivery modes, not two. `operatorEscalationDelivery.ts` branches on `urgent_now` (WhatsApp ping to `admin_mobile_number`), `batch_later` (held for digest), and `dashboard_only` (Today card, no push). `operatorDataTools.parseOperatorDelivery` accepts all three and defaults to `urgent_now`. Every escalation recording site today writes `operator_delivery` directly per‑site (mostly `urgent_now`, sometimes `dashboard_only`). What is not wired today is the lookup: no runtime path reads the tenant's `immediate_notification_topics` or `batching_preference` to pick between those three modes.

Product reality: the gap is the **read**, not the question. Collapsing to "WhatsApp vs app" would erase `batch_later` for UI convenience and discard a real runtime state. The onboarding capture's *shape* (which topics deserve immediate attention, everything else batched) is actually correct — it is the missing half of a ternary routing table. The only thing wrong is that it is stored as 4 topics + 3 options when the user has no mental model of "topics" yet.

Recommendation: keep a minimal three‑option capture, do not binarize. Flag the runtime read as the real follow‑up.

- **"When Ana needs your attention, how should she reach you?"** — single question, three pills:
  - "Ping my WhatsApp right away"  → `urgent_now` default
  - "Hold it for my next check‑in"  → `batch_later` default
  - "Just show it in the app"       → `dashboard_only` default
- Optionally, a second **optional** question: "Anything you always want a WhatsApp ping for, regardless of the default?" — multi‑select with a short list (e.g. publication disputes, payment exceptions, broadcast risk, planner emergencies). This is the existing `immediate_notification_topics` set, just named for the user.
- Storage: the existing `operator_notification_routing` playbook row is the right home. No new column.
- Follow‑up explicitly called out in Appendix B: the escalation recording sites need to read this preference instead of hard‑coding `operator_delivery` per site. Without that, the capture stays inert — but the capture shape remains correct.

### 5.8 Vault step (6 free‑text paragraphs)
Backend reality: stored as `briefing_vault_v1`, never queried by persona (which filters for `brand_voice` / `past_email`), and written without embeddings so similarity search wouldn't find it either.

Product reality: forcing a photographer to write six policy paragraphs at onboarding is the heaviest ask in the whole flow. It also has the perverse outcome that precise wording hard‑locks Ana in unhelpful ways, while vague wording produces policy‑shaped hallucinations.

Recommendation: remove the Vault from onboarding. Move it into the in‑app KB surface as an **optional** "Standard language" library, where adding wording is a deliberate, contextual act (e.g. add a RAW files stance the first time a client asks about RAW files). At the same time, when this library is populated, either switch persona's RAG filter to include `briefing_vault_v1` or store these rows as `document_type = "brand_voice"` so the existing RAG tool actually finds them.

### 5.9 Pricing & money authority — 4 options
The 4‑option model (`auto | draft_only | ask_first | forbidden`) is good abstractly but cognitively heavy when you multiply by 12 rows.

Recommendation: keep `auto / ask_first / never` as the top‑level options for every non‑scheduling row, and hide `draft_only` behind an advanced toggle. `draft_only` is a power‑user nuance; most studios will pick between "yes Ana can", "ask me first", or "never".

---

## 6. Current questions that should be removed

Flat removals (from onboarding specifically — they can still exist elsewhere):

1. **"What standard booking line should Ana use?"** — not consumed by the writer; nobody has this line cached in their head.
2. **"What standard scope line should Ana use?"** — same.
3. **Escalation page in its current heavy shape** (4 topics × 3 batching options as two separate sub‑questions) — see 5.7; replace with one three‑option "how should Ana reach you" pill plus an optional "always ping me for…" chip row. Do not remove the capture, just shrink it and stop presenting it as two orthogonal questions.
4. **Vault step — 6 long free‑text policy paragraphs** — see 5.8; relocate to in‑app optional library.
5. **"Out‑of‑scope geography" as a separate page** — merge into 5.5.
6. **Second redundant "of N" counter** on the Scope step header (pure polish, but the step header literally renders "1 of 7" twice).

Questions that should be *reworded or split*, not removed (see §5): manager question, photographer‑team question, geography stance.

---

## 7. Questions / features missing from onboarding that would actually help

All of these are justified by current or imminent backend reality, not wishlist:

### 7.1 "Where is your studio based?"
Obvious gap. There is no field anywhere in onboarding that captures home base. Everything geography‑shaped downstream has to infer it. Needed for any future routing, distance, travel threshold, or local‑area interpretation.

### 7.2 "What counts as your home market?"
Optional follow‑on to 7.1. Maps to `extensions.custom_geography_labels`, which already exists in schema. Cheap product win.

### 7.3 "Can Ana send ordinary client replies on her own?"
The single biggest missing authority question. The orchestrator has `send_message` as its primary action family, and every outbound reply decision flows through this. Onboarding currently decides scheduling, pricing, RAW files, planner coordination — and does not decide the single most frequent thing Ana does.

Map to a new `playbook_rules` row with `action_key = send_message`, `scope = global`.

### 7.4 "Can Ana share documents or files on her own?"
The orchestrator has `share_document` as a first‑class family (keyword‑triggered in `proposeClientOrchestratorCandidateActions` whenever inbound mentions brochure / PDF / contract / attachment). It does not currently have a tenant‑level authority rule.

Map to `playbook_rules.action_key = share_document`.

### 7.5 "Can Ana update CRM / project state automatically?"
The orchestrator has `update_crm` as a first‑class family (keyword‑triggered on stage / booked / proposal / invoice / payment terms). Same gap as above.

Map to `playbook_rules.action_key = update_crm`.

### 7.6 Clearer "Who is the lead photographer?"
See 5.2 — already covered by the split.

### 7.7 Three‑mode reach preference (one compact question, not a whole page)
See 5.7 — a single three‑option "how should Ana reach you" pill (matching the runtime's `urgent_now` / `batch_later` / `dashboard_only`) plus an optional chip list for "always ping me for these topics" replaces the current heavy escalation page without erasing the ternary state the runtime already operates on.

---

## 8. Recommended final onboarding structure

6 steps → 5 steps. Shorter, heavier per question, clearer about what it's capturing.

1. **Studio basics** — studio name, where you're based, timezone, currency, operator WhatsApp, three‑mode reach preference.
2. **People** — client‑manager identity (the name Ana introduces herself as), lead photographer, (optional) who else is on the team.
3. **What you do** — services, deliverables, languages, home market, travel posture, lead‑fit fallback.
4. **What Ana may do** — authority grid in one sweep (scheduling + send / share / update + pricing + files + coordination + privacy + proactive).
5. **Voice** — tone archetype, avoided words (optional), sign‑off (optional).
6. (Removed) Vault — relocate to in‑app optional KB library.

Review screen stays and summarizes the above.

---

## 9. Recommended final question list

Required (R) vs optional (O). Input type is the suggested UI control.

### Section A — Studio basics

| # | Question | R/O | Input | Maps to |
|---|---|---|---|---|
| 1 | What is your studio called? | R | short text | `settings.studio_name` |
| 2 | Where is your studio based? | R | city + country (free text now, structured later) | `settings.studio_location` (new) or `studio_business_profiles.extensions.home_base` |
| 3 | What timezone should Ana use? | R | autocomplete (already built) | `settings.timezone` |
| 4 | Which currency do you usually quote in? | R | autocomplete (already built) | `settings.currency` |
| 5 | Urgent operator WhatsApp (E.164) | O | phone input | `settings.admin_mobile_number` |
| 6 | When Ana needs your attention, how should she reach you? | R | 3‑option pill (`ping WhatsApp now` / `hold for next check‑in` / `show in app only`) | `playbook_rules operator_notification_routing` (existing row, shrunk) |
| 6a | Anything you always want a WhatsApp ping for, regardless of the default? | O | chip multi‑select (e.g. publication disputes, payment exceptions, broadcast risk, planner emergencies) | `playbook_rules operator_notification_routing.immediate_notification_topics` |

### Section B — People

| # | Question | R/O | Input | Maps to |
|---|---|---|---|---|
| 7 | What name should Ana introduce herself as when replying to clients? | R | short text | `settings.manager_name` (client‑manager identity used by persona for "My name is X, I'm the client manager at…" and the signature) |
| 8 | Who is the lead photographer? | R | short text | `settings.photographer_names` (lead entry; persona uses this for "X is currently available on your date") |
| 9 | Anyone else Ana should mention as part of the team? | O | short text or small chip list | `settings.photographer_names` (appended after the lead, e.g. "Elena & Marco") |

### Section C — What you do

| # | Question | R/O | Input | Maps to |
|---|---|---|---|---|
| 10 | Which services do you offer? | R | pebble cluster (existing) | `business_scope_deterministic.offered_services` |
| 11 | What deliverables do you offer? | R | sector cluster (existing) | `allowed_deliverables` |
| 12 | Which languages do you work in? | R | sector cluster (existing) | `studio_scope.language_support` |
| 13 | What counts as your home market? | O | short text or chips | `business_scope_extensions.custom_geography_labels` |
| 14 | What is your travel posture? | R | 4 pills (existing enum) | `travel_policy_mode` |
| 15 | When a lead asks for something outside your scope, what should Ana do? | R | 2 pills ("decline politely" / "always check with me") | `lead_acceptance_rules.*` (both sub‑keys get the same value unless the user explicitly splits) |

### Section D — What Ana may do (authority)

All rows use the same 3‑pill control: **Ana handles it / Ask me first / Never**. A hidden "Draft only" advanced option is available but not shown by default.

| # | Question | R/O | Maps to `playbook_rules.action_key` |
|---|---|---|---|
| 16 | Can Ana send ordinary client replies on her own? | R | `send_message` (new) |
| 17 | Can Ana schedule discovery calls? | R | `schedule_call` |
| 18 | Can Ana move a scheduled discovery call? | R | `move_call` |
| 19 | Can Ana share documents / files on her own? | R | `share_document` (new) |
| 20 | Can Ana update the CRM / project status automatically? | R | `update_crm` (new) |
| 21 | Can Ana handle a quote or discount change? | R | `discount_quote` |
| 22 | Can Ana send invoices? | R | `send_invoice` |
| 23 | Can Ana grant a payment extension or payment plan exception? | R (merged row) | `payment_plan_exception` + `late_payment_extension` sharing one answer by default |
| 24 | Can Ana release RAW files? | R | `release_raw_files` |
| 25 | Can Ana decide publication or gallery permissions? | R | `publication_permission` |
| 26 | Can Ana coordinate with planners / vendors? | R | `planner_coordination` |
| 27 | Can Ana respond to creative feedback? | R | `respond_to_art_feedback` |
| 28 | Can Ana share private client data? | R | `share_private_client_data` |
| 29 | Can Ana follow up proactively without being asked? | R | `proactive_followup` |

### Section E — Voice

| # | Question | R/O | Input | Maps to |
|---|---|---|---|---|
| 30 | How should Ana sound? | R | 4 tone archetypes (existing) | `briefing_voice_v1.tone_archetype` |
| 31 | Any words or phrases Ana should avoid? | O | chip input | `briefing_voice_v1.banned_phrases` |
| 32 | How should Ana sign off? | O | short text | `briefing_voice_v1.signature_closing` |

### Deferred / removed

- Standard booking line / standard scope line (voice).
- Vault — 6 free‑text policy paragraphs.
- Escalation immediate topics + batching preference as separate pages.

---

## 10. Plain‑language explanation of each recommended question

**1. Studio name.** The name Ana introduces you as. Appears in the first line of every inquiry reply ("I'm the client manager at ${studio_name}") and in persona prompt caching. Removing it breaks real output.

**2. Where are you based.** Grounds every downstream geography conversation. Without it, Ana can't tell the difference between a "local" couple 20 km away and one two countries over. Stored as plain text now; can be upgraded to a structured place later without re‑asking.

**3. Timezone.** The default scheduling reference. Already auto‑detected via `Intl` and pre‑filled. Keep pre‑fill, let the user confirm.

**4. Currency.** The default quote and invoice reference. Same category as timezone.

**5. Operator WhatsApp.** Optional on purpose, but this is what makes `webhook-whatsapp/index.ts` recognize your phone as the operator lane and what `operatorEscalationDelivery.ts` pings when something is `urgent_now`. Without it, the urgent escalation story is in‑app‑only.

**6. Reach preference.** One pill, three options, matching the runtime's three delivery modes (`urgent_now`, `batch_later`, `dashboard_only`). Lets the tenant pick a default for how Ana routes escalations without erasing the ternary the runtime already operates on.

**6a. Always‑ping topics.** Optional chip list. Escape hatch from the default in 6 — "even if my usual preference is batched, these specific topics should always hit my WhatsApp". Maps to the existing `immediate_notification_topics` on the `operator_notification_routing` playbook row.

**7. Client‑manager name.** The first‑person identity persona uses in "My name is X, and I'm the client manager at ${studio_name}" and in the signature. Stored at `settings.manager_name`. This is a distinct runtime consumer from question 8 — do not collapse them.

**8. Lead photographer.** The human persona slots into "X is currently available on your date in ${location}". Stored as the lead entry in `settings.photographer_names`. Different consumer, different sentence, different storage slot from 7.

**9. Other team.** Optional. Appended to `settings.photographer_names` after the lead so persona can write "Elena & Marco are currently available" instead of "Elena is currently available". Leave blank and the singular form still reads fine.

**10–12. Services / deliverables / languages.** Not yet read by runtime but the contract they fill (`BusinessScopeDeterministicV1`) is deliberately shaped for future branching. Capture them honestly — this is not speculative data, it is a pre‑built contract waiting for its reader.

**13. Home market.** Optional. Gives the geography layer something it can actually use to say "yes that's local" vs "that's a trip". Lives in `extensions` for now.

**14. Travel posture.** The single enum the current Travel step already captures. Good as is.

**15. Out‑of‑scope fallback.** One question instead of two. The two sub‑cases (service mismatch, geography mismatch) can share a default. Advanced users can still split them later from Settings if you want, but nobody should have to in onboarding.

**16. Send ordinary replies.** The single most impactful permission in the system. The orchestrator's `send_message` family routes every outbound reply through one of `auto / draft_only / ask_first / forbidden`. The app is fundamentally shaped by this answer, and onboarding currently never asks it.

**17–18. Schedule / move call.** Already good; directly wired to the orchestrator's `schedule_call` / `move_call` families.

**19. Share documents.** Currently the orchestrator proposes `share_document` off keywords like "brochure / pdf / contract" but has no tenant authority policy for it. This question fills that gap.

**20. Update CRM.** Same pattern — the orchestrator will propose `update_crm` from keywords like "stage / booked / proposal / invoice / payment / deposit / balance / crm" and has no tenant authority today.

**21. Discount / quote changes.** `discount_quote` is the most common commercial authority question. Good current question.

**22. Send invoices.** Real tenant decision. Keep.

**23. Payment exceptions.** Merge the two current rows ("payment plan exception" and "late payment extension") into one — they almost always have the same answer at onboarding. Advanced users can split later.

**24–29. RAW files / publication / planner / art feedback / private data / proactive.** All currently in the Authority step. Keep them, but use the simplified 3‑option pill (Ana handles / Ask me / Never).

**30. Tone archetype.** The single voice lever that is preset‑driven and cheap. Good.

**31. Avoided words.** Optional. Captures what the persona prompt already does in code (the banned‑words list) but lets the user extend it.

**32. Sign‑off.** Optional. Closes emails. Fills a real hole — today persona hard‑codes "Warmly, ${managerName}" whether that matches the studio voice or not.

---

## Appendix A — The three biggest structural issues

If only three things changed, these three would matter most:

1. **Add `send_message`, `share_document`, `update_crm` authority questions.** These are the action families the orchestrator already routes on; onboarding does not currently capture them. This is the single biggest backend mismatch in the whole flow.
2. **Remove the Vault step from onboarding.** It's six long textareas of policy prose that land in a `knowledge_base` document type persona never queries. It's the heaviest ask in the flow, and today it is almost entirely dead storage.
3. **Replace the geography bubble + heavy escalation page with "where are you based" + a three‑option reach preference.** The first is the obvious missing question. The second is a shrink, not a removal — the runtime already has three real delivery modes (`urgent_now` / `batch_later` / `dashboard_only`); the onboarding page today captures the right shape but presents it as two orthogonal questions. One three‑pill question plus an optional always‑ping chip list keeps the contract intact and matches the runtime's ternary.

## Appendix B — Runtime wiring work that has to happen alongside

The above assumes a few small downstream changes. They are not onboarding work, but recommending the question set without naming them would be dishonest:

- Persona's two name interpolations are already distinct (`managerName` for the self‑introduction and signature, `photographerNames` for the "available on your date" sentence). Keep both. The rewording in §5.1/§5.2 only changes question text and default pre‑fill; it does not reshape the runtime contract.
- If the vault is moved out of onboarding, the in‑app KB library that replaces it should either write `document_type = "brand_voice"` (the existing persona filter) or persona's RAG tool should add `briefing_vault_v1` to its enum. Either works; pick one.
- The escalation recommendation is a **shrink**, not a removal, precisely because the runtime already has a ternary. To make the capture actually matter, the escalation recording sites (`recordOrchestratorNoDraftableEscalation`, `recordV3OutputAuditorEscalation`, `recordStrategicTrustRepairEscalation`, `boundedUnresolvedMatchApprovalEscalation`) need to read the tenant's `operator_notification_routing` row and pick between `urgent_now` / `batch_later` / `dashboard_only` based on topic class and the tenant default. Today every site hard‑codes its own mode; onboarding answers have nowhere to land. This is the single most leveraged runtime follow‑up in the whole review.
- `studio_business_profiles` fields (`geographic_scope`, `travel_policy`, `language_support`, `lead_acceptance_rules`, `deliverable_types`) are currently **write‑only at the runtime layer** — but `BusinessScopeDeterministicV1` is an explicit runtime contract, not an accidental shape. Keep capturing it; the missing piece is a reader (e.g. orchestrator detectors that branch on "service not offered" / "geography out of scope" / "unsupported deliverable"), not a different onboarding model.
- If `send_message` / `share_document` / `update_crm` authority questions are added, no new runtime work is required to make them matter — `fetchActivePlaybookRulesForDecisionContext` already loads them and `proposeClientOrchestratorCandidateActions.playbookFamilyFromRule` already routes them. They are the rare case where adding onboarding capture is immediately live.
