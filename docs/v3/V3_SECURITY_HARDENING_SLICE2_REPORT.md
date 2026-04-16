# V3 security hardening — slice 2 (attachments, documents, payload boundaries)

**Date:** 2026-04-06  
**Builds on:** [V3_SECURITY_HARDENING_SLICE1_REPORT.md](V3_SECURITY_HARDENING_SLICE1_REPORT.md)

## Goal

Ensure **non-text / high-risk artifacts** (screenshots, PDFs, IDs, compliance docs, Twilio attachment metadata) are **not silently treated** as ordinary, model-readable context on V3 paths.

## Audit summary

### `messages` columns

| Column | Risk | V3 model context |
|--------|------|------------------|
| `body` | May contain pasted `data:*;base64` or user text | **Yes** — via `buildAgentContext` / persona continuity |
| `raw_payload` | Full provider webhook JSON; may include attachment URLs | **No** — not selected in V3 context loaders |
| `metadata` | Provider-specific JSON | **No** — not selected in `loadRecentMessages` / persona raw facts |

**Invariant (documented):** [`buildAgentContext.ts`](../../supabase/functions/_shared/memory/buildAgentContext.ts) and persona raw-fact loaders use **explicit column lists** (`id, thread_id, direction, sender, body, sent_at` / `id, direction, body, sent_at`) — never `*` and never `raw_payload` / `metadata` for these queries.

### Structured attachments (`message_attachments`)

- Populated from **operator WhatsApp** ingress ([`webhook-whatsapp/index.ts`](../../supabase/functions/webhook-whatsapp/index.ts)) with `source_url`, `mime_type`, etc.
- **Not** joined automatically into transcript text; bodies remain separate.

### Compliance `documents` / writeback

- [`writebackEscalationLearning.ts`](../../supabase/functions/_shared/writebackEscalationLearning.ts) writes audit metadata to `documents`; resolution prose is gated by escalation learning — **not** merged into V3 persona facts in this slice (unchanged behavior).

## Fixes implemented (slice 2)

| Item | Implementation |
|------|----------------|
| Inline data URLs | [`stripInlineDataUrlsFromText`](../../supabase/functions/_shared/memory/attachmentSafetyForModelContext.ts) replaces `data:*;base64,...` with `[inline data URL omitted]`; invoked from [`sanitizeInboundTextForModelContext`](../../supabase/functions/_shared/memory/sanitizeInboundTextForModelContext.ts) so all slice-1 call sites also strip screenshots/PDF-in-text. |
| Structured attachments | [`fetchMessageIdsWithStructuredAttachments`](../../supabase/functions/_shared/memory/attachmentSafetyForModelContext.ts) + [`redactMessageBodyForModelContext`](../../supabase/functions/_shared/memory/attachmentSafetyForModelContext.ts): if `message_attachments` rows exist for a message, prepend **STRUCTURED_ATTACHMENT_BANNER** so the model sees an explicit non-text signal; empty body becomes banner-only. |
| Tenant scope | Attachment lookup uses `.eq("photographer_id", photographerId)` + `message_id IN (...)`. |
| V3 context assembly | [`buildAgentContext`](../../supabase/functions/_shared/memory/buildAgentContext.ts) `loadRecentMessages`: redact + [`sanitizeInboundTextForModelContext`](../../supabase/functions/_shared/memory/sanitizeInboundTextForModelContext.ts). |
| QA persona raw facts | [`buildPersonaRawFacts.ts`](../../supabase/functions/_shared/memory/buildPersonaRawFacts.ts) `loadRecentMessageLines`: same pipeline (requires `messages.id` in select). |

## Proof / tests

- [`attachmentSafetyForModelContext.test.ts`](../../supabase/functions/_shared/memory/attachmentSafetyForModelContext.test.ts) — data-URL stripping, banner behavior.
- Run: `npm run test:context`.

## Remaining risks (next slices)

1. **Email ingress** — If a future path stores attachment bytes or huge HTML in `body`, rely on slice-1 truncation + slice-2 data-URL strip; add **attachment rows** for email when that pipeline exists.
2. **OCR / vision** — Any future multimodal path must be **opt-in** and never default for compliance IDs.
3. **`raw_payload` in other workers** — Audit non-V3 workers that `select` full message rows for LLMs (e.g. internal tooling).
4. **Storage URLs** — `message_attachments.source_url` is not injected into prompts here; ensure no other code path dumps URLs into client-facing drafts without approval.

## Files changed

- `supabase/functions/_shared/memory/attachmentSafetyForModelContext.ts` (new)
- `supabase/functions/_shared/memory/attachmentSafetyForModelContext.test.ts` (new)
- `supabase/functions/_shared/memory/sanitizeInboundTextForModelContext.ts`
- `supabase/functions/_shared/memory/buildAgentContext.ts`
- `supabase/functions/_shared/memory/buildPersonaRawFacts.ts`
- `docs/v3/V3_SECURITY_HARDENING_SLICE2_REPORT.md` (this file)
