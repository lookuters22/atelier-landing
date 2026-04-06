# PHASE 6.5 STEP PROMPTS

## Step 6.5A

```text
Implement only Step 6.5A from docs/v3/execute_v3.md.

Task:
Define the target role set in code or configuration without adding more roles than planned.

Touch only the role contract or prompt config files needed.

Stop after Step 6.5A.
```

## Step 6.5B

```text
Implement only Step 6.5B from docs/v3/execute_v3.md.

Task:
Define the contract for one role only:
- allowed inputs
- allowed memory layers
- callable tools
- proposable actions
- directly executable actions if any

Touch only one role contract file.

Stop after Step 6.5B.
```

## Step 6.5C

```text
Implement only Step 6.5C from docs/v3/execute_v3.md.

Task:
Tighten the writer boundary so it receives only:
- approved factual output
- narrow personalization context
- limited continuity memory

Touch only the writer/persona input boundary.

Stop after Step 6.5C.
```

## Step 6.5D

```text
Implement only Step 6.5D from docs/v3/execute_v3.md.

Task:
Keep the orchestrator and verifier as heavy-context roles.

Refactor one role input path so it receives selectedMemories, globalKnowledge, playbook rules, audience state, and escalation state correctly.

Touch only one role path.

Stop after Step 6.5D.
```

## Step 6.5E

```text
Implement only Step 6.5E from docs/v3/execute_v3.md.

Task:
If a future specialist is being added, define its context contract first and do not give it broad unrestricted context.

If no specialist is being added in this slice, verify that no accidental specialist creep is happening and stop.
```

## Step 6.5F

```text
Implement only Step 6.5F from docs/v3/execute_v3.md.

Task:
Keep sensitive-data flows narrow.

Refactor one path so normal writer or orchestrator prompts do not receive unrestricted high-risk PII.

Touch only the narrow files needed.

Stop after Step 6.5F.
```

## Step 6.5G

```text
Implement only Step 6.5G from docs/v3/execute_v3.md.

Task:
Make role and authority checks first-class for one authority area:
- visible sender
- planner
- payer
- billing contact
- logistics contact
- approval contact

Touch only one authority-resolution slice.

Stop after Step 6.5G.
```

## Step 6.5H

```text
Implement only Step 6.5H from docs/v3/execute_v3.md.

Task:
Make the implementation split explicit:
- agents are reasoning roles
- tools are bounded capabilities
- workers are runtime units

Refactor one blurry boundary so it follows this split correctly.

Stop after Step 6.5H.
```
