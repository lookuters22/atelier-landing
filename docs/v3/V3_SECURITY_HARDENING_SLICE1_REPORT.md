# V3 security hardening — slice 1 (audit + narrow fixes)

**Date:** 2026-04-06  
**Scope:** Prompt-boundary hygiene, tenant-scoped message reads, escalation payload bounds, inbound blob handling — without platform redesign.

## Summary

This slice documents where sensitive context flows in V3 and applies **small, testable** mitigations: cap/scrub inbound text before model-facing strings, enforce `photographer_id` on message queries where the column exists, and cap auditor violation snippets in operator escalations.

## Findings (audit)

### Orchestrator prompt context

- **Client orchestrator V1** is largely **deterministic** (proposals + `toolVerifier`); it does not send full `AgentContext` to a large model on the main path.
- **[`sanitizeAgentContextForOrchestratorPrompt.ts`](../../supabase/functions/_shared/memory/sanitizeAgentContextForOrchestratorPrompt.ts)** is used on **operator WhatsApp** paths (e.g. [`whatsappOrchestrator.ts`](../../supabase/functions/inngest/functions/whatsappOrchestrator.ts)): it already strips message bodies from recent messages and omits `full_content` from selected memories. **Gap addressed in this slice:** rolling **thread summary** can still contain pasted noise; it is now passed through the same inbound sanitizer before truncation.

### Writer / persona payload

- **[`personaAgent.ts`](../../supabase/functions/_shared/persona/personaAgent.ts)** intentionally avoids dumping full `AgentContext`; orchestrator rewrite uses **[`buildOrchestratorFactsForPersonaWriter`](../../supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)**.
- **Gaps addressed:**
  - **Client inbound** and **continuity** message bodies could include huge pasted/binary content — now sanitized via `sanitizeInboundTextForModelContext` before embedding in facts and continuity blocks.
  - **[`buildPersonaRawFactsFromThread`](../../supabase/functions/_shared/memory/buildPersonaRawFacts.ts)** (QA / legacy persona flows) loaded messages by `thread_id` only — now requires **thread ownership** + **`messages.photographer_id`** filter.

### Escalation payloads

- **[`recordV3OutputAuditorEscalation.ts`](../../supabase/functions/_shared/orchestrator/recordV3OutputAuditorEscalation.ts)** sends auditor violations to the operator channel. Violations are deterministic strings, but **unbounded length** could bloat WhatsApp/delivery payloads. **Per-violation caps** added before `formatOperatorEscalationQuestion` and `decision_justification`.

### Attachments / documents / compliance

- **No dedicated attachment object** is threaded into V3 persona facts in this repo path; inbound is still **text** on `messages.body`. **Residual risk:** email ingress could store a very large or odd `body`; **mitigation:** global sanitizer + truncation.
- **Compliance `documents` writeback** ([`writebackEscalationLearning.ts`](../../supabase/functions/_shared/writebackEscalationLearning.ts)) unchanged — out of scope for this slice beyond noting that storage paths remain approval/escalation-gated elsewhere.

### Tenant isolation

- **[`fetchMemoryHeaders`](../../supabase/functions/_shared/memory/fetchMemoryHeaders.ts)** / **[`fetchSelectedMemoriesFull`](../../supabase/functions/_shared/memory/fetchSelectedMemoriesFull.ts)** already scope by `photographer_id`.
- **[`buildAgentContext`](../../supabase/functions/_shared/memory/buildAgentContext.ts)** `loadRecentMessages` verified thread ownership; **messages** rows are now also filtered by **`photographer_id`** (defense in depth).

### Sensitive CRM fields

- `crmSnapshot` includes `balance_due` for **parity hints** and internal logic; **persona authoritative block** ([`formatAuthoritativeCrmFromSnapshot`](../../supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts)) does **not** expose `balance_due` to the writer. **No change** this slice — document only.

## Fixes implemented (this slice)

| Area | Change |
|------|--------|
| Inbound text | New [`sanitizeInboundTextForModelContext.ts`](../../supabase/functions/_shared/memory/sanitizeInboundTextForModelContext.ts): control-char heuristic, max length |
| Persona facts | Sanitize `rawMessage` in `buildOrchestratorFactsForPersonaWriter`; pass sanitized text into `buildUnknownPolicySignals` |
| Continuity | Sanitize thread summary + message bodies in `formatCompactContinuityForPersonaWriter` and `formatPersonaRawFactsString` |
| QA persona raw facts | `loadRecentMessageLines`: thread tenant check + `photographer_id` on messages |
| Agent context | `loadRecentMessages`: `photographer_id` on messages |
| Operator WhatsApp context | `sanitizeAgentContextForOrchestratorPrompt`: sanitize thread summary before cap |
| Escalation | `recordV3OutputAuditorEscalation`: cap each violation snippet |

## Tests

- [`sanitizeInboundTextForModelContext.test.ts`](../../supabase/functions/_shared/memory/sanitizeInboundTextForModelContext.test.ts) — run via `npm run test:context`.

## Remaining open risks (recommended next slice)

1. **Structured attachment metadata** — Addressed in [V3_SECURITY_HARDENING_SLICE2_REPORT.md](V3_SECURITY_HARDENING_SLICE2_REPORT.md) (`message_attachments` + data-URL stripping; `raw_payload` still excluded from V3 selects).
2. **`raw_payload` on messages** — V3 context loaders still use explicit column lists; see slice 2 report for the boundary audit.
3. **Envelope encryption / vault** for third-party secrets in `photographers.settings` — Phase 5 of [`V3_SECURITY_HARDENING_PLAN.md`](V3_SECURITY_HARDENING_PLAN.md).
4. **Operator-channel authenticity** (WhatsApp binding, spoof resistance) — transport-dependent; follow [`V3_OPERATOR_WHATSAPP_PLAN.md`](V3_OPERATOR_WHATSAPP_PLAN.md).
5. **Full red-team / DLP** on email ingress — broader than this slice.

## Files changed

- `supabase/functions/_shared/memory/sanitizeInboundTextForModelContext.ts` (new)
- `supabase/functions/_shared/memory/sanitizeInboundTextForModelContext.test.ts` (new)
- `supabase/functions/_shared/memory/buildAgentContext.ts`
- `supabase/functions/_shared/memory/buildPersonaRawFacts.ts`
- `supabase/functions/_shared/memory/sanitizeAgentContextForOrchestratorPrompt.ts`
- `supabase/functions/_shared/orchestrator/maybeRewriteOrchestratorDraftWithPersona.ts`
- `supabase/functions/_shared/orchestrator/recordV3OutputAuditorEscalation.ts`
- `docs/v3/V3_SECURITY_HARDENING_SLICE1_REPORT.md` (this file)
