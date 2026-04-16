# ATELIER OS V3 BUILD INDEX

## 1. Purpose

This file exists to keep AI coding scoped.

The full V3 docs are intentionally detailed.
The coding agent should not read all of them in full for every small change.

Use this index to decide:

- which phase you are working on
- which doc sections to read first
- which repo areas are likely relevant
- what "done" means for that slice

## 2. How To Use This File

For any implementation slice:

1. pick one phase
2. read only the sections listed for that phase
3. inspect the matching repo files
4. implement one narrow slice
5. stop after the slice is complete

Do not ask Cursor to "implement all of V3."

## 3. Fast Doc Map

- high-level explanation: `docs/v3/V3_OVERVIEW.md`
- architecture rules: `docs/v3/ARCHITECTURE.md`
- schema contracts: `docs/v3/DATABASE_SCHEMA.md`
- implementation roadmap: `docs/v3/execute_v3.md`
- Cursor behavior rules: `docs/v3/.cursorrules`

## 4. Phase-by-Phase Reading Guide

### Phase 0: Truth Sync And Safety Baseline

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 0`
- `docs/v3/DATABASE_SCHEMA.md`:
  - `## 2. Current Repo Truth`
  - `## 3. Universal Rules`
- `docs/v3/ARCHITECTURE.md`:
  - `## 2. Current Repo Truth`

Likely repo focus:

- `supabase/migrations/*`
- `src/types/database.types.ts`
- any helpers or workers with stale assumptions

Done means:

- truth is aligned
- stale assumptions are identified or fixed in one narrow slice
- no new architecture is invented

### Phase 1: Photographer Settings And Operator Identity

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 1`
- `docs/v3/DATABASE_SCHEMA.md`:
  - `## 5.1 photographers`
- `docs/v3/ARCHITECTURE.md`:
  - `## 7. Channel Model`
  - `## 10. Onboarding`

Likely repo focus:

- settings helpers
- `src/pages/settings/SettingsHubPage.tsx`
- WhatsApp identity helpers

Done means:

- settings contract is explicit
- legacy `whatsapp_number` is preserved
- `admin_mobile_number` path is introduced cleanly

### Phase 2: Schema Foundation

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 2`
- `docs/v3/DATABASE_SCHEMA.md`:
  - `## 4. Canonical Enums`
  - `## 5.1A` through `## 5.19`
  - `## 6. Insert And Update Rules For AI Coding`
- `docs/v3/ARCHITECTURE.md`:
  - `## 8. Identity, Audience, and Dedupe Model`

Likely repo focus:

- new migrations only
- generated database types after migration

Done means:

- additive schema exists
- constraints exist
- no duplicate overlapping tables were invented

### Phase 3: Deterministic Identity And Dedupe

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 3`
- `docs/v3/DATABASE_SCHEMA.md`:
  - `## 5.3 people`
  - `## 5.4 contact_points`
  - `## 5.8 thread_weddings`
  - `## 5.9 thread_participants`
  - `## 6. Insert And Update Rules For AI Coding`
- `docs/v3/ARCHITECTURE.md`:
  - `## 8. Identity, Audience, and Dedupe Model`

Likely repo focus:

- normalization helpers
- resolvers
- shared identity utilities

Done means:

- matching logic is centralized
- workers are not creating duplicate people or threads ad hoc

### Phase 4: Onboarding And Playbook Seeding

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 4`
- `docs/v3/ARCHITECTURE.md`:
  - `### Photographer Preference Categories`
  - `### Studio Business Profile Categories`
  - `## 6. Decision Modes`
  - `## 10. Onboarding`
- `docs/v3/DATABASE_SCHEMA.md`:
  - `## 5.1 photographers`
  - `## 5.1A studio_business_profiles`
  - `## 5.17 playbook_rules`
- `docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md`
- the exact `docs/v3/ONBOARDING_BRIEFING_SLICE_*.md` file for the current slice

Likely repo focus:

- onboarding payload shape
- settings persistence
- business profile persistence
- playbook persistence

Done means:

- onboarding maps to structured storage
- no giant freeform questionnaire blob is treated as complete

### Phase 5: Decision Context Builder

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 5`
- `docs/v3/ARCHITECTURE.md`:
  - `## 8. Identity, Audience, and Dedupe Model`
  - `## 9. Memory Model`
- `docs/v3/DATABASE_SCHEMA.md`:
  - `## 5.7 threads`
  - `## 5.9 thread_participants`
  - `## 5.11 message_attachments`
  - `## 5.14 knowledge_base`
  - `## 5.15 memories`
  - `## 5.16 thread_summaries`

Likely repo focus:

- shared context builder
- retrieval helpers
- audience facts

Done means:

- one typed decision context object exists
- workers do not build their own random context shapes

### Phase 6: Strict Tool Layer

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 6`
- `docs/v3/ARCHITECTURE.md`:
  - `### Agent vs Tool vs Worker`
  - `## 6. Decision Modes`
  - `## 11. Escalation Model`
- `docs/v3/V3_OVERVIEW.md`:
  - `## 11. The Tool Layer`

Likely repo focus:

- tool schemas
- tool implementations
- verifier contract

Done means:

- tools have clear ownership
- risky tools require structured justification
- verifier is mandatory before execution

### Phase 6.5: Agent Role Split

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 6.5`
- `docs/v3/ARCHITECTURE.md`:
  - `### Multi-Agent Stance`
  - `### Agent vs Tool vs Worker`
  - `### Memory Distribution By Agent Role`
- `docs/v3/V3_OVERVIEW.md`:
  - `## 12. Workers And Runtime Units`
  - `## 13. The Orchestration Brain And The Agent Roles`

Likely repo focus:

- prompt boundaries
- context contracts
- role wiring

Done means:

- orchestrator, verifier, and writer are distinct
- extra specialization goes into tools first, not more agents

### Phase 7: Action-Based Orchestration

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 7`
- `docs/v3/ARCHITECTURE.md`:
  - `### The Output of Reasoning Is Not An "Intent"`
  - `## 6. Decision Modes`
- `docs/v3/V3_OVERVIEW.md`:
  - `## 13. The Orchestration Brain And The Agent Roles`
  - `## 14. How The Parts Work Together`

Likely repo focus:

- Inngest events
- orchestrator worker
- approval/outbound handoff

Done means:

- action proposals replace brittle intent routing on the new path
- legacy path still remains until cutover criteria pass

### Phase 8: Operator WhatsApp Lane

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 8`
- `docs/v3/ARCHITECTURE.md`:
  - `## 7. Channel Model`
  - `## 11. Escalation Model`
- `docs/v3/V3_OVERVIEW.md`:
  - `### \`webhook-whatsapp\``
  - `### Escalation Operator`

Likely repo focus:

- `webhook-whatsapp`
- operator orchestrator
- escalation delivery policy

Done means:

- WhatsApp is operator-only on the new path
- escalation triage exists

### Phase 9: Learning Loop

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 9`
- `docs/v3/ARCHITECTURE.md`:
  - `## 12. Learning Model`
- `docs/v3/DATABASE_SCHEMA.md`:
  - `## 5.15 memories`
  - `## 5.17 playbook_rules`
  - `## 5.18 escalation_requests`

Likely repo focus:

- resolution writeback
- promotion rules
- memory vs playbook separation

Done means:

- reusable answers go one place
- one-off answers go one place
- decisions do not get duplicated sloppily

### Phase 10: Proactive Automation And Pause Guards

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 10`
- `docs/v3/ARCHITECTURE.md`:
  - `## 13. Proactive Automation and Pauses`
- `docs/v3/DATABASE_SCHEMA.md`:
  - `## 5.2 weddings`
  - `## 5.13 tasks`
  - `## 5.21 wedding_milestones`

Likely repo focus:

- sleeper workers
- pause checks
- `awaiting_reply` handling

Done means:

- sleepers re-check state after waking
- no invented timers
- deferrals do not accidentally close waiting tasks

### Phase 11: Frontend Operator Surfaces

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 11`
- `docs/v3/V3_OVERVIEW.md`:
  - `## 15. The Onboarding Process`
  - `## 10. Internal APIs And Worker Entry Points`
- `docs/v3/ONBOARDING_BRIEFING_MASTER_PLAN.md`
- the exact `docs/v3/ONBOARDING_BRIEFING_SLICE_*.md` file for the current slice
- for the experience-layer rebuild:
  - `docs/v3/ONBOARDING_EXPERIENCE_REDESIGN_MASTER_PLAN.md`
  - the exact `docs/v3/ONBOARDING_EXPERIENCE_REDESIGN_SLICE_*.md` file for the current slice

Likely repo focus:

- settings UI
- onboarding UI
- approvals UI
- escalation queues

Done means:

- operator can see and control what matters
- UI reflects real runtime states

### Phase 11.5: Observability & Telemetry

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 11.5`
- `docs/v3/ARCHITECTURE.md`:
  - `## 15. Non-Negotiables`

Likely repo focus:

- logging
- metrics table or dashboards
- structured event logging

Done means:

- block, escalation, idempotency, and playbook usage are measurable

### Phase 12: Backfill And Stress Tests

Read first:

- `docs/v3/execute_v3.md`:
  - `## [ ] Phase 12`
- `docs/v3/V3_OVERVIEW.md`:
  - `## 16. Use Cases`
- stress-test transcripts as needed

Likely repo focus:

- replay scripts
- QA scenarios
- backfill scripts

Done means:

- real-thread replays pass
- the new path is stable enough for cutover

## 5. Golden Rule

If the requested change feels bigger than one phase slice, it is too big for one vibecoding pass.
