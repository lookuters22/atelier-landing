# PHASE 5 STEP PROMPTS

## Step 5A

```text
Implement only Step 5A from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 5
- docs/v3/execute_v3.md Step 5A
- docs/v3/ARCHITECTURE.md memory and audience sections

Task:
Create or extend the shared decision context builder only.

Touch only:
- the context builder file
- one shared type file if needed

Do not change workers yet.

Stop after Step 5A.
```

## Step 5B

```text
Implement only Step 5B from docs/v3/execute_v3.md.

Task:
Add only one context input slice to the builder, such as:
- business profile
- audience facts
- selected memories
- playbook rules
- global knowledge
- documents and attachments

Touch only the builder and one retrieval helper if needed.

Stop after Step 5B.
```

## Step 5C

```text
Implement only Step 5C from docs/v3/execute_v3.md.

Task:
Preserve the header-scan pattern for long memory.

Implement only one retrieval stage:
- header scan
- selected full memory fetch
- selected full knowledge fetch

Do not build all stages at once.

Stop after Step 5C.
```

## Step 5D

```text
Implement only Step 5D from docs/v3/execute_v3.md.

Task:
Move one worker off ad hoc context assembly and onto the shared decision context builder.

Touch only:
- one worker
- the shared builder if needed

Do not refactor multiple workers in one pass.

Stop after Step 5D.
```

## Step 5E

```text
Implement only Step 5E from docs/v3/execute_v3.md.

Task:
Add one focused verification test for the context builder.

Choose one:
- selectedMemories promotion
- globalKnowledge retrieval
- audience facts injection
- authority role resolution
- operator-injected context merge

Touch only one test file and the minimum runtime code needed.

Stop after Step 5E.
```

## Step 5F

```text
Implement only Step 5F from docs/v3/execute_v3.md.

Task:
Make the decision-context contract explicit in code as one typed object owned by one helper.

Touch only:
- the context type
- the builder
- one narrow caller if needed

Do not let each worker build its own custom context shape.

Stop after Step 5F.
```

## Step 5G

```text
Implement only Step 5G from docs/v3/execute_v3.md.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 5
- docs/v3/execute_v3.md Step 5G
- docs/v3/DATABASE_SCHEMA.md section 3 Universal Rules

Task:
Make the decision context builder tenant-safe by construction.

For this slice:
- require resolved tenant identity as input
- ensure the builder does not return mixed-tenant data

Touch only:
- the context builder
- one shared type or helper if needed

Do not refactor unrelated workers in this pass.

Stop after Step 5G.
```
