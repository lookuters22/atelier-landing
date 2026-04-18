# Gmail hardening - deployment release notes

Operational record for the Gmail backend rollout covering atomic materialization RPCs, grouped-import fixes, inbound suppression hardening, and the lazy grouped-import backpatch RPC.

This document is the current deployment checklist for the hosted Supabase project behind this repo.

## Migrations that must be on the remote project

Run from the repo root:

```bash
npx supabase migration list
npx supabase db push --dry-run --include-all
npx supabase db push --include-all --yes
```

The remote project should now be aligned through:

| Migration | Purpose |
|-----------|---------|
| `20260430148000_complete_google_oauth_connection_atomic.sql` | History reconciliation. Defines `complete_google_oauth_connection` used by `auth-google-callback`. |
| `20260430160000_gmail_import_materialize_atomic_rpcs.sql` | Atomic Gmail materialization RPCs plus `gmail_import_secondary_pending` and `import_candidates.materialization_secondary_status`. |
| `20260430161000_gmail_import_wedding_tenant_guard_and_secondary_count.sql` | Tenant-safe `wedding_id` guards on materialization RPCs and `gmail_import_secondary_pending_open_count_for_photographer_v1`. |
| `20260507000000_inbound_suppression_classifier_and_convert_guard.sql` | DB-side suppression classifier and convert-to-inquiry guard so promo/system mail cannot be converted into inquiry-stage CRM rows through the manual convert path. |
| `20260508000000_backpatch_lazy_grouped_import_wedding_link_rpc.sql` | Atomic lazy grouped-import backpatch RPC. Patches `threads.wedding_id`, `threads.ai_routing_metadata`, and `import_candidates.import_provenance` together, and enforces exact candidate-thread-group identity at the DB boundary. |

After apply, `npx supabase migration list` should show Local and Remote aligned through `20260508000000_backpatch_lazy_grouped_import_wedding_link_rpc.sql`.

## Hosted function deploys that must be up

If the backend changes from this branch are not already live, deploy these hosted functions:

```bash
npx supabase functions deploy import-candidate-review
npx supabase functions deploy inngest
```

These two deploys are the minimum safe rollout for the current Gmail/import/suppression work. They cover:

- grouped Gmail approval entrypoint behavior
- suppression-aware import materialization
- lazy grouped wedding creation / backpatch behavior
- orchestrator-side suppression blocking
- the shared Gmail worker code bundled into `inngest`

If this environment also needs the inbox helper functions refreshed, deploy them too:

```bash
npm run deploy:gmail-inbox-edge
```

## Secrets and project alignment

Use the secrets already present in `.env` and your linked Supabase CLI context.

Important:

- `VITE_SUPABASE_URL` must point at the same hosted Supabase project you deploy migrations and Edge Functions to.
- Do not deploy functions to one project while the app is configured against another.
- If staging and production are different Supabase projects, repeat the full migration + function deploy sequence against each project separately.

## Current manual rollout set for this branch

If you have not pushed the latest backend changes yet, this is the minimum rollout:

```bash
npx supabase db push --include-all --yes
npx supabase functions deploy import-candidate-review
npx supabase functions deploy inngest
```

## Runtime / compatibility checkpoints

- `auth-google-callback` depends on `complete_google_oauth_connection`.
- Gmail materialization depends on the atomic materialization RPCs.
- `import-candidate-review` is the approval entrypoint and must match the current grouped-approval / suppression behavior.
- `inngest` must include the latest grouped approval worker, decision-context suppression lookup, and orchestrator suppression gates.

## Residual non-blocking follow-ups

- There is still no scheduled drain for `gmail_import_secondary_pending`; repairs remain operator-driven unless a cron or worker is added.
- `materialization_secondary_status` may remain `degraded` after a manual repair until a separate reconciliation updates it.
- The lazy backpatch RPC is strongly covered by static SQL-structure tests, but a live DB integration harness would still be the gold-standard verification.

## Scope note

This rollout note is about Supabase migrations and hosted function deploys for the Gmail/import pipeline. It does not change WhatsApp/Twilio deployment paths.
