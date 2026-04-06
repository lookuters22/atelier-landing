# ANA: VIBE-CODING EXECUTION MASTERPLAN

## 1. THE PRIME DIRECTIVE: MICRO-PROMPTS & SMALL CHUNKS
We are building an enterprise-grade AI architecture. To prevent AI hallucinations, spaghetti code, and context window collapse, **we strictly enforce modularity.**
* **No Monoliths:** No single file should exceed 150-200 lines. Break complex logic into smaller, testable utility files.
* **Micro-Prompts Only:** We do not execute prompts like "Build the AI." We execute prompts like "Build the Zod schema for the Calendar Tool." 
* **One Step at a Time:** The AI must only generate code for the current active phase. Do not attempt to wire up the Orchestrator before the Tools exist.

## 2. THE TECH STACK BOUNDARIES
* **Backend:** Supabase Edge Functions (Deno), Inngest (`npm:inngest@3`).
* **AI Integration:** Native `fetch()` to OpenAI (Orchestrator/Tools) and Anthropic (Persona). *No Agno, No LangChain, No Vercel AI SDK.*
* **Security:** Every query must enforce `.eq('photographer_id', tenantId)`.

---

## 3. THE EXECUTION ROADMAP

### [ ] PHASE 1: FOUNDATION (Database & Contracts)
**Goal:** Lock in the data layer and strict TypeScript types.
* **Step 1A:** Run SQL migrations for `memories`, `thread_summaries`, add `photographer_id` to `threads`, and fix `tasks` RLS.
* **Step 1B:** Create `src/types/agent.types.ts` (`AgentContext`, `AgentResult`).
* **Step 1C:** Create `supabase/functions/_shared/tools/schemas.ts` (Zod schemas for mocked tools).

### [ ] PHASE 2: THE MEMORY ENGINE
**Goal:** Build the token-efficient context assembly pipeline.
* **Step 2A:** Build the Header-Scan utility (`fetchMemoryHeaders.ts`). Queries `memories` for `id, title, summary` only.
* **Step 2B:** Build the Rolling Summary utility (`fetchThreadSummary.ts`).
* **Step 2C:** Build `buildAgentContext.ts`. This utility calls the previous functions, fetches the CRM state, and outputs the strict `AgentContext` object.

### [ ] PHASE 3: SPECIALIST TOOLS (Zod + OpenAI)
**Goal:** Wrap existing mocked logic into modular, callable tools.
* **Step 3A:** Build `calendarTool.ts` (Mocked Google Calendar availability).
* **Step 3B:** Build `travelTool.ts` (Mocked Amadeus flight/hotel costs).
* **Step 3C:** Build `crmTool.ts` (Functions to update project stages).
* *Rule:* Tools must return JSON. They must catch errors and return them gracefully to the Orchestrator, NEVER crashing the runtime.

### [ ] PHASE 4: THE ORCHESTRATOR LOOP (Inngest)
**Goal:** The central brain that decides what to do.
* **Step 4A:** Scaffold `whatsapp.received.v2` in Inngest.
* **Step 4B:** Implement the `Reason -> Act -> Observe` loop using OpenAI Chat Completions.
* **Step 4C:** Configure the Orchestrator to batch tool calls (e.g., checking calendar and flights in the same turn).

### [ ] PHASE 5: THE PERSONA AGENT & APPROVAL
**Goal:** The luxury voice and human safety net.
* **Step 5A:** Build `personaAgent.ts` (Anthropic). Takes the Orchestrator's verified facts and drafts the high-end response.
* **Step 5B:** Wire the output to insert into the `drafts` table with `status: pending_approval`.
* **Step 5C:** Verify the frontend/webhook approval loop successfully pushes the draft to Twilio/Meta.

### [ ] PHASE 6: INTERNAL CALENDAR & SCHEDULING
**Goal:** Replace external booking tools with a native, tenant-scoped calendar.
* **Step 6A:** Run SQL migrations for `calendar_events` and `wedding_milestones`.
* **Step 6B:** Build `calendarAgent.ts` tool. Allows the Orchestrator to read availability, book slots, and generate secure `app.domain.com/book/{wedding_id}` links.
* **Step 6C:** Build the Inngest functions for Meeting Reminders (`event.reminder.24h` and `event.reminder.1h`). These trigger based on `start_time`.

### [ ] PHASE 7: PROACTIVE CHECKLIST ORCHESTRATOR
**Goal:** Implement the time-based State Machine for pre- and post-wedding tasks.
* **Step 7A:** Build the "Booking Phase" Inngest flow (Send Agreement -> Sleep 3 Days -> Follow Up if `retainer_paid` is false).
* **Step 7B:** Build the "Prep Phase" Inngest flow (Calculate `wedding_date - 2 months` -> Send Questionnaire/Invoice -> Sleep 5 days -> Follow up).
* **Step 7C:** Build the "Post-Wedding" flow (Gallery delivery emails, Anniversary cron job).

---

## 4. AI INSTRUCTIONS (HOW TO READ THIS FILE)
When this file is provided in a prompt:
1. Identify which Phase and Step we are currently on.
2. Review `@ARCHITECTURE.md` and `@DATABASE_SCHEMA.md` to ensure compliance.
3. Write ONLY the code required for the current Step. 
4. Output code in small, organized, modular files. 
5. Ask for verification before moving to the next Step.

## 5. AI INSTRUCTION
Prompt Library: When writing LLM API calls, strictly use the exact string literals found in PROMPTS.md. Do not hallucinate, invent, or summarize system prompts.