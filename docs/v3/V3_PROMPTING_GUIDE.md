# ATELIER OS V3 PROMPTING GUIDE

## 1. Purpose

This file shows how to prompt a vibecoding agent without overwhelming it.

The most important rule:

Do not ask for a whole phase or a whole subsystem at once.

Ask for one narrow, verifiable slice.

## 2. The Best Prompt Formula

Use this structure:

1. say the exact phase and step
2. say which docs to read
3. say which files may be touched
4. say what must not be changed
5. say the concrete done condition

Good prompt shape:

```text
Implement only Phase X / Step Y from docs/v3/execute_v3.md.

Before coding, read only:
- docs/v3/V3_BUILD_INDEX.md for this phase
- docs/v3/execute_v3.md section for this phase
- docs/v3/DATABASE_SCHEMA.md relevant table sections
- docs/v3/ARCHITECTURE.md relevant runtime rules

Touch only:
- file A
- file B

Do not change:
- unrelated workers
- frontend
- legacy routes

Done means:
- exact result 1
- exact result 2

Stop after this slice and summarize what remains next.
```

## 3. Rules For Prompting Cursor

- always name the phase
- always limit the file scope
- always say what not to touch
- always ask for one slice only
- always ask it to stop after that slice
- always tell it to read `docs/v3/V3_BUILD_INDEX.md` first

Avoid prompts like:

- "build v3"
- "implement the architecture"
- "fix all the docs and code"
- "add the agent system"

Those are too broad and invite hallucination.

## 4. Copy-Paste Prompt Templates

### Template A: Schema Slice

Use when adding one migration or one table.

```text
Implement one schema slice only.

Read first:
- docs/v3/V3_BUILD_INDEX.md for Phase 2
- docs/v3/execute_v3.md Phase 2
- docs/v3/DATABASE_SCHEMA.md only the relevant table sections

Task:
Add only [TABLE / COLUMN / CONSTRAINT].

Touch only:
- supabase/migrations/*
- src/types/database.types.ts if regeneration is needed

Do not change:
- workers
- frontend
- unrelated tables

Done means:
- migration exists
- schema matches the docs
- no duplicate or overlapping table was invented

Stop after this slice and tell me the next smallest safe schema slice.
```

### Template B: Helper Slice

Use when building one shared helper.

```text
Implement one shared helper only.

Read first:
- docs/v3/V3_BUILD_INDEX.md for Phase [X]
- docs/v3/execute_v3.md Phase [X]
- docs/v3/ARCHITECTURE.md only the relevant rule sections

Task:
Create only [HELPER NAME] for [PURPOSE].

Touch only:
- [helper file]
- [one caller file if needed]

Do not change:
- unrelated workers
- prompts
- UI

Done means:
- one shared helper exists
- one narrow caller uses it if needed
- no duplicate helper logic was created elsewhere

Stop after this slice.
```

### Template C: Tool Slice

Use when adding one tool.

```text
Implement one tool slice only.

Read first:
- docs/v3/V3_BUILD_INDEX.md for Phase 6
- docs/v3/execute_v3.md Phase 6
- docs/v3/ARCHITECTURE.md sections on Agent vs Tool vs Worker and Decision Modes
- docs/v3/V3_OVERVIEW.md Tool Layer

Task:
Create only [TOOL NAME].

The tool must define clearly:
- what it reads
- what it writes
- whether it is read-only or write-capable
- whether verifier approval is required

Touch only:
- tool schema file
- tool implementation file
- one narrow caller if needed

Do not create:
- a new agent
- a new worker
- overlapping tools

Stop after this slice and summarize how this tool fits the existing tool layer.
```

### Template D: Worker Refactor Slice

Use when changing one worker.

```text
Refactor one worker slice only.

Read first:
- docs/v3/V3_BUILD_INDEX.md for Phase [X]
- docs/v3/execute_v3.md Phase [X]
- docs/v3/ARCHITECTURE.md relevant runtime rules

Task:
Refactor only [WORKER NAME] to use [HELPER / TOOL / CONTEXT BUILDER].

Touch only:
- the worker file
- the shared helper it now depends on

Do not change:
- other workers
- event contracts unless required by this exact slice
- frontend

Done means:
- this worker now follows the new contract
- legacy compatibility is preserved

Stop after this slice.
```

### Template E: UI Slice

Use when changing one operator-facing page or panel.

```text
Implement one UI slice only.

Read first:
- docs/v3/V3_BUILD_INDEX.md for Phase 11
- docs/v3/execute_v3.md Phase 11
- docs/v3/V3_OVERVIEW.md onboarding or API sections if relevant

Task:
Update only [PAGE / COMPONENT] for [ONE FEATURE].

Touch only:
- [component]
- [hook]

Do not change:
- backend contracts
- unrelated pages
- broad styling

Done means:
- the UI exposes exactly this control
- no broad visual refactor happened

Stop after this slice.
```

## 5. Example Prompts For Your Project

### Example 1: Add `studio_business_profiles`

```text
Implement only the Phase 2 schema slice for `studio_business_profiles`.

Before coding, read only:
- docs/v3/V3_BUILD_INDEX.md for Phase 2
- docs/v3/execute_v3.md Phase 2
- docs/v3/DATABASE_SCHEMA.md section 5.1A

Touch only:
- supabase/migrations/*
- src/types/database.types.ts if regeneration is needed

Do not change:
- workers
- frontend
- playbook logic

Done means:
- the table exists as documented
- it has the documented columns
- no overlapping duplicate business-profile table is created

Stop after this slice and recommend the next smallest schema slice.
```

### Example 2: Build `toolVerifier`

```text
Implement only the first safe slice of `toolVerifier`.

Before coding, read only:
- docs/v3/V3_BUILD_INDEX.md for Phase 6
- docs/v3/execute_v3.md Phase 6
- docs/v3/ARCHITECTURE.md sections on Decision Modes, Decision Authority Contract, and Escalation Model
- docs/v3/V3_OVERVIEW.md Tool Layer

Touch only:
- tool schema file
- tool implementation file
- one narrow test or caller if needed

Do not create:
- a new agent
- a new worker
- unrelated tools

Done means:
- verifier input and output are structured
- it can resolve auto / draft_only / ask_first / forbidden for one narrow action set

Stop after this slice.
```

### Example 3: Refactor WhatsApp Lane

```text
Implement only the first operator-lane slice of Phase 8.

Before coding, read only:
- docs/v3/V3_BUILD_INDEX.md for Phase 8
- docs/v3/execute_v3.md Phase 8
- docs/v3/ARCHITECTURE.md Channel Model and Escalation Model
- docs/v3/V3_OVERVIEW.md sections on `webhook-whatsapp` and Escalation Operator

Touch only:
- supabase/functions/webhook-whatsapp/index.ts
- one shared settings helper if required

Do not change:
- client email/web routing
- other workers
- persona

Done means:
- photographer identity is resolved through the operator contract
- non-operator WhatsApp does not enter the new operator lane

Stop after this slice.
```

## 6. What To Say When You Want Review Instead Of Coding

Use prompts like:

```text
Do not code yet.
Review only Phase 5 against the current repo.
Read only the sections listed in docs/v3/V3_BUILD_INDEX.md for Phase 5.
Tell me:
- what already exists
- what is missing
- what the smallest safe first implementation slice is
```

## 7. What To Avoid Saying

Avoid:

- "build the full feature"
- "make it production-ready"
- "handle everything"
- "finish this phase"
- "do whatever is needed"

These invite the agent to overreach.

## 8. The Golden Habit

The safest rhythm is:

1. ask for one slice
2. inspect the result
3. ask for the next slice
4. keep the scope narrow

That is how you get reliable vibecoding instead of drift.
