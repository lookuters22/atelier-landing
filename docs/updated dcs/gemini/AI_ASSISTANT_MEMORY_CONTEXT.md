# AI ASSISTANT MEMORY CONTEXT: PROJECT "ANA"

## 1. PROJECT OVERVIEW
* **Product:** "Ana" - A multi-tenant, autonomous AI studio manager for luxury wedding photographers.
* **Core Philosophy:** We are building an enterprise-grade agent capable of handling chaotic, multi-party communications (brides, planners, vendors) and complex logistics (travel, timelines) with flawless white-glove tone.
* **Architecture Status:** Currently migrating from a V1 linear "waterfall" pipeline to a V2 Central Orchestrator pattern inspired by Anthropic's Claude Code repository.

## 2. THE REAL TECH STACK (NO HALLUCINATIONS)
Do NOT assume the use of generalized frameworks like LangChain, Agno, or Vercel AI SDK. 
* **Frontend:** React, Vite, Tailwind CSS, TypeScript.
* **Backend:** Supabase Edge Functions (Deno).
* **Database:** Supabase (Postgres, pgvector, Realtime).
* **Event Orchestration:** Inngest (`npm:inngest@3`).
* **AI Integration:** Native provider API calls via standard `fetch()`. 
    * *Orchestrator & Tools:* OpenAI Chat Completions (`/v1/chat/completions`) using native `tools` / `tool_calls`.
    * *Persona/Drafting:* Anthropic Messages API (`/v1/messages`).

## 3. SECURITY & MULTI-TENANCY (P0 RULE)
Cross-tenant data leakage is a catastrophic failure. 
* **The `photographer_id` Rule:** Every tenant-owned row is isolated by `photographer_id`. When writing backend logic (especially if bypassing RLS with `supabaseAdmin`), you MUST append `.eq('photographer_id', tenantId)` to all queries.
* **Parent-Chain Proof:** If a table lacks a `photographer_id` column (e.g., `messages`, `clients`), ownership MUST be proven through the parent chain (e.g., `messages.thread_id` -> `threads.wedding_id` -> `weddings.photographer_id`).

## 4. THE V2 ORCHESTRATOR LOOP
The system does not use hardcoded routing (e.g., Triage -> Specialist -> Output).
1. **Trigger:** Webhook emits to Inngest.
2. **Context Assembly:** Backend calls `buildAgentContext()` to gather CRM state, recent raw messages, the rolling thread summary, and vector memory headers.
3. **Orchestrator Loop (Reason -> Act -> Observe):** The central Orchestrator (OpenAI) analyzes context and dynamically calls modular tools (Intake, Logistics, Commercial). It batches independent tool calls when possible.
4. **Tool Constraints:** Tools return structured facts/errors. They NEVER crash the Inngest function. They NEVER write client-facing prose.
5. **Persona Drafting:** Verified facts are handed to the Persona Agent (Anthropic) to draft the luxury-toned reply.
6. **Approval:** Draft is saved with `pending_approval`. Human reviews via WhatsApp/Web before outbound API delivery.

## 5. THE 3-TIER MEMORY PATTERN
Context windows are strictly managed to prevent token explosion. We never dump full chat transcripts into the prompt.
* **Tier 1 - Global Knowledge (`knowledge_base`):** Brand rules, pricing, contracts. Vector searched.
* **Tier 2 - Durable Client Memory (`memories`):** Hard facts (preferences, constraints). Uses a **Header-Scan Pattern**: the Orchestrator first reads lightweight summaries, selects relevant IDs, and *only then* fetches the heavy `full_content` for those specific rows.
* **Tier 3 - Session State (`messages` & `thread_summaries`):** The Orchestrator only sees a rolling summary of the "story so far" plus the last 5-10 raw message turns.

## 6. CODING STANDARDS
* **Durable Execution:** Every model call, external API fetch, or human wait-state MUST be wrapped inside Inngest's `step.run()` or `step.waitForEvent()`.
* **Component Rules:** Keep React components under 200 lines. Extract logic to `src/hooks/`. Do not alter existing Tailwind layouts visually unless requested.
* **Typing:** Strict TypeScript. Use `camelCase` in TS and `snake_case` in DB columns. Rely on `database.types.ts` as the single source of truth.

## 7. AI INSTRUCTION
Prompt Library: When writing LLM API calls, strictly use the exact string literals found in PROMPTS.md. Do not hallucinate, invent, or summarize system prompts.