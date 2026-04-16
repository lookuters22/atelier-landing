# Gmail hardening — deployment release notes (2026-04-30)

Operational record for the tenant-safe materialization RPCs, secondary pending backlog + repair ops, and OAuth completion RPC alignment. No product behavior change beyond safer DB boundaries and repairability.

## Migrations applied (linked remote)

Commands:

```bash
npx supabase migration list
npx supabase db push --dry-run --include-all
npx supabase db push --include-all --yes
```

| Migration | Purpose |
|-----------|---------|
| `20260430148000_complete_google_oauth_connection_atomic.sql` | **History reconciliation:** remote was missing this file in order; required `--include-all` before later migrations. Defines `complete_google_oauth_connection` (used by `auth-google-callback`). |
| `20260430160000_gmail_import_materialize_atomic_rpcs.sql` | Atomic Gmail materialization RPCs + `gmail_import_secondary_pending` + `import_candidates.materialization_secondary_status`. |
| `20260430161000_gmail_import_wedding_tenant_guard_and_secondary_count.sql` | Tenant-safe `wedding_id` guards on materialization RPCs + `gmail_import_secondary_pending_open_count_for_photographer_v1`. |

After apply, `npx supabase migration list` shows **Local** and **Remote** aligned for `20260430160000` and `20260430161000`.

## Generated database types

Regenerated from the **linked** project (UTF-8; use `cmd` redirect on Windows to avoid PowerShell stderr/UTF-16 corrupting the file):

```bash
cmd /c "npx supabase gen types typescript --linked 2>nul > src/types/database.types.ts"
```

Updates include: `public.gmail_import_secondary_pending`, `import_candidates.materialization_secondary_status`, and RPC entries such as `complete_gmail_import_materialize_new_thread`, `finalize_gmail_import_link_existing_thread`, `gmail_import_secondary_pending_open_count_for_photographer_v1`.

## Verification run in repo

- `npm run build` — passed after type regeneration.
- `npx vitest run --config vitest.context.config.ts` (focused): `gmailImportSecondaryPendingRepair.test.ts`, `gmailRepairWorkerOps.test.ts` — passed.

## Runtime / Edge compatibility checks (code)

- `auth-google-callback` calls `complete_google_oauth_connection` (present after `20260430148000` on remote).
- Gmail materialization uses `complete_gmail_import_materialize_new_thread` / `finalize_gmail_import_link_existing_thread` (no legacy non-RPC path in `gmailImportMaterialize.ts` / `finalizeGmailImportCandidateApproved.ts`).
- `gmail-repair-ops` calls `gmail_import_secondary_pending_open_count_for_photographer_v1` in `buildStatusPayload` and exposes `run_secondary_pending_batch`.

## Deploy steps that remain manual

1. **Deploy updated Edge functions** to the hosted project whenever repo changes to these functions are not yet live — at minimum **`gmail-repair-ops`** so status includes `gmail_import_secondary_pending` and the batch action is available. Deploy other Gmail functions if your branch changed them (`auth-google-callback`, `import-candidate-review`, `inngest`, etc.).
2. **Postgres is already migrated** via `db push` above; no extra SQL on the dashboard unless a different environment (staging vs prod) is used — repeat `migration list` / `db push` there.

## Residual / non-blocking follow-ups

- **No scheduled drain** for `gmail_import_secondary_pending`: repairs are operator-driven via `gmail-repair-ops` (`run_secondary_pending_batch`) until a cron or Inngest job is added.
- **`materialization_secondary_status`** may stay `degraded` after a successful manual repair until a separate reconciliation updates the flag.
- **Other environments:** if staging uses a different Supabase project, run the same migration + typegen against that project before release.

## Scope confirmation

This rollout did not modify WhatsApp/Twilio functions, config, or deployment paths.
