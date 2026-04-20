# Inquiry Answer-First Plan

## Purpose

This document captures the next architectural fix for Ana's inquiry replies.

The goal is to stop the current failure mode where Ana:

- dodges reasonable email questions
- falls back to polished abstract language
- uses a call as an escape hatch instead of answering
- sometimes reintroduces herself mid-thread

We do **not** want to solve this with multiple rewrite loops or token-heavy repair passes.
The target is a **better first generation**.

## Current Diagnosis

### What is already working

- First-touch paragraph formatting is much better.
- First-touch no-call-push behavior is much better.
- Claim-permission architecture is materially better.
- Soft-confirm repair reduced false inquiry escalations.
- Anti-mirroring work reduced adjective recap behavior.

### What is still broken

On follow-up inquiry questions, especially practical or conceptual ones, Ana still often:

- answers vaguely or not at all
- suggests a call instead of answering
- uses abstract polished language like:
  - `rhythm of the day`
  - `the day to unfold`
  - `shape an approach`
  - `what feels right for you both`
- reintroduces herself mid-thread in some cases

### Root cause

The main issue is **not memory**.

The main issue is the current planner and writer contract:

- `deriveInquiryReplyPlan.ts` defaults most generic inquiry turns to:
  - `inquiry_motion: consultation_first`
  - `cta_type: call`
- the current prompt stack does **not** have a strong structured rule saying:
  - "if the client asked a reasonable question, answer it in email first"
- the writer therefore treats nuanced questions as a reason to move toward a call

Memory is secondary:

- it helps continuity
- it helps suppress first-touch intro later
- it does not solve the "call instead of answer" behavior by itself

## Design Goal

Separate:

1. whether Ana **may suggest a call**
2. whether Ana **must answer the question in email first**

That distinction does not exist strongly enough today.

## Proposed Model Changes

### 1. Extend `InquiryReplyPlan`

Current file:

- `src/types/inquiryReplyPlan.types.ts`

Add new fields:

```ts
export type InquiryQuestionType =
  | "fit_check"
  | "practical_process_question"
  | "coverage_question"
  | "deliverables_question"
  | "availability_question"
  | "pricing_question"
  | "clarification_request"
  | "client_asks_for_call"
  | "generic_inquiry";

export type InquiryAnswerObligation =
  | "answer_now_in_email"
  | "answer_briefly_then_offer_call"
  | "clarify_before_answer"
  | "defer_due_to_missing_verified_facts";
```

Then extend `InquiryReplyPlan`:

```ts
question_type: InquiryQuestionType;
answer_obligation: InquiryAnswerObligation;
```

### 2. Planner must classify the latest question

Current file:

- `supabase/functions/_shared/orchestrator/deriveInquiryReplyPlan.ts`

Add a deterministic classifier for the latest client turn.

This classifier does **not** need to be perfect.
It only needs to be good enough to catch the common inquiry shapes:

- "how do you usually approach X?"
- "is it easier if...?"
- "when is it best to discuss...?"
- "how are galleries/previews/coverage handled?"

### 3. Answer policy must become independent from CTA policy

Today the plan mostly drives CTA shape.

We need a separate answer contract:

- a thread may still allow a call suggestion
- but the writer must answer the question first when `answer_obligation` requires it

This means:

- onboarding CTA preference controls call style
- answer obligation controls whether an email answer is mandatory first

## Recommended Planner Behavior

### Default mapping

#### `practical_process_question`

Examples:

- "is it easier if the day is flexible or structured?"
- "when is it helpful to discuss photography in detail?"

Recommended:

- `question_type: practical_process_question`
- `answer_obligation: answer_now_in_email`

CTA can still be:

- `none`
- `soft`
- `direct`

But the answer must come first.

#### `coverage_question`

Examples:

- "would a smaller wedding be approached differently?"
- "how is the day documented?"

Recommended:

- `question_type: coverage_question`
- `answer_obligation: answer_now_in_email`

#### `deliverables_question`

Examples:

- "how are previews/full gallery usually handled?"
- "is analog something you build in?"

Recommended:

- `question_type: deliverables_question`
- `answer_obligation: answer_now_in_email`

#### `availability_question`

Recommended:

- keep current strong availability safeguards
- use:
  - `answer_obligation: answer_now_in_email`
  - or `defer_due_to_missing_verified_facts` if the system truly cannot answer safely

#### `pricing_question`

Recommended:

- respect existing commercial grounding flow
- may use:
  - `clarify_before_answer`
  - or `defer_due_to_missing_verified_facts`

#### `client_asks_for_call`

Recommended:

- call override remains allowed
- but if there is also a simple direct question, still answer briefly first where safe

## Writer Contract Changes

### 1. Add answer-first rule to persona prompt

Current file:

- `supabase/functions/_shared/persona/personaAgent.ts`

Add explicit guidance:

- If `answer_obligation = answer_now_in_email`, answer the client's question directly in the email.
- Do not replace an answer with:
  - "I'd rather talk through it on a call"
  - "It would be easier to explain on a call"
  - "The best way is to discuss this directly"
- A call, if allowed, may come only **after** a short useful answer.

### 2. Add dedicated realization block for answer-first process questions

New file recommended:

- `supabase/functions/_shared/prompts/personaAnswerFirstInquiryRealization.ts`

Suggested marker:

```ts
export const PERSONA_ANSWER_FIRST_INQUIRY_SECTION_MARKER =
  "=== Inquiry answer-first (voice) ===";
```

Suggested content:

- answer in 2 to 4 short sentences
- use ordinary planning words
- avoid poetic abstractions
- if CTA is allowed, mention it only after the answer
- do not say a call is needed to answer a normal email question

### 3. Add plain-answer mode for conceptual/process questions

This should explicitly steer away from:

- `rhythm of the day`
- `the day to unfold`
- `shape an approach`
- `present for the quieter moments`
- `what feels right for you both`
- `I'd rather talk through this directly`

Preferred shapes:

- "It helps to have a rough structure, but it doesn't need to feel rigid."
- "For smaller celebrations, it can be useful to know the main parts of the day and then leave some flexibility around them."
- "It's completely fine to start talking about photography earlier, even if the timeline isn't final yet."

## Mid-Thread Intro Suppression

### Current file

- `supabase/functions/_shared/orchestrator/personaFirstTouchContext.ts`

### Problem

The first-touch intro rule still leaks into some later turns.

### Required change

Make mid-thread intro suppression more explicit in writer-facing facts.

Recommended:

- when any prior `Studio:` message exists:
  - inject a dedicated marker like:
    - `inquiry_turn: not_first_touch_no_reintro`
- in `personaAgent.ts`, explicitly forbid:
  - `My name is Ana...`
  - `I'm the client manager...`
  on those turns

This should be deterministic at the prompt-contract level, not merely "discouraged."

## Memory / Context Improvements

Memory is not the primary fix, but one structured addition would help.

### Add a latest-question summary block

Current continuity file:

- `supabase/functions/_shared/memory/buildPersonaRawFacts.ts`

Or add this to orchestrator facts assembly in:

- `supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts`

Suggested new section:

```text
=== Latest client asks (authoritative for response focus) ===
- whether smaller weddings are approached differently
- whether the day should stay flexible or more structured
- when it is helpful to discuss photography in detail
```

Purpose:

- focus the writer on answering the actual question
- reduce tendency to summarize "vibe" instead of responding

This should be derived from deterministic question classification, not generated by the model.

## Audit / Enforcement Changes

We do **not** want another expensive rewrite loop.

### Keep repair minimal

At most:

- 0 retries in the common case
- 1 repair pass in rare cases

### Recommended lightweight post-check

Extend existing auditing with a narrow behavioral check for follow-up inquiry turns:

- mid-thread reintro
- call instead of answer
- conceptual-answer evasiveness

Examples of prohibited patterns when `answer_obligation = answer_now_in_email`:

- `I'd rather talk through it with you directly than try to answer in an email`
- `It would be easier to discuss this on a call`
- `Would a call work...` with no substantive answer first

But this should be a **safety belt**, not the main solution.

Main solution remains:

- planner classification
- answer obligation in first draft

## Recommended File Changes

### Schema / planner

- `src/types/inquiryReplyPlan.types.ts`
- `supabase/functions/_shared/orchestrator/deriveInquiryReplyPlan.ts`

### Facts / context

- `supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts`
- `supabase/functions/_shared/memory/buildPersonaRawFacts.ts`

### Prompt / realization

- `supabase/functions/_shared/persona/personaAgent.ts`
- `supabase/functions/_shared/prompts/personaAnswerFirstInquiryRealization.ts` (new)
- `supabase/functions/_shared/prompts/personaConsultationFirstRealization.ts`
- `supabase/functions/_shared/prompts/personaNoCallPushRealization.ts`
- `supabase/functions/_shared/prompts/personaStudioVoiceExamples.ts`
- `supabase/functions/_shared/prompts/personaAntiBrochureConstraints.ts`

### Optional audit hardening

- `supabase/functions/_shared/orchestrator/auditInquiryClaimPermissionViolations.ts`

## Implementation Slices

### Slice 1: Planner contract

Goal:

- add `question_type`
- add `answer_obligation`
- print both into the inquiry strategy facts block

Success condition:

- every inquiry turn carries an explicit answer policy into the writer

### Slice 2: Answer-first realization block

Goal:

- add dedicated writer block for:
  - `answer_now_in_email`
  - especially for process/coverage/deliverables questions

Success condition:

- writer sees a stronger mode than the current generic consultation-first bias

### Slice 3: Mid-thread no-reintro

Goal:

- add deterministic follow-up marker
- forbid Ana intro on non-first-touch turns

Success condition:

- no more `My name is Ana...` in follow-up replies

### Slice 4: Latest-client-asks facts block

Goal:

- provide a compact structured summary of what must be answered

Success condition:

- writer is focused on the question instead of the vibe

### Slice 5: Lightweight post-check

Goal:

- catch:
  - call instead of answer
  - mid-thread intro
  - clearly evasive phrasing

Success condition:

- one cheap behavioral backstop without introducing heavy rewrite loops

## Test Plan

### Planner tests

Add to:

- `supabase/functions/_shared/orchestrator/deriveInquiryReplyPlan.test.ts`

Cover:

- practical process question -> `answer_now_in_email`
- deliverables question -> `answer_now_in_email`
- client asks for call -> still allowed CTA override

### Prompt tests

Add to:

- `supabase/functions/_shared/persona/personaAgent.voiceAnchor.test.ts`
- new tests for answer-first realization block

Cover:

- answer-first rule is present
- call cannot replace answer
- mid-thread no-reintro rule is present

### Context tests

Add to:

- `supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.groundingVoice.test.ts`

Cover:

- follow-up thread includes no-reintro marker
- latest-client-asks block appears when question classifier fires

### Audit tests

If Slice 5 is implemented:

- `supabase/functions/_shared/orchestrator/auditInquiryClaimPermissionViolations.test.ts`

Cover:

- "I'd rather talk through it on a call" fails when answer-first is required
- mid-thread intro fails under no-reintro marker

## Good Local Reference Files

### Current behavior / voice stack

- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\persona\personaAgent.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\prompts\personaAntiBrochureConstraints.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\prompts\personaStudioVoiceExamples.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\prompts\personaConsultationFirstRealization.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\prompts\personaNoCallPushRealization.ts`

### Inquiry planning / permissions

- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\orchestrator\deriveInquiryReplyPlan.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\orchestrator\buildInquiryClaimPermissions.ts`
- `C:\Users\Despot\Desktop\wedding\src\types\inquiryReplyPlan.types.ts`

### Continuity / first-touch

- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\memory\buildPersonaRawFacts.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\orchestrator\personaFirstTouchContext.ts`

### Existing audit / repair architecture

- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\orchestrator\auditInquiryClaimPermissionViolations.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\orchestrator\outputAuditorViolationSeverity.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\orchestrator\repairInquiryClaimSoftConfirmDrift.ts`
- `C:\Users\Despot\Desktop\wedding\supabase\functions\_shared\orchestrator\maybeRewriteOrchestratorDraftWithPersona.ts`

### Relevant existing docs

- `C:\Users\Despot\Desktop\wedding\docs\v3\PERSONA_ANA_VOICE_STYLE_ANCHOR_SLICE.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\ANA_OPERATOR_VOICE_PRECEDENCE.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\REAL_CONVERSATION_STRESS_TEST_PLAN.md`

## Recommendation For Tomorrow

Start with:

1. Slice 1: planner contract
2. Slice 2: answer-first realization
3. Slice 3: no-reintro

Only after that:

4. latest-client-asks block
5. lightweight behavioral post-check if still needed

That order gives the best chance of fixing the first draft without adding token-heavy retries.
