# PHASE 8 PROMPTS

Use for the operator WhatsApp lane.

## Prompt A: WhatsApp Ingress Slice

```text
Implement only one Phase 8 WhatsApp slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 8
- docs/v3/execute_v3.md Phase 8
- docs/v3/ARCHITECTURE.md Channel Model

Task:
Refactor only the operator identity portion of `webhook-whatsapp`.

Touch only:
- supabase/functions/webhook-whatsapp/index.ts
- one settings helper if required

Do not change:
- client email/web routing
- persona
- unrelated workers

Stop after this slice.
```

## Prompt B: Escalation Delivery Slice

```text
Implement only one Phase 8 escalation-delivery slice.

Read only:
- docs/v3/V3_QUICKSTART.md
- docs/v3/V3_BUILD_INDEX.md for Phase 8
- docs/v3/execute_v3.md Phase 8
- docs/v3/ARCHITECTURE.md Escalation Model

Task:
Implement only the delivery policy for [urgent now / batch later / dashboard only].

Touch only:
- one operator-lane file
- one shared escalation helper if needed

Do not create:
- separate workers for each escalation type

Stop after this slice.
```
