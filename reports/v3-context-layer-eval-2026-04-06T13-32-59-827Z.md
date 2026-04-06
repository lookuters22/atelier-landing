# V3 context-layer evaluation

- **Generated:** 2026-04-06T13:32:59.828Z
- **Batch:** CTXEVAL-1775481849488

## Conditions

| Cond | Layers (summary) | Commercial tone | Insurance notes | Pass/fail notes |
|------|------------------|-----------------|-------------------|----------------|
| **A** | {"crm":true,"playbook_rules":false,"case_memory":false,"continuity_injected":fal… | hedge | hedge | PASS-ish: CRM-only hedges unverified Elite name; check riskFlags for invented %. |
| **B** | {"crm":true,"playbook_rules":true,"case_memory":false,"continuity_injected":fals… | confirm | mixed | Expect: confident commercial reply when playbook includes Elite (B/C/D). |
| **C** | {"crm":true,"playbook_rules":true,"case_memory":true,"continuity_injected":false… | confirm | clarify | Expect: confident commercial reply when playbook includes Elite (B/C/D). |
| **D** | {"crm":true,"playbook_rules":true,"case_memory":true,"continuity_injected":true}… | confirm | hedge | Expect: confident commercial reply when playbook includes Elite (B/C/D). |
| **E** | {"crm":true,"playbook_rules":true,"case_memory":true,"continuity_injected":false… | confirm | hedge | FAIL: E (no Elite playbook row) should not confirm Elite+30 like verified package. |

## What each layer contributes (observed)

- **CRM:** Always present via `weddings` row — anchors date/location/couple in Authoritative CRM block.
- **playbook_rules:** Supplies verified policy text in persona rewrite facts; without Elite row (E), replies should not treat Elite as verified.
- **Case memory:** Header summaries in writer facts — nuance on top of playbook.
- **Continuity (D):** `thread_summaries` + synthetic messages — may increase thread-awareness if visible before DC build (best-effort).

## Next optimization

If D’s continuity injection races, add a deterministic delay or a dedicated ‘pause until injected’ gate; if A still confirms Elite, tighten writer when playbook_rules blob is empty.

## Full JSON

See `C:\Users\Despot\Desktop\wedding\reports\v3-context-layer-eval-2026-04-06T13-32-59-827Z.json`.