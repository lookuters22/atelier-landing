# SECURITY AUDIT REPORT

## 1. Multi-Tenant Isolation (The #1 Risk)

**Status:** `FAIL`

**Findings**

- Service-role matchmaker query loads active weddings without a tenant filter, which can expose another photographer's wedding metadata to the matching step.
  - [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts#L275)
- Service-role identity lookup resolves a client by email from `clients` without first proving tenant ownership, which is a cross-tenant trust gap when emails collide or are reused.
  - [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/triage.ts#L168)
- `webhook-web` accepts `photographer_id` from the request body and forwards it into the event payload without JWT verification or stronger ownership proof.
  - [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts#L31)
  - [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts#L56)
  - [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts#L60)
- RLS is present on the core tables and generally ties access to `auth.uid()`, and the newer migration extends that to memories, thread summaries, tasks, messages, drafts, and threads.
  - [20240101000000_init_core_schema.sql](C:/Users/Despot/Desktop/wedding/supabase/migrations/20240101000000_init_core_schema.sql#L104)
  - [20240101000000_init_core_schema.sql](C:/Users/Despot/Desktop/wedding/supabase/migrations/20240101000000_init_core_schema.sql#L109)
  - [20260403120000_phase1_step1a_v2_memories_threads_tasks.sql](C:/Users/Despot/Desktop/wedding/supabase/migrations/20260403120000_phase1_step1a_v2_memories_threads_tasks.sql#L23)
  - [20260403120000_phase1_step1a_v2_memories_threads_tasks.sql](C:/Users/Despot/Desktop/wedding/supabase/migrations/20260403120000_phase1_step1a_v2_memories_threads_tasks.sql#L51)

**Recommended fix for next coding slice**

Centralize tenant resolution at ingress/context-builder level and remove any service-role path that queries `clients`, `weddings`, or other AI-facing tables without explicit tenant proof.

## 2. Frontend Data Over-fetching & Leaks

**Status:** `FAIL`

**Findings**

- The wedding detail hook fetches `weddings.*`, `clients(*)`, `threads.*`, `messages(*)`, and `drafts(*)`, which likely exposes more data than the UI needs and can include internal AI draft metadata like `instruction_history`.
  - [useWeddingProject.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useWeddingProject.ts#L47)
  - [useWeddingProject.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useWeddingProject.ts#L53)
- The pending approvals hook fetches `drafts.*` for browser use instead of only the fields required for the approval list.
  - [usePendingApprovals.ts](C:/Users/Despot/Desktop/wedding/src/hooks/usePendingApprovals.ts#L29)
  - [usePendingApprovals.ts](C:/Users/Despot/Desktop/wedding/src/hooks/usePendingApprovals.ts#L31)
- The weddings list hook uses `select("*")` on `weddings`, which is broader than needed for list views.
  - [useWeddings.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useWeddings.ts#L27)
  - [useWeddings.ts](C:/Users/Despot/Desktop/wedding/src/hooks/useWeddings.ts#L29)
- The frontend bundle itself uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, which is correct.
  - [supabase.ts](C:/Users/Despot/Desktop/wedding/src/lib/supabase.ts#L4)
  - [supabase.ts](C:/Users/Despot/Desktop/wedding/src/lib/supabase.ts#L5)
- However, the repo-local `.env` contains a real `SUPABASE_SERVICE_ROLE_KEY` and `INNGEST_EVENT_KEY`, which is a severe secret-handling issue even though those keys are not `VITE_`-prefixed.
  - [.env](C:/Users/Despot/Desktop/wedding/.env#L10)
  - [.env](C:/Users/Despot/Desktop/wedding/.env#L11)

**Recommended fix for next coding slice**

Replace browser `select("*")` and nested `drafts(*)` queries with minimal field lists, and rotate/remove any committed secret values from `.env`.

## 3. API Ingress & Webhook Spoofing

**Status:** `FAIL`

**Findings**

- `webhook-web` accepts arbitrary POST bodies and forwards them into the system with no JWT enforcement, no HMAC/signature verification, and a spoofable `photographer_id` field.
  - [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts#L18)
  - [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts#L31)
  - [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts#L56)
  - [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts#L60)
- `webhook-whatsapp` parses Twilio-shaped input but does not verify a Twilio signature or shared secret before trusting the payload and dispatching an event.
  - [webhook-whatsapp/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-whatsapp/index.ts#L32)
  - [webhook-whatsapp/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-whatsapp/index.ts#L44)
  - [webhook-whatsapp/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-whatsapp/index.ts#L128)
- `webhook-approval` and `api-resolve-draft` do validate photographer identity using a Supabase JWT and `auth.getUser()`, which is a good authenticated pattern.
  - [authPhotographer.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/authPhotographer.ts#L13)
  - [authPhotographer.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/authPhotographer.ts#L22)
  - [webhook-approval/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-approval/index.ts#L37)
  - [api-resolve-draft/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/api-resolve-draft/index.ts#L53)
- The Inngest edge handler likely relies on SDK-level verification, but the repo does not show an explicit signing-key assertion or custom validation wrapper here, so this remains implicit rather than auditable from local code.
  - [inngest.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/inngest.ts#L1)
  - [index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/index.ts#L4)

**Recommended fix for next coding slice**

Add explicit signature or token verification on `webhook-web` and `webhook-whatsapp`, and remove any ingress trust in raw client-supplied tenant identity.

## 4. AI Prompt Injection & Tool Poisoning

**Status:** `FAIL`

**Findings**

- The current triage classifier sends raw client text directly as the `user` message with no delimiter contract, policy wrapper, or post-classification verifier.
  - [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/agents/triage.ts#L37)
  - [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/agents/triage.ts#L51)
  - [triage.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/agents/triage.ts#L53)
- The persona worker injects `raw_facts` directly into the model conversation, and in the current system those facts can still originate from inbound user content without a true verifier-backed separation.
  - [persona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/persona.ts#L282)
  - [persona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/persona.ts#L292)
  - [persona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/persona.ts#L293)
- The older/current persona path does not have the planned v3 tool-verifier spine, so a malicious instruction inside client text can still influence reasoning/classification flows more than it should.
  - [persona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/persona.ts#L305)
  - [persona.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/persona.ts#L331)
- The shared newer writer path is safer in spirit because it says the writer must rely on “verified orchestrator facts,” but that protection is only as strong as the orchestrator/verifier path feeding it, which is not fully implemented yet.
  - [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts#L55)
  - [personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts#L67)

**Recommended fix for next coding slice**

Move all client-originated text behind a structured decision-context plus verifier boundary so raw inbound content can influence only classified facts, never direct tool permissions or policy decisions.

## 5. Idempotency & Replay Attacks

**Status:** `WARNING`

**Findings**

- The approve/send path is relatively strong: `api-resolve-draft` requires JWT ownership proof, and outbound sending uses the atomic `claim_draft_for_outbound` RPC to prevent double-send on repeated approvals.
  - [api-resolve-draft/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/api-resolve-draft/index.ts#L60)
  - [20260404120000_claim_draft_for_outbound.sql](C:/Users/Despot/Desktop/wedding/supabase/migrations/20260404120000_claim_draft_for_outbound.sql#L5)
  - [outbound.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/outbound.ts#L28)
- The reject/rewrite path is weaker: it updates by `id` and `status`, but does not check whether any row was actually updated before emitting `ai/draft.rewrite_requested`, so repeated calls can enqueue duplicate rewrite events after the first state transition.
  - [api-resolve-draft/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/api-resolve-draft/index.ts#L78)
  - [api-resolve-draft/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/api-resolve-draft/index.ts#L89)
- Ingress endpoints do not implement request idempotency keys or dedupe records before emitting events, so replayed `webhook-web` and `webhook-whatsapp` calls can generate duplicate internal events and duplicate threads/messages.
  - [webhook-web/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-web/index.ts#L56)
  - [webhook-whatsapp/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-whatsapp/index.ts#L128)
- The schema/docs mention `messages.provider_message_id` and `messages.idempotency_key`, but the live runtime does not yet consistently enforce them across ingress and outbound paths.
  - [outbound.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/inngest/functions/outbound.ts#L62)
  - [webhook-whatsapp/index.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/webhook-whatsapp/index.ts#L131)

**Recommended fix for next coding slice**

Add dedupe and idempotency enforcement to ingress and reject/rewrite paths so event emission is gated by atomic state change or a unique request key before side effects occur.
