# PHASE 10 STEP PROMPTS

## Step 10A

```text
Implement only Step 10A from docs/v3/execute_v3.md.

Task:
Add the wedding pause columns if they are not already migrated.

Touch only:
- one migration
- generated types if needed

Stop after Step 10A.
```

## Step 10B

```text
Implement only Step 10B from docs/v3/execute_v3.md.

Task:
Patch only one sleeper worker from this list:
- milestoneFollowups.ts
- prepPhaseFollowups.ts
- postWeddingFlow.ts
- calendarReminders.ts

Do not patch all sleepers at once.

Stop after Step 10B.
```

## Step 10C

```text
Implement only Step 10C from docs/v3/execute_v3.md.

Task:
After every sleep boundary, re-query wedding state and re-check pause flags.

Patch only one wake-up boundary in one worker.

Stop after Step 10C.
```

## Step 10D

```text
Implement only Step 10D from docs/v3/execute_v3.md.

Task:
Support one approved follow-up shape only:
- update a wedding milestone boolean
- create a standard task row with due_date
- awaiting_reply classification for answer/deferral/unresolved

Do not invent arbitrary timers.

Stop after Step 10D.
```
