# PHASE 9 STEP PROMPTS

## Step 9A

```text
Implement only Step 9A from docs/v3/execute_v3.md.

Task:
When the photographer answers an escalation, classify only one result path:
- one-off case decision
- reusable global or channel-wide playbook rule

Touch only one classifier slice.

Stop after Step 9A.
```

## Step 9B

```text
Implement only Step 9B from docs/v3/execute_v3.md.

Task:
Implement one writeback branch only:
- reusable -> playbook_rules
- one-off -> memories

Do not implement both branches at once unless they share one small helper.

Stop after Step 9B.
```

## Step 9B.1

```text
Implement only Step 9B.1 from docs/v3/execute_v3.md.

Task:
Store approved answers through the strict resolution rule for one storage target only:
- playbook_rules
- memories
- documents with audit link
- unresolved open state

Stop after Step 9B.1.
```

## Step 9C

```text
Implement only Step 9C from docs/v3/execute_v3.md.

Task:
Capture approval edits and rewrite feedback as learning inputs without auto-promoting them to global rules.

Touch only the learning input path.

Stop after Step 9C.
```

## Step 9D

```text
Implement only Step 9D from docs/v3/execute_v3.md.

Task:
Add the review gate for repeated new patterns.

Do not create new categories from a single weird thread.

Touch only the minimal classification or review logic.

Stop after Step 9D.
```

## Step 9E

```text
Implement only Step 9E from docs/v3/execute_v3.md.

Task:
Ensure learning writeback stores the result in one primary place only.

Refactor only one duplicated-decision path to obey this rule.

Stop after Step 9E.
```
