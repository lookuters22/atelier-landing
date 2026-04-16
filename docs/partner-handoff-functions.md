# Partner Handoff: Learning Loop, Policy, Candidate Review, and Gmail Import

This document explains the main functions, RPCs, and tables we added or rewired, in plain language, with real-world examples.

## 1. Core Truth Model

Before the function-by-function breakdown, this is the most important mental model:

- `playbook_rules` = official studio policy
- `authorized_case_exceptions` = one-case override
- `memories` = contextual human facts
- `playbook_rule_candidates` = staged policy suggestions, not live yet

### Real-world example

- Official policy: "Destination weddings have a travel fee."
- One-off override: "Waive the travel fee for this wedding only."
- Context fact: "The bride's sister is paying."
- Staged future rule: "We keep waiving Lake Como travel fees. Maybe that should become policy."

## 2. Learning Loop Contracts

### `src/types/operatorResolutionWriteback.types.ts`

This file defines the contract for what a freeform operator resolution is allowed to produce.

It supports these artifact types:

- `authorized_case_exception`
- `memory`
- `playbook_rule_candidate`

It also defines:

- `OperatorResolutionCorrelation`
- `OperatorResolutionWritebackEnvelope`
- `LearningLoopResolutionReceipt`

### What it is doing

It gives the backend one strict shape for:

- what the classifier is allowed to output
- what the atomic write path expects
- what the receipt back to the app looks like

### Real-world example

If Danilo writes:

> "Waive the travel fee this one time, but second shooter is still extra. Also this bride is Maria's cousin."

The structured writeback can become:

- one `authorized_case_exception`
- one `memory`
- maybe one `playbook_rule_candidate` later if this looks like a repeat pattern

## 3. Learning Loop Validation

### `supabase/functions/_shared/learning/operatorResolutionWritebackZod.ts`

This is the strict validator for the learning-loop payload.

### What it is doing

It rejects bad classifier output before any database write happens.

It validates:

- correct schema version
- valid UUIDs where needed
- valid decision mode / scope / channel enums
- confidence is between `0` and `1`
- observation count is an integer `>= 1`
- at least one artifact exists
- no duplicate exception keys
- no obvious overlap where a memory repeats the same operational override as an exception

### Real-world example

If the AI invents:

- `proposedDecisionMode = "maybe"`
- or a memory that just repeats "travel_fee waived"

the payload fails here and nothing is saved.

## 4. Operator Resolution Classifier

### `supabase/functions/_shared/learning/classifyOperatorResolutionLearningLoop.ts`

This is the LLM-based classifier for operator freeform replies.

### What it is doing

It sends the operator resolution and escalation context to OpenAI and asks for JSON only.

It teaches the model this truth hierarchy:

- one-off override -> `authorized_case_exception`
- interpersonal/context fact -> `memory`
- reusable policy pattern -> `playbook_rule_candidate`

It also explicitly forbids overlap:

- do not create both an exception and a memory for the same operational override

### Real-world example

If the operator says:

> "Yes, waive the fee this once."

that should become an exception only.

It should not also create a memory that says:

> "The fee was waived."

## 5. Learning Loop Service Orchestrator

### `supabase/functions/_shared/learning/executeLearningLoopEscalationResolution.ts`

This is the backend orchestrator for the learning-loop path.

### What it is doing

It performs these steps:

1. load the escalation
2. verify tenant ownership
3. build correlation metadata
4. support idempotent retry if the escalation was already resolved via learning loop
5. classify the learning outcome if needed
6. run the freeform operator classifier
7. validate with Zod
8. enrich exceptions with rule ids / default TTLs
9. assign deterministic memory artifact keys
10. call one atomic Postgres RPC
11. map the RPC JSON into a typed receipt

### Real-world example

If WhatsApp retries the same resolution, this file makes sure the backend returns the existing receipt instead of creating duplicate artifacts.

## 6. Learning Loop Atomic RPC

### `supabase/migrations/20260423120100_complete_learning_loop_operator_resolution.sql`

This defines the SQL function:

- `complete_learning_loop_operator_resolution(...)`

### What it is doing

This is the true atomic transaction.

It:

- locks the escalation row with `FOR UPDATE`
- verifies photographer / thread / wedding consistency
- supports idempotent retry for already-completed learning-loop resolutions
- writes exceptions
- writes memories
- writes playbook rule candidates
- closes the escalation
- returns one receipt JSON object

### Real-world example

If a resolution creates:

- 1 exception
- 1 memory
- 1 candidate

then either all 3 are written and the escalation closes, or none of them are written.

No half-finished state.

## 7. Memory Provenance

### `supabase/migrations/20260423120000_memories_learning_loop_provenance.sql`

This added provenance fields to `memories`.

### What it is doing

It makes learning-loop-created memories traceable and idempotent by adding linkage back to the originating escalation and artifact key.

### Real-world example

If the same resolution is retried, the system can detect that the same memory artifact was already created and avoid duplicating it.

## 8. Shared Resolution Handoff

### `supabase/functions/_shared/learning/resolveOperatorEscalationResolution.ts`

This is the single shared handoff for operator escalation resolution.

### What it is doing

Both dashboard and WhatsApp/operator flows now go through this file.

It:

- loads the escalation
- checks ownership
- supports idempotent learning-loop retries
- classifies the learning outcome on open escalations
- decides strict storage target
- sends document/compliance cases to legacy atomic resolution
- sends everything else to the new learning-loop path
- clears the operator hold after successful resolution

### Real-world example

If the escalation is about a sensitive personal document, it still goes through the legacy document path.

If it is a normal pricing/scope/operator decision, it goes through the learning loop.

## 9. Legacy Document Resolution

### `supabase/functions/_shared/completeEscalationResolutionAtomic.ts`

This older path still exists for strict document/compliance cases.

### What it is doing

It writes exactly one strict storage-target branch.

We kept it because document/compliance audit handling is not modeled by the new multi-artifact learning-loop RPC.

### Real-world example

If the escalation is about collecting or handling a sensitive ID document, it stays on the strict audit-safe document path.

## 10. Candidate Staging Table

### `supabase/migrations/20260421120000_playbook_rule_candidates_learning_loop.sql`

This created `playbook_rule_candidates`.

### What it is doing

It stores reusable policy suggestions in an inert staging table.

Important rule:

- this table is not used by `deriveEffectivePlaybook`
- candidates do not affect live automation until explicitly approved

### Real-world example

If the operator keeps making the same exception manually, the system can stage a candidate instead of silently changing studio policy.

## 11. Candidate Review and Promotion RPC

### `supabase/migrations/20260424120000_review_playbook_rule_candidate.sql`

### `supabase/migrations/20260425120000_review_playbook_rule_candidate_approve_sets_is_active.sql`

These define and fix the SQL function:

- `review_playbook_rule_candidate(...)`

### What it is doing

It supports:

- `approve`
- `reject`
- `supersede`

Approve does this atomically:

- find matching candidate
- validate it is still in `candidate` status
- determine effective values, including optional human overrides
- find or create the correct live `playbook_rule`
- set that rule active
- mark the candidate as `approved`
- set `promoted_to_playbook_rule_id`
- set `reviewed_at` and `reviewed_by_photographer_id`
- return a typed receipt

Reject does this atomically:

- mark the candidate rejected
- set review metadata

Supersede does this atomically:

- mark candidate superseded
- optionally point it to another candidate

### Real-world example

AI suggests:

> "Waive travel surcharge for Lake Como weddings."

Danilo approves a narrower human-edited version:

> "Waive only the Lake Como ferry surcharge."

The candidate row stays as the original AI proposal.

The live `playbook_rule` uses the human-approved override.

## 12. Candidate Review Edge Helpers

### `supabase/functions/_shared/learning/reviewPlaybookRuleCandidateRpc.ts`

This parses edge JSON into clean RPC args.

### What it is doing

It:

- validates request shape
- validates UUIDs
- validates allowed decision modes for override
- maps the HTTP body into the exact SQL RPC argument shape

### Real-world example

If the frontend sends a broken `candidate_id`, this helper turns it into a clean `400` before Postgres sees it.

### `supabase/functions/_shared/learning/mapPlaybookRuleCandidateReviewReceipt.ts`

This maps raw SQL `jsonb` into typed TypeScript receipts.

### What it is doing

It ensures the app gets a strict response shape for:

- approve
- reject
- supersede

### Real-world example

The UI can later use this to say:

- which candidate was approved
- which live rule was created
- whether overrides were used

## 13. Gmail Account and Import Staging Schema

### `supabase/migrations/20260426120000_gmail_import_connected_accounts_import_candidates.sql`

This created:

- `connected_accounts`
- `connected_account_oauth_tokens`
- `import_candidates`

### What each table is doing

#### `connected_accounts`

Stores non-secret Gmail account metadata:

- which photographer connected Gmail
- Google account id
- email
- display name
- sync status
- token expiry
- sync error summary

#### `connected_account_oauth_tokens`

Stores secrets:

- access token
- refresh token

This is intentionally separate so the client can read "Gmail connected" metadata without seeing tokens.

#### `import_candidates`

This is the staging/quarantine table for Gmail-imported threads.

Important rule:

- imported Gmail threads do not write directly into canonical `threads` or `weddings`
- they land here first for later human review

### Real-world example

If the photographer syncs the Gmail label `Weddings 2026`, those threads first become `import_candidates`, not live client projects.

## 14. Gmail OAuth Start

### `supabase/functions/auth-google-init/index.ts`

This is the SPA-safe Gmail OAuth start endpoint.

### What it is doing

It:

- requires the logged-in photographer JWT
- reads Gmail OAuth env vars
- signs a secure state payload
- builds the Google authorization URL
- returns JSON `{ url }`

The frontend then redirects with `window.location.href = url`.

### Real-world example

Settings page says "Connect Gmail".

The SPA does not use a blind link.

Instead it securely asks the edge function for the exact Google URL tied to the logged-in photographer.

## 15. Gmail OAuth Callback

### `supabase/functions/auth-google-callback/index.ts`

This is the Google redirect handler after consent.

### What it is doing

It:

- validates state
- exchanges the OAuth code for tokens
- fetches Google user identity
- upserts `connected_accounts`
- upserts `connected_account_oauth_tokens`
- preserves the old refresh token if Google does not return a new one
- redirects back to Settings with `gmail=connected` or `gmail_error=...`

### Real-world example

If Google omits `refresh_token` on reconnect, this function now keeps the old stored refresh token instead of accidentally breaking future sync.

## 16. Gmail OAuth State

### `supabase/functions/_shared/gmail/googleOAuthState.ts`

This signs and verifies Gmail OAuth state.

### What it is doing

It protects the OAuth flow against tampering and ties the callback back to the original photographer.

### Real-world example

The callback can trust that the same logged-in photographer who started the Gmail connect flow is the one completing it.

## 17. Gmail Token Logic

### `supabase/functions/_shared/gmail/googleOAuthToken.ts`

This handles Google token exchange and refresh helpers.

### Important helper

- `mergeGoogleReconnectRefreshToken(...)`

### What it is doing

It prevents reconnect from wiping the refresh token when Google returns only a new access token.

### Real-world example

Without this fix, Gmail might connect successfully today but become unsyncable tomorrow when the access token expires.

## 18. Gmail Access Validation and Refresh

### `supabase/functions/_shared/gmail/ensureGoogleAccess.ts`

This defines:

- `ensureValidGoogleAccessToken(...)`

### What it is doing

It:

- checks whether the current token is still valid
- refreshes before expiry when needed
- updates DB token expiry
- preserves refresh token when Google omits a new one
- marks the account `error` if refresh fails

### Real-world example

The label sync worker does not need to know OAuth details.

It just asks this helper:

> "Give me a valid Gmail access token for this account."

## 19. Gmail Thread Fetching

### `supabase/functions/_shared/gmail/gmailThreads.ts`

This wraps Gmail API calls for:

- `users.threads.list`
- metadata fetch per thread

### What it is doing

It uses Gmail `labelIds` directly, not a fragile search query.

It helps fetch:

- thread id
- snippet
- message count
- subject

### Real-world example

If the user chooses label `Weddings 2026`, this file is what asks Gmail:

> "Give me the threads under this label."

## 20. Gmail Label Sync Worker

### `supabase/functions/inngest/functions/syncGmailLabelImportCandidates.ts`

This is the background worker for the Gmail fast-lane import.

### What it is doing

It:

- loads the connected account and tokens
- marks sync status as `syncing`
- gets a valid access token
- fetches Gmail threads using `labelIds`
- paginates
- caps the import to `200` threads
- fetches metadata per thread
- upserts into `import_candidates`
- dedupes by `(photographer_id, connected_account_id, raw_provider_thread_id)`
- marks the account back to `connected`
- or marks it `error` on failure

### Real-world example

If the photographer syncs a label with 800 old threads, this worker only stages the first safe batch and does not flood the system.

## 21. Gmail Sync Failure Handling

### `supabase/functions/_shared/gmail/gmailSyncFailure.ts`

This creates bounded sync error summaries.

### What it is doing

It turns long thrown errors into short DB-safe messages.

### Real-world example

If Gmail fails with a giant error blob, this helper stores a short useful summary instead of cluttering the DB.

## 22. Gmail Label Sync Enqueue Edge

### `supabase/functions/gmail-enqueue-label-sync/index.ts`

This is the thin edge endpoint that queues the background Gmail label import.

### What it is doing

It:

- requires JWT
- validates `connected_account_id`
- checks the Gmail account belongs to the photographer
- emits the Inngest event for label sync

### Real-world example

A future Settings label picker can call this endpoint when the user selects a label like "Active Weddings".

## 23. Dashboard and WhatsApp Integration

### Dashboard

### `supabase/functions/dashboard-resolve-escalation/index.ts`

This now routes through the shared resolver.

### What it is doing

It no longer owns separate resolution branching logic.

### Real-world example

Resolving an escalation from dashboard now follows the same learning-loop and document-routing rules as WhatsApp.

### WhatsApp / Operator flow

### `supabase/functions/inngest/functions/operatorOrchestrator.ts`

This now also routes resolution through the shared resolver.

### What it is doing

It appends the operator turn, resolves when appropriate, and relies on the shared backend path.

### Real-world example

If Danilo resolves an escalation from WhatsApp, the same learning-loop pipeline runs as if he resolved it from Today.

## 24. Policy Engine Relationship

### `supabase/functions/_shared/policy/deriveEffectivePlaybook.ts`

We did not redesign this in the new slices, but it is important context.

### What it is doing

It builds the effective baseline playbook from live `playbook_rules`.

Important consequence:

- `playbook_rule_candidates` do not affect it
- only approved/promoted live rules affect it
- inactive rules are ignored

### Real-world example

A staged candidate does nothing.

Once approved, the live `playbook_rule` starts affecting the real baseline policy engine.

## 25. What Is Built vs Not Built Yet

### Built

- learning-loop classifier
- strict Zod validation
- atomic multi-artifact writeback
- idempotent retry behavior
- shared resolver for dashboard and WhatsApp
- centralized hold clearing
- candidate review / promotion backend
- Gmail connect backend
- Gmail label-based fast-lane import into staging

### Not built yet

- UI for reviewing `import_candidates`
- UI for approving/dismissing Gmail staged imports
- materializing approved imports into canonical `threads` / `weddings`
- candidate review UI surface
- bulk digest review for repeated candidates
- edit-before-approve UI for candidates

## 26. One End-to-End Real-World Example

Client asks:

> "Can you waive the travel fee?"

Danilo replies:

> "Yes, just this once, because she's a referral from Maria."

What happens:

1. escalation is resolved from Today or WhatsApp
2. shared resolver decides this is a learning-loop case, not a document/compliance case
3. classifier turns the reply into:
   - one case exception for the travel fee
   - one memory about the referral context
4. Zod validates that structure
5. atomic RPC writes both artifacts and closes the escalation
6. later, if this pattern repeats often, the system may stage a playbook rule candidate
7. a human can later approve that candidate into a real live playbook rule

## 27. Gmail End-to-End Real-World Example

Photographer goes to Settings and clicks:

> "Connect Gmail"

What happens:

1. `auth-google-init` returns a Google OAuth URL
2. photographer approves Gmail read-only access
3. `auth-google-callback` stores the connected account and tokens
4. later the user picks label `Weddings 2026`
5. `gmail-enqueue-label-sync` emits an event
6. `syncGmailLabelImportCandidates` fetches threads under that label
7. threads are staged in `import_candidates`
8. nothing is written yet to canonical inbox threads or weddings until a later review flow exists

