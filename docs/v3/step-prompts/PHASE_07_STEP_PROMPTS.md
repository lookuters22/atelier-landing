# PHASE 7 STEP PROMPTS

## Step 7A

```text
Implement only Step 7A from docs/v3/execute_v3.md.

Task:
Add the event versioning contract for one event path only.

Touch only:
- shared Inngest event schema
- one sender or receiver if needed

Do not remove old events.

Stop after Step 7A.
```

## Step 7B

```text
Implement only Step 7B from docs/v3/execute_v3.md.

Task:
Introduce the new main client orchestrator for one narrow behavior only:
- build decision context
- propose candidate actions
- call strict tools
- verify before act

Do not implement all behaviors in one pass.

Stop after Step 7B.
```

## Step 7C

```text
Implement only Step 7C from docs/v3/execute_v3.md.

Task:
Keep the approval loop in place and enforce one idempotency safeguard:
- duplicate approvals do not send twice
- worker retries do not send twice
- provider callbacks do not duplicate outbound
- stale drafts are rejected

Touch only one safeguard path.

Stop after Step 7C.
```

## Step 7D

```text
Implement only Step 7D from docs/v3/execute_v3.md.

Task:
Touch only the current files likely needed for this orchestration slice.

Do not expand into unrelated files.

Stop after Step 7D.
```

## Step 7E

```text
Implement only Step 7E from docs/v3/execute_v3.md.

Task:
Preserve legacy routing until cutover criteria pass.

If this slice would cut over the new path too early, stop and keep the old path in place.

Stop after Step 7E.
```
