# Onboarding runtime finalization — Slice 4 (verification)

## Automated tests

Run:

```bash
npm run test:onboarding-runtime
```

Or directly:

```bash
npx vitest run --config vitest.context.config.ts src/lib/onboardingFinalizeVerification.test.ts src/lib/onboardingBriefingDraftGuards.test.ts supabase/functions/_shared/context/onboardingRuntimePlaybookVisibility.test.ts
```

### What is covered

| Area | File | Guarantees |
|------|------|------------|
| RPC cohort ↔ migration | `src/lib/onboardingFinalizeVerification.test.ts` | `FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES` matches the migration `DELETE ... IN (...)` list; KB delete targets `onboarding_source = onboarding_briefing_v1`. |
| First completion mapping | same | `mapOnboardingPayloadToStorage` sets identity + `onboarding_completed_at`, studio profile, playbook rows, KB rows with onboarding metadata. |
| Replacement safety (mapper) | same | Mapped playbook `source_type` values are always within the RPC delete cohort; mapping does not emit arbitrary manual/crafted tags. |
| Finalizer RPC contract | same | `finalizeOnboardingBriefingRuntime` calls `finalize_onboarding_briefing_v1` with merged settings (preserves unrelated keys), `status: "completed"` on `onboarding_briefing_v1`, and can be invoked twice (re-finalization). |
| Autosave gating | `src/lib/onboardingBriefingDraftGuards.test.ts` | After completion, draft snapshot writes are blocked until `hasPendingDraftEdits` (set only by payload edits); navigation on a completed briefing does not unlock draft. |
| Runtime read path | `supabase/functions/_shared/context/onboardingRuntimePlaybookVisibility.test.ts` | `fetchActivePlaybookRulesForDecisionContext` returns rows that include `source_type`; onboarding-owned rules use the same canonical query as other tenant rules. |

### Source of truth

- RPC SQL: `supabase/migrations/20260430200000_finalize_onboarding_briefing_v1.sql`
- TS mirror for tests/docs: `src/lib/onboardingFinalizeRpcContract.ts`

When changing the migration cohort, update `onboardingFinalizeRpcContract.ts` and the sorted comparison in `onboardingFinalizeVerification.test.ts`.

## Live DB verification (`finalize_onboarding_briefing_v1`)

This exercises the **real** Postgres RPC (not mocks): merges `photographers.settings`, upserts `studio_business_profiles`, deletes/reinserts onboarding-owned `playbook_rules` and onboarding-tagged `knowledge_base` rows, and enforces `p_photographer_id = auth.uid()`.

### Prerequisites

- Migrations applied (local: `supabase start` then `supabase db reset` / `db push`; hosted: project already migrated).
- Repo-root `.env` (or `--env-file`) with:
  - `VITE_SUPABASE_URL` (or `SUPABASE_URL`)
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (only for idempotent test user creation + service assertions)

### How to run

**Script (recommended):**

```bash
npx tsx --env-file=.env scripts/onboarding_finalize_live_verify.ts
```

**npm:**

```bash
npm run verify:onboarding-finalize-live
```

**Vitest (same runner, gated by env):**

```bash
npx cross-env ONBOARDING_FINALIZE_VERIFY=1 vitest run --config vitest.context.config.ts src/lib/onboardingFinalizeLiveVerify.integration.test.ts
```

**npm:**

```bash
npm run test:onboarding-runtime:live
```

### What it proves

| Step | Assertion |
|------|-----------|
| First `finalizeOnboardingBriefingRuntime` | Settings merge keeps unrelated keys; `onboarding_briefing_v1.status === completed`; top-level `onboarding_completed_at`; `studio_business_profiles` row exists; onboarding playbook + KB rows exist; `source_type` values are within the RPC delete cohort. |
| Survival | A manual `playbook_rules` row (`manual_verify_survive`) and a `knowledge_base` row (no `onboarding_source`) remain after finalize. |
| Re-finalize | Second call changes snapshot + playbook content (e.g. `reply` instruction); manual rows still survive. |
| Isolation | A second auth user cannot finalize tenant A’s id (fails before or during RPC). |

Implementation: `src/lib/onboardingFinalizeLiveVerifyRunner.ts`.

Optional env: `ONBOARDING_FINALIZE_VERIFY_EMAIL_A`, `ONBOARDING_FINALIZE_VERIFY_EMAIL_B`, `ONBOARDING_FINALIZE_VERIFY_PASSWORD` (defaults are stable `@example.test` addresses).

## Completed onboarding re-entry (hook behavior)

Verified **by design** in Slice 3 + guards (not full E2E in CI):

- `shouldAllowDraftSnapshotWrites` prevents debounced **draft** saves immediately after a **completed** snapshot until a **payload** edit sets `hasPendingDraftEdits` (step navigation alone does not).
- `completeOnboarding` always calls `finalizeOnboardingBriefingRuntime` (no block on `briefingStatus === "completed"`).
- After a successful finalize, the hook clears the debounce timer so a late autosave cannot overwrite `completed` with a stale draft.

## Navigation vs payload edits

`markPayloadEditIfCompletedSnapshot` runs only from **`updatePayload`**. Navigating a **completed** briefing (`goNext` / `goBack` / `goToStep`) does **not** set `hasPendingDraftEdits`, so users can review steps without entering draft autosave. Content changes still unlock draft mode for re-save and re-finalization.

## Residual risk

- **Unit/contract tests** (`onboardingFinalizeVerification.test.ts`) still do not execute SQL; they align TS cohorts with the migration and mock the JS client.
- **Live runner** executes the RPC against your configured project but does not substitute for **staging/prod** validation or **RLS policy** review on every table.
- **Cross-tenant** failure is observed when the wrong user calls the finalizer (typically `readPhotographerSettings` returns null under RLS); the RPC’s `auth.uid()` check is exercised on successful same-user calls, not always on a distinct error code for “wrong uid”.
- **No browser E2E** for the React hook: autosave timing remains unverified in CI.
