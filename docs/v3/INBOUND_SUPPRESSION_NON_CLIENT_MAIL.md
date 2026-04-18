# Inbound Suppression — Promotional / System / Non-Client Mail

## Problem

Promotional or system emails (Booking.com campaigns, newsletters, no-reply
notifications, OTA blasts) were being ingested and, in some cases, treated
as live wedding inquiries:

- Triage had no `promotional_or_marketing` bucket, so such threads fell into
  `intake` and became CRM-visible as unfiled inquiries.
- The manual "convert unfiled thread to inquiry" RPC and the Gmail grouped
  label import paths created `wedding` and `client` records from them with
  no sender / domain / content gate.
- `mailboxNormalize` only flagged obvious no-reply local parts
  (`noreply`, `mailer-daemon`), missing `email.campaign`, `newsletter`, etc.
- The decision-context `broadcastRisk` was hard-coded to `"unknown"`, so
  the orchestrator draft-only rail (Ana) had nothing that forced a block on
  promo / system threads.

End result: a promotional Booking.com campaign could become a CRM wedding
inquiry and receive a client-style reply draft. That is the failure class
this work closes.

## Defense-in-depth layers

```
     ┌─────────────────────────────────────────────────────────────────┐
     │  Shared pure classifier  (`inboundSuppressionClassifier.ts`)    │
     │  - local-part tokens, OTA/marketplace domains, marketing        │
     │    subdomains, headers, unsubscribe / do-not-reply body         │
     │    markers, subject promo tokens                                │
     └───────────────────────────────┬─────────────────────────────────┘
                                     │ used by both client and server
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
  Mailbox normalize         Gmail import wrapper         Decision context
  (reply recipient /        (adds Gmail label hint;      (latest inbound →
   replyability)             `classifyGmailImport-        audience.inbound-
                              Candidate`)                  Suppression +
                                                           broadcastRisk=high)
         │                           │                           │
         ▼                           ▼                           ▼
  UI never suggests          Materialize sets             Orchestrator
  replying to a promo        effectiveWeddingId=null      proposal blocker
  local part                 when suppressed;             + send_message
                             ai_routing_metadata          likely=block;
                             .suppression is              operator routing
                             persisted for audit          surfaced
                                                           
         ┌─────────────────────────────────────────────────────────────┐
         │  SQL RPC enforcement (last line of defense)                 │
         │  `convert_unfiled_thread_to_inquiry` re-runs the classifier │
         │  in Postgres and returns a structured                       │
         │  `suppressed_non_client_thread` error                       │
         └─────────────────────────────────────────────────────────────┘
```

No single layer is trusted alone. Clients, edge functions, and the database
all re-apply the check so that a bypassed UI, a buggy materialize path, or a
direct RPC from a malicious client can't skip suppression.

## Classification contract

`classifyInboundSuppression(input)` produces an
`InboundSuppressionClassification`:

- `verdict`:
  - `human_client_or_lead` (default; only case that stays draftable)
  - `promotional_or_marketing`
  - `system_or_notification`
  - `transactional_non_client`
  - `unknown_review_needed`
- `suppressed`: `true` for every verdict except `human_client_or_lead`.
- `reasons`: ordered list of `InboundSuppressionReasonCode` that fired
  (e.g. `sender_domain_ota_or_marketplace`, `body_unsubscribe_language`,
  `subject_promo_markers`).
- `confidence`: `"low" | "medium" | "high"`.
- `normalizedSenderEmail`, `normalizedSenderDomain` for audit.

Callers should treat any non-`human_client_or_lead` verdict as "don't draft
a client reply". Use `suppressed` directly.

## Signal families

| Family                | Examples                                                                |
| --------------------- | ----------------------------------------------------------------------- |
| Sender local tokens   | `campaign`, `newsletter`, `marketing`, `promo`, `offers`, `noreply`     |
| Sender domain         | `sg.booking.com`, `email.booking.com`, `expedia.com`, `airbnb.com`      |
| Marketing subdomain   | `em.*`, `email.*`, `mail.*`, `mg.*`, `mkt.*`, `news.*`, `campaign.*`    |
| RFC822 headers        | `auto-submitted`, `precedence: bulk`, `list-unsubscribe`, `list-id`     |
| Body markers          | "unsubscribe", "view in browser", "do not reply", "© 2025 Company"      |
| Subject tokens        | "30% off", "Summer Sale", "newsletter", "exclusive offer"               |

Heuristics intentionally accumulate evidence; single weak signals (e.g. one
subject match) do not produce a high-confidence suppression — the
classifier is conservative for ambiguous rows (`unknown_review_needed`).

## Enforcement points

### 1. Shared pure classifier

File: `src/lib/inboundSuppressionClassifier.ts`
Tests: `src/lib/inboundSuppressionClassifier.test.ts`

Canonical source of truth. Pure TypeScript — safe for browser, Node, and
Deno edge functions.

### 2. Mailbox normalization (replyability)

Files:

- `src/lib/mailboxNormalize.ts` (client)
- `supabase/functions/_shared/gmail/mailboxNormalize.ts` (Deno)
- `src/lib/inboxReplyRecipient.ts` (consumer)
- `src/lib/mailboxNormalize.test.ts`

`isLikelyNonReplyableSystemLocalPart` now recognises the same
marketing / system local-part tokens as the classifier. Reply-recipient
selection refuses to propose a promo address as a reply target, so the UI
cannot even ask Ana to draft into a promo mailbox.

### 3. Gmail import adapter

Files:

- `supabase/functions/_shared/suppression/classifyGmailImportCandidate.ts`
- `supabase/functions/_shared/suppression/classifyGmailImportCandidate.test.ts`

Adds Gmail-label-name heuristics on top of the pure classifier. A candidate
staged under `Promotions`, `Newsletters`, `Campaigns`, `Automated Alerts`,
etc., is upgraded to the matching suppressed bucket even when the body
alone looks human. This trusts operator labeling as an additional signal.

### 4. Gmail materialize — CRM linking block

File: `supabase/functions/_shared/gmail/gmailImportMaterialize.ts`

`materializeGmailImportCandidate` now:

- Classifies the candidate via `classifyGmailImportCandidate`.
- When suppressed:
  - Forces `effectiveWeddingId = null` so the batch-created inquiry
    wedding does not swallow a promo thread.
  - Stamps `ai_routing_metadata.suppression` (verdict, reasons,
    confidence, origin, original grouped wedding id).
  - Returns `{ suppressed: true, suppressionVerdict }` so the caller can
    propagate the signal.
- The thread itself still materializes — operator inbox visibility is
  preserved (we do not make promo mail disappear).

File: `supabase/functions/inngest/functions/processGmailLabelGroupApproval.ts`

Grouped label approval honours the `suppressed` flag on both the
finalize-core path and the reuse-thread path. Suppressed rows:

- Never set `threadWeddingId` to the batch wedding.
- Record their suppression in `import_provenance`.
- Still count toward the approval `approved_count` (the row landed
  in the inbox cleanly — it just didn't CRM-link).

### 5. Manual convert RPC — SQL enforcement

Migration: `supabase/migrations/20260507000000_inbound_suppression_classifier_and_convert_guard.sql`
TS wrapper: `src/lib/inboxThreadLinking.ts`
  → `convertUnfiledThreadToInquiry` now returns a structured
  `ConvertUnfiledThreadToInquirySuppressionFailure` when the RPC rejects.

SQL functions:

- `extract_sender_email_from_raw(text)`
- `domain_is_ota_or_marketplace(text)`
- `local_part_has_marketing_or_system_token(text)`
- `classify_inbound_suppression(text, text, text) → json`

`convert_unfiled_thread_to_inquiry` fetches the newest inbound message,
runs `classify_inbound_suppression`, and returns a machine-readable
JSON error

```json
{
  "error": "suppressed_non_client_thread",
  "verdict": "promotional_or_marketing",
  "reasons": ["sender_domain_ota_or_marketplace", "body_unsubscribe_language"],
  "confidence": "high"
}
```

before creating any `wedding` or `client` row. This is the last line of
defence: even if every other layer is bypassed, the database refuses.

### 6. Orchestrator / draft safety

Files:

- `supabase/functions/_shared/context/buildDecisionContext.ts`
- `supabase/functions/_shared/orchestrator/proposeClientOrchestratorCandidateActions.ts`
- `src/types/decisionContext.types.ts` (+ `DecisionAudienceSnapshot.inboundSuppression`)

`buildDecisionContext` reads the latest inbound message on the thread,
classifies it, and writes the verdict onto `audience.inboundSuppression`.
When suppressed it also upgrades `audience.broadcastRisk` to `"high"`,
which slots into the existing `inferLikelyOutcome` auto→block rail.

`proposeClientOrchestratorCandidateActions` consumes the field:

- Adds `inbound_suppressed_non_client:<verdict>` to
  `send_message.blockers_or_missing_facts`.
- Forces `send_message.likely_outcome = "block"` regardless of requested
  execution mode (even `draft_only` cannot produce an Ana client draft).
- Appends a structured rationale explaining the verdict + reasons.
- Sets `needsOperatorRouting = true` so operator notification routing is
  surfaced even on otherwise-neutral threads.

Exported blocker constant: `INBOUND_SUPPRESSED_NON_CLIENT_BLOCKER`.

## What is explicitly NOT done

- Promo mail is **not** deleted, hidden, or redirected to trash. It lands
  in the canonical inbox so operators can audit it.
- Promo threads are **not** used to create a `wedding` or `client` record.
- Ana does **not** produce a client-style draft on a suppressed thread.
- The classifier never calls an LLM. It is deterministic by design — an
  LLM-only classifier cannot be replayed for audit, and costs scale with
  every inbound.

## How to use the classifier from new code

Client or server TypeScript:

```ts
import { classifyInboundSuppression } from "@/lib/inboundSuppressionClassifier";

const v = classifyInboundSuppression({
  senderRaw: msg.sender,
  subject: thread.title,
  body: msg.body,
  headers: msg.metadata?.headers ?? null,
  recipientCount: participants.filter((p) => p.is_recipient).length,
});

if (v.suppressed) {
  // Don't draft a client reply. Surface to operator. Log v.reasons.
}
```

Gmail import paths should use the wrapper instead:

```ts
import { classifyGmailImportCandidate } from ".../suppression/classifyGmailImportCandidate.ts";
```

SQL / migrations:

```sql
select public.classify_inbound_suppression(
  p_sender_raw := :sender,
  p_subject    := :subject,
  p_body       := :body
);
```

The JSON return is stable:

```json
{
  "verdict": "promotional_or_marketing",
  "suppressed": true,
  "reasons": ["sender_domain_ota_or_marketplace", "body_unsubscribe_language"],
  "confidence": "high",
  "normalized_sender_email": "email.campaign@sg.booking.com",
  "normalized_sender_domain": "sg.booking.com"
}
```

## Tests

Fast vitest suites covering this behaviour:

- `src/lib/inboundSuppressionClassifier.test.ts`
- `src/lib/mailboxNormalize.test.ts`
- `supabase/functions/_shared/suppression/classifyGmailImportCandidate.test.ts`
- `supabase/functions/_shared/orchestrator/proposeClientOrchestratorCandidateActions.test.ts`
  (suppression guard suite)

Run them together:

```bash
npx vitest run \
  src/lib/inboundSuppressionClassifier.test.ts \
  src/lib/mailboxNormalize.test.ts \
  supabase/functions/_shared/suppression/classifyGmailImportCandidate.test.ts \
  supabase/functions/_shared/orchestrator/proposeClientOrchestratorCandidateActions.test.ts
```

## Ownership

- Shared classifier: platform / AI team.
- Gmail import enforcement: ingestion team.
- Convert RPC: database team.
- Orchestrator guardrail: orchestrator / verifier team.

When adding a new email source (e.g. a future IMAP importer, or web-form
ingress), the new path **must** call the shared classifier (or the SQL
function) before creating any inquiry / wedding / client record, and
before proposing a draft. Tests should extend the existing suites rather
than re-implementing heuristics.
