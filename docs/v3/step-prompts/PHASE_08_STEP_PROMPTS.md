# PHASE 8 STEP PROMPTS

## Step 8A

```text
Implement only Step 8A from docs/v3/execute_v3.md.

Task:
Rewrite the WhatsApp contract so it is operator-lane focused.

Touch only the contract or event-shape files needed for this boundary.

Do not touch client email/web routing.

Stop after Step 8A.
```

## Step 8B

```text
Implement only Step 8B from docs/v3/execute_v3.md.

Task:
Refactor webhook-whatsapp only for:
- sender normalization
- admin_mobile_number comparison
- non-operator rejection or ignore
- raw payload persistence
- operator event emission

Do not mix in client WhatsApp support.

Stop after Step 8B.
```

## Step 8C

```text
Implement only Step 8C from docs/v3/execute_v3.md.

Task:
Replace the old internal concierge model with one narrow operator orchestrator capability.

Choose one:
- accept commands
- answer from verified data
- ask short blocked-action questions
- capture answers into escalation_requests

Stop after Step 8C.
```

## Step 8D

```text
Implement only Step 8D from docs/v3/execute_v3.md.

Task:
Do not mix operator WhatsApp with client WhatsApp routing in the same event names.

Refactor only the event naming or routing boundary needed to enforce that.

Stop after Step 8D.
```

## Step 8E

```text
Implement only Step 8E from docs/v3/execute_v3.md.

Task:
Add operator escalation triage for one delivery policy branch:
- urgent now
- batch later
- dashboard only

Stop after Step 8E.
```

## Step 8F

```text
Implement only Step 8F from docs/v3/execute_v3.md.

Task:
Make escalation phrasing consistent:
- short
- specific
- operational
- one decision at a time

Refactor only one escalation formatting path.

Stop after Step 8F.
```
