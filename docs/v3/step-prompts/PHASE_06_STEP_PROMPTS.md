# PHASE 6 STEP PROMPTS

## Step 6A

```text
Implement only Step 6A from docs/v3/execute_v3.md.

Task:
Keep and improve strict Zod schemas in the shared tool schema file.

Touch only:
- supabase/functions/_shared/tools/schemas.ts

Do not implement multiple tools yet.

Stop after Step 6A.
```

## Step 6B

```text
Implement only Step 6B from docs/v3/execute_v3.md.

Task:
Add only one target tool from this list:
- toolCalculator
- toolOperator
- toolVerifier
- toolEscalate
- toolArchivist
- toolDocuments
- toolAudienceCheck

Touch only the schema and implementation files needed for that one tool.

Stop after Step 6B.
```

## Step 6C

```text
Implement only Step 6C from docs/v3/execute_v3.md.

Task:
Apply the shared tool rules to one tool only:
- structured data only
- no client-facing prose
- no silent conflict handling
- write-capable tools must respect decision_mode
- risky tools need structured decision justification

Touch only one tool slice.

Stop after Step 6C.
```

## Step 6D

```text
Implement only Step 6D from docs/v3/execute_v3.md.

Task:
Implement one narrow verifier rule in toolVerifier.

Choose one:
- evidence sufficiency
- audience safety
- broadcast risk
- playbook rules
- pause flags
- agency_cc_lock
- visual-review block
- banking-exception handling

Do not try to build the full verifier in one pass.

Stop after Step 6D.
```

## Step 6D.1

```text
Implement only Step 6D.1 from docs/v3/execute_v3.md.

Task:
Require blocked or approval-seeking actions to produce one escalation-ready structured shape.

Touch only:
- the relevant tool schema
- one caller if needed

Do not create a full escalation system in this slice.

Stop after Step 6D.1.
```

## Step 6E

```text
Implement only Step 6E from docs/v3/execute_v3.md.

Task:
Clarify ownership for one tool only:
- what it reads
- what it writes
- whether it is read-only or write-capable
- whether verifier approval is needed
- which roles may call it

Touch only that tool's contract or implementation files.

Stop after Step 6E.
```
