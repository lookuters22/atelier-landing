# Gmail import rollout runbook

Operational reference for shipping and running Gmail label import (G1–G6 + async grouped approval). No feature design — deploy, monitor, repair.

## 0. Project alignment and env source of truth

### Where the app gets Supabase settings

| Layer | Source |
|-------|--------|
| **Local dev** | Repo-root `.env`, `.env.local`, or host-specific Vite env files (not committed). Template: **`.env.example`**. |
| **Hosted preview/production** | CI/hosting env vars injected at **`vite build`** time. There is **no** runtime override in the browser for `VITE_*`. |
| **Client code** | `src/lib/supabase.ts` reads **`import.meta.env.VITE_SUPABASE_URL`** and **`import.meta.env.VITE_SUPABASE_ANON_KEY`**. |

### Single rule for Edge Functions

Every Edge function URL is:

`https://<project-ref>.supabase.co/functions/v1/<function-name>`

The **`<project-ref>` in `VITE_SUPABASE_URL` must be the same project** where you run `supabase functions deploy` (or deploy from the Dashboard). If the SPA is built with project **A**’s URL but functions are only on project **B**, invokes fail (wrong host, missing function, or auth mismatch).

### How to verify alignment (no secrets)

1. **Dashboard:** Project **Settings → API** → copy **Project URL** (same shape as `VITE_SUPABASE_URL`).
2. **Built app:** In the browser, **DevTools → Network** → trigger any Edge call (e.g. open Inbox). The request URL for `/functions/v1/...` must use **that same host**.
3. **CLI:** `npx supabase projects list` / `npx supabase link --project-ref <ref>` — `<ref>` must match the subdomain in `VITE_SUPABASE_URL`.
4. **After deploy:** `npx supabase functions list --project-ref <ref>` — confirm **`gmail-send`**, **`gmail-list-labels`**, **`gmail-modify-message`**, **`inngest`** appear.

### `FunctionsFetchError` (“Failed to send a request to the Edge Function”)

This is thrown when the **browser `fetch` fails before an HTTP response** (TLS/DNS/offline/VPN/wrong host/mixed-content). It is **not** proof the function code is wrong; it usually means **wrong URL, network path, or build-time env pointing at the wrong project**. After fixing env and redeploying the SPA, rebuild so `VITE_*` embeds the correct project.

---

## 1. Deploy bundle (what must ship together)

### Database migrations (apply in timestamp order on hosted Supabase)

| Migration | Purpose |
|-----------|---------|
| `20260426120000_gmail_import_connected_accounts_import_candidates.sql` | Gmail staging foundation |
| `20260410120000_import_candidates_materialization_prepare.sql` | G2 prepare columns |
| `20260427120000_import_candidates_materialization.sql` | Materialization artifact columns |
| `20260412120000_gmail_render_artifacts.sql` | G3 `gmail_render_artifacts` + message FK |
| `20260428120000_gmail_label_import_groups_g5.sql` | G5 `gmail_label_import_groups` + FK on `import_candidates` |
| `20260429120000_gmail_label_import_groups_async_approval.sql` | Async approval counters + `import_approval_error` |
| `20260411120000_v_threads_inbox_latest_message.sql` | G4 Inbox projection view |
| `20260415120100_v_threads_inbox_latest_provider_message_id.sql` | Adds `latest_provider_message_id` to `v_threads_inbox_latest_message` for Gmail star/read sync (`gmail-modify-message`) |
| `20260416120100_backfill_messages_provider_message_id_from_gmail_import.sql` | Backfills `messages.provider_message_id` from `metadata.gmail_import.gmail_message_id` where missing |
| `20260430170000_gmail_watch_history_delta.sql` | `import_candidates.source_type` includes `gmail_history`; `connected_accounts` Gmail watch + `gmail_last_history_id` checkpoint + degraded flags |

If any migration is missing, typical symptoms: **PGRST205** on `v_threads_inbox_latest_message`, **Postgres 42703** on `latest_provider_message_id` if the frontend selects that column before the migration is applied (the app retries without the column as a narrow fallback), missing columns on `import_candidates`, or grouped approval errors.

After applying migrations that change views, regenerate `src/types/database.types.ts` (Supabase CLI `gen types typescript --linked` or your project’s usual script) so the `v_threads_inbox_latest_message` Row includes `latest_provider_message_id`.

### Supabase Edge Functions (Gmail-related)

| Function | Role |
|----------|------|
| `auth-google-init` | OAuth start |
| `auth-google-callback` | OAuth callback |
| `gmail-list-labels` | Label cache read + enqueue refresh (Inbox sidebar + Settings); requires `connected_account_gmail_label_cache` and Inngest `import/gmail.labels_refresh.v1` worker |
| `gmail-modify-message` | Inbox star/read: Gmail `users.messages.modify` + merge `gmail_label_ids` into `messages.metadata` |
| `gmail-send` | Inbox reply + scratch compose: Gmail `users.messages.send`; records canonical `messages` rows |
| `gmail-enqueue-label-sync` | Emits `import/gmail.label_sync.v1` to Inngest |
| `gmail-pubsub-webhook` | Google Pub/Sub push → decode Gmail notification → Inngest `import/gmail.delta_sync.v1` (`verify_jwt = false`; optional `GMAIL_PUBSUB_WEBHOOK_SECRET` header `x-gmail-pubsub-secret`) |
| `import-candidate-review` | Single approve/dismiss, grouped approve queue, `retry_group_failed` |
| `inngest` | Serves Inngest worker bundle (see below) |

### Inngest app (`inngest` Edge function)

Workers that touch Gmail:

| Worker id | Event / trigger |
|-----------|-----------------|
| `sync-gmail-label-import-candidates` | `import/gmail.label_sync.v1` |
| `gmail-labels-refresh-cache` | `import/gmail.labels_refresh.v1` (fills `connected_account_gmail_label_cache` after `gmail-list-labels` enqueues) |
| `prepare-gmail-import-candidate-materialization` | `import/gmail.candidate.prepare_materialization.v1` |
| `backfill-gmail-import-candidate-materialization` | Cron `*/15 * * * *` |
| `process-gmail-label-group-approval` | `import/gmail.label_group_approve.v1` |
| `process-gmail-delta-sync` | `import/gmail.delta_sync.v1` — `users.history.list` delta; checkpoint `gmail_last_history_id`; 404 → degraded + bounded `messages.list` catch-up + re-baseline |
| `renew-gmail-watch` | `import/gmail.watch_renew.v1` — `users.watch` with env `GMAIL_PUBSUB_TOPIC_NAME` |
| `gmail-delta-sanity-sweep` | Cron hourly — enqueues delta for connected accounts (cap 50) |
| `renew-gmail-watch-sweep` | Cron daily — renews watch when expiring within 48h or never renewed |

### Environment / secrets (Supabase Edge + Inngest)

| Secret | Purpose |
|--------|---------|
| `INNGEST_EVENT_KEY` | Emit events from `gmail-enqueue-label-sync` and Edge |
| `INNGEST_SIGNING_KEY` | Verify Inngest → `inngest` function invokes |
| `INNGEST_ALLOW_IN_BAND_SYNC` | Set `1` so Cloud sync registers full function list |
| `INNGEST_SERVE_HOST` | Optional; `https://<project-ref>.supabase.co` if sync URL wrong |
| `GMAIL_PUBSUB_TOPIC_NAME` | Full Pub/Sub topic resource name for `users.watch` (project-level; not stored per account) |
| `GMAIL_PUBSUB_WEBHOOK_SECRET` | Optional; when set, Pub/Sub push must send header `x-gmail-pubsub-secret` matching this value |

Frontend `.env`: `VITE_SUPABASE_URL`, anon key; Google OAuth redirect must match hosted project.

### Gmail near-real-time delta (watch + Pub/Sub + history)

1. **GCP:** Create Pub/Sub topic; grant Gmail API publisher `serviceAccount:gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on the topic. Create a push subscription to `https://<project-ref>.supabase.co/functions/v1/gmail-pubsub-webhook` (OIDC optional; shared secret supported via `GMAIL_PUBSUB_WEBHOOK_SECRET`).
2. **Supabase secrets:** Set `GMAIL_PUBSUB_TOPIC_NAME` and `INNGEST_EVENT_KEY` (webhook enqueues Inngest). Deploy `gmail-pubsub-webhook` and redeploy `inngest` so workers register.
3. **Watch:** Daily `renew-gmail-watch-sweep` renews `users.watch` when `gmail_watch_expiration` is null or within 48 hours. First-time baseline: renewal sets `gmail_last_history_id` when it was null.
4. **Checkpoint:** `gmail_last_history_id` advances only after a full successful delta run (all history pages + per-message work). Invalid `startHistoryId` (404) marks `gmail_sync_degraded`, runs bounded catch-up (`newer_than:7d` message list), then re-baselines from `users.getProfile`.

#### Rollout verification (CLI + Dashboard)

**Secrets must exist server-side (not only in `.env` for local scripts).** From a linked project:

```bash
npx supabase secrets list
```

**Blocking:** `GMAIL_PUBSUB_TOPIC_NAME` **must** appear in that list. If it is missing, `renew-gmail-watch` fails with `GMAIL_PUBSUB_TOPIC_NAME_unset` and `connected_accounts.gmail_watch_expiration` stays null — Pub/Sub push will enqueue the webhook, but incremental sync cannot bootstrap watch state from renewal until this is set:

```bash
npx supabase secrets set GMAIL_PUBSUB_TOPIC_NAME="projects/<gcp-project>/topics/<topic-name>"
```

(Optional) If the Edge function validates the push:

```bash
npx supabase secrets set GMAIL_PUBSUB_WEBHOOK_SECRET="<shared-secret>"
```

Configure the Pub/Sub push subscription to send header `x-gmail-pubsub-secret: <same value>` when the secret is set.

**Confirm DB columns exist** (after migration `20260430170000_gmail_watch_history_delta.sql`):

```bash
npx supabase db query --linked "SELECT id, email, gmail_watch_expiration, gmail_last_history_id, gmail_sync_degraded, gmail_delta_sync_last_error FROM public.connected_accounts WHERE provider = 'google' LIMIT 20;"
```

Healthy registration: `gmail_watch_expiration` and usually `gmail_watch_last_renewed_at` are non-null; `gmail_last_history_id` becomes non-null after first successful watch or first delta bootstrap; `gmail_sync_degraded` false and `gmail_delta_sync_last_error` null after a clean run.

**Manual Inngest triggers (Inngest Cloud → Send test event)** — use tenant ids from `connected_accounts` / Dashboard:

| Event name | Payload (`data`) |
|------------|------------------|
| `import/gmail.watch_renew.v1` | `{ "schemaVersion": 1, "photographerId": "<uuid>", "connectedAccountId": "<uuid>" }` |
| `import/gmail.delta_sync.v1` | `{ "schemaVersion": 2, "photographerId": "<uuid>", "connectedAccountId": "<uuid>", "traceId"?: "<uuid>" }` (worker also accepts `schemaVersion: 1`) |

After `GMAIL_PUBSUB_TOPIC_NAME` is set, send **`watch_renew`** first, then **`delta_sync`** to populate `gmail_last_history_id` if needed.

**CLI activation (optional):** From repo root, with `INNGEST_EVENT_KEY` and tenant ids in `.env` (or exported in the shell):

```bash
# Copy Event key from Inngest Cloud (app atelier-os). Use connected_accounts.photographer_id and connected_accounts.id.
GMAIL_ROLLOUT_PHOTOGRAPHER_ID="<uuid>" GMAIL_ROLLOUT_CONNECTED_ACCOUNT_ID="<uuid>" npm run gmail:rollout:activation-events
```

Script: [`scripts/gmail_rollout_send_activation_events.ts`](../scripts/gmail_rollout_send_activation_events.ts) — posts `import/gmail.watch_renew.v1` then `import/gmail.delta_sync.v1` to `https://inn.gs/e/...` (same transport as `v3_inngest_event_key_probe.ts`).

#### End-to-end smoke tests (target environment)

Run in order after GCP push subscription and secrets are correct:

1. **Unknown thread:** From an external address, send a **new** email to the connected Gmail inbox (new subject / new thread). Expect a Pub/Sub delivery → `gmail-pubsub-webhook` 200 → Inngest `process-gmail-delta-sync` → new or updated `import_candidates` row with `source_type = 'gmail_history'` and `source_identifier` equal to the Gmail thread id (check SQL or Inbox staging UI).
2. **Known thread reply:** Reply in Gmail to a thread that already exists in Atelier with `threads.external_thread_key = 'gmail:<gmailThreadId>'`. Expect a new `messages` row with `direction = 'in'` and `provider_message_id` = Gmail message id (dedupe via unique index).
3. **Outbound not re-ingested:** Send from Atelier, then reply from Gmail. The outbound message must not appear as inbound (SENT skip + `provider_message_id` dedupe); the customer reply must insert as inbound.
4. **Hourly sanity:** Wait for `gmail-delta-sanity-sweep` or send `import/gmail.delta_sync.v1` again. No duplicate `messages` for the same `provider_message_id`; `gmail_last_history_id` should only move forward after successful runs.

**GCP:** The CLI cannot verify IAM or subscription URLs; confirm in Google Cloud Console (topic, subscription endpoint, `gmail-api-push` publisher role).

### Gmail labels: cache vs live refresh (operational chain)

1. **`gmail-list-labels` Edge** — Reads **`connected_account_gmail_label_cache`**, returns cached labels to the UI. It may **enqueue** event **`import/gmail.labels_refresh.v1`** for a background refresh (uses **`INNGEST_EVENT_KEY`** and shared Inngest client in `supabase/functions/_shared/inngest.ts`).
2. **Inngest Cloud** — Must have the app’s **Sync URL** = `https://<project-ref>.supabase.co/functions/v1/inngest` with **`INNGEST_SIGNING_KEY`** set on the project. **`INNGEST_ALLOW_IN_BAND_SYNC=1`** is strongly recommended so the full worker list (including **`gmail-labels-refresh-cache`**) registers.
3. **Worker `processGmailLabelsRefresh`** (`supabase/functions/inngest/functions/processGmailLabelsRefresh.ts`) — Calls Gmail **`labels.list`**, writes fresh JSON into the cache row, clears **`refresh_in_progress`**.

**Why you can see labels with a “degraded” or stale refresh:** the sidebar can still show **last good cache** while the **enqueue** or **worker** path fails (missing **`INNGEST_EVENT_KEY`**, wrong signing key, **`inngest`** not deployed or not synced, OAuth/token issues in the worker). That is distinct from **`gmail-send`** failing with **`FunctionsFetchError`**, which is usually **browser → wrong Supabase host** or **offline**; still, **all** of these features require **§0 project alignment**.

### Deploy Gmail inbox Edge bundle (repo script)

From a machine with Supabase CLI logged in and linked to the target project, this runs **three** sequential deploys (`gmail-send`, `gmail-modify-message`, `gmail-list-labels`):

```bash
npm run deploy:gmail-inbox-edge
```

(The Supabase CLI deploys **one function per invocation**; the script chains them.)

Then deploy the Inngest worker bundle (includes label refresh worker):

```bash
npm run deploy:inngest
```

---

## 2. Structured logs (grep-friendly)

All JSON lines below are written with `console.log(JSON.stringify(...))` — filter Edge/Inngest logs by `type`.

| `type` | When | Rollout focus |
|--------|------|----------------|
| `gmail_label_sync_metrics` | After label sync worker step | Throughput, `threads_get_calls`, failures |
| `gmail_import_prepare_v1` | Prepare success or failure | `outcome`, `has_render_artifact_id`, `fallback_flags.prepare_inline_html_not_storage` |
| `gmail_import_prepare_persist_html_failed_v1` | G3 Storage upload returned null | Storage policy / bucket issues |
| `gmail_import_approve_materialize_v1` | After each new thread+message from approve | `approve_fallback_no_prepared_artifact`, `html_fallback_inline_not_storage`, `fallback_flags.live_attachments_not_staged` |
| `gmail_import_edge_v1` | import-candidate-review actions | `stage`: `approve_single`, `approve_group_queued`, `retry_group_queued`, `dismiss_*` |
| `gmail_import_group_worker_v1` | Group worker chunks / finalize / guard skip | Chunk progress, terminal `group_status_after` |
| `gmail_import_attachments` / `gmail_import_attachments_staged_finalize` | Legacy attachment logs (still present) | `used_prepared_artifact` |

**What to watch during rollout**

- Spike in **`approve_fallback_no_prepared_artifact`** → prepare not running or failing; check `gmail_import_prepare_v1` and backfill cron.
- Spike in **`html_fallback_inline_not_storage`** or **`gmail_import_prepare_persist_html_failed_v1`** → G3 Storage path; check bucket and RLS.
- Spike in **`live_attachments_not_staged`** → staged attachment path missed; check prepare staging.
- **`gmail_import_group_worker_v1`** `guard_skip` → duplicate event or wrong group state.
- **`finalize_done`** with `group_status_after` stuck `approving` → investigate DB + Inngest run failure.

---

## 3. Common failure signatures

| Symptom | Likely cause |
|---------|----------------|
| `PGRST205` on `v_threads_inbox_latest_message` | G4 view migration not applied or PostgREST cache |
| `enqueue_failed` / no Inngest run | `INNGEST_EVENT_KEY` wrong or function not synced |
| Events accepted, no workers | Missing `INNGEST_ALLOW_IN_BAND_SYNC`, or wrong `serve` URL |
| Group stuck `approving` | Worker error; check `gmail_import_group_worker_v1` and DB `approval_*` |
| `gmail_label_group_approval_in_progress` on sync | Expected while batch is `approving` |
| Settings “unknown column” on import_candidates | Materialization migrations not applied |
| Partial batch + error text mentioning chunk limit | \>600 rows per run; use **Retry pending rows** or raise `MAX_CHUNKS` in code later |
| Inbox compose/reply: UI shows **Failed to send a request to the Edge Function** (Supabase client) | That string is **`FunctionsFetchError`**: the browser `fetch` to `/functions/v1/gmail-send` failed **before** an HTTP response (offline, DNS, TLS, wrong host, VPN/firewall). It is **not** the same as HTTP 404 (missing function), which surfaces as **Edge Function returned a non-2xx status code** instead. Fix: verify network; confirm `VITE_SUPABASE_URL` / anon key match the project you deployed; deploy **`gmail-send`**: `supabase functions deploy gmail-send --project-ref <ref>`. |
| **Edge Function returned a non-2xx** on send | Open browser devtools → Network on `gmail-send`: **401** → session/JWT; **404** → function not deployed on this project or wrong URL; **400** → read JSON `error` (OAuth, validation). |
| `gmail_watch_expiration` always null; renew Inngest run error | `GMAIL_PUBSUB_TOPIC_NAME` not set in **Supabase Edge secrets** (`supabase secrets list` — must show the key). |
| Pub/Sub delivers but webhook 401 | `GMAIL_PUBSUB_WEBHOOK_SECRET` set in Supabase but push subscription missing header `x-gmail-pubsub-secret`. |
| Webhook 200 but no delta processing | Missing or wrong `INNGEST_EVENT_KEY`; or Inngest app not synced to `https://<ref>.supabase.co/functions/v1/inngest`. |

---

## 4. Repair / backfill guidance

### Rows without `gmail_label_import_group_id`

- **Cause:** Staged before G5 or snippet-only sync bug (fixed).
- **Action:** New syncs attach a group. For old rows: either leave (approve single-thread) or one-off SQL to set `gmail_label_import_group_id` only if you can map to the correct `gmail_label_import_groups.id` (risky). Prefer **re-sync label** after migration so new batches get groups.

### Messages without G3 render refs (`render_html_ref`)

- **Cause:** Prepare/approve fallback, or Storage persist failed.
- **Action:** Inbox still resolves inline `body_html_sanitized` when present. Optional backfill: re-run prepare worker for candidate, or accept mixed state until natural re-import.

### `import_candidates` stuck `not_prepared` / `prepare_failed`

- **Cause:** Prepare worker error, Gmail token, or transient Gmail API.
- **Action:** Fix OAuth if needed; **backfill** cron runs every 15m. Manual: re-trigger sync to re-emit prepare events, or call prepare path via Inngest with candidate id (operational).

### Partially approved groups (`partially_approved` / `failed` with pending rows)

- **Action:** Settings **Retry pending rows** (Edge `retry_group_failed`). Failing rows show `import_approval_error` in the table.

### Operator UX

- Settings shows **Batch needs attention**, progress bars for `approving`, and **Retry pending rows** when applicable (`SettingsHubPage.tsx`).

---

## 5. Compact rollout checklist

- [ ] Apply all migrations listed in §1 (order by filename timestamp). For inbox-only Gmail UX, follow **§7** minimum migrations.
- [ ] Confirm **§0** project alignment (`VITE_SUPABASE_URL` host = deployed project).
- [ ] Deploy Edge: `npm run deploy:gmail-inbox-edge` plus `gmail-enqueue-label-sync`, `import-candidate-review`, `npm run deploy:inngest`, OAuth functions as needed for your scope.
- [ ] Set `INNGEST_*` secrets; confirm Inngest Cloud shows all four Gmail-related workers.
- [ ] Smoke: connect Gmail → list labels → sync label → verify `gmail_label_sync_metrics` log.
- [ ] Smoke: staged rows → prepare logs (`gmail_import_prepare_v1`) → approve one → `gmail_import_approve_materialize_v1`.
- [ ] Smoke: approve batch → `gmail_import_edge_v1` `approve_group_queued` → worker logs → group terminal status.
- [ ] Smoke: Inbox loads (no PGRST205 on `v_threads_inbox_latest_message`).
- [ ] Smoke: Inbox scratch compose send and thread reply (Gmail-backed thread with `latest_provider_message_id`) succeed; if invoke fails, confirm `gmail-send` is deployed to the same project as `VITE_SUPABASE_URL`.
- [ ] Alert/monitor: log queries for `fallback_flags` on approve materialize (optional dashboard).

---

## 6. Remaining operational risks

- **Large batches:** Hard cap ~600 rows per Inngest run (see `gmailGroupImportLimits.ts` / worker `MAX_CHUNKS`); remainder requires **Retry** or code change.
- **Counter RMW:** Group approval counters use read-modify-write; single worker assumption — avoid manual concurrent updates to same group.
- **Old clients:** Without migrations, Edge returns 500 or missing columns — deploy DB first.

---

## 7. Gmail inbox end-to-end checklist (compose, reply, star/read, labels)

Use this as the **single path** to get Inbox Gmail features working in a real environment. Order matters.

### Database

- [ ] Apply migrations (at minimum for inbox Gmail actions):
  - `20260415120100_v_threads_inbox_latest_provider_message_id.sql` — exposes `latest_provider_message_id` on inbox view for star/read.
  - `20260416120100_backfill_messages_provider_message_id_from_gmail_import.sql` — backfills `messages.provider_message_id` from Gmail import metadata *(filename uses `…16120100…`; do not use a duplicate `20260416120000_*` version — see §1 table)*.
- [ ] Apply other Gmail migrations your environment still needs (see §1 table).
- [ ] Regenerate **`src/types/database.types.ts`** if the view/schema changed (`supabase gen types typescript --linked` or your usual script).

### Environment (see §0)

- [ ] **`VITE_SUPABASE_URL`** and **`VITE_SUPABASE_ANON_KEY`** for the **built** app match **Settings → API** for the target project.
- [ ] Supabase project secrets: **`INNGEST_EVENT_KEY`**, **`INNGEST_SIGNING_KEY`**, **`INNGEST_ALLOW_IN_BAND_SYNC=1`** (recommended), optional **`INNGEST_SERVE_HOST`**.
- [ ] Inngest Cloud: Sync URL **`https://<project-ref>.supabase.co/functions/v1/inngest`**, app matches this project.

### Edge deploy

- [ ] `npm run deploy:gmail-inbox-edge` **or** deploy **`gmail-send`**, **`gmail-modify-message`**, **`gmail-list-labels`** to the **same** project as §0.
- [ ] `npm run deploy:inngest` so **`gmail-labels-refresh-cache`** and other Gmail workers are live.

### Smoke tests

- [ ] **Labels:** Open Inbox or Settings labels — cache loads; trigger refresh and confirm Inngest run for **`gmail-labels-refresh-cache`** (or logs) when not degraded.
- [ ] **Star/read:** On a Gmail-backed row with **`latest_provider_message_id`**, star/unstar and mark read/unread.
- [ ] **Reply:** Open Gmail-backed thread → reply → send succeeds.
- [ ] **Compose:** Scratch compose → send → new thread appears.

**Blocked in this repo alone:** Actual deploy to your Supabase project and Inngest Cloud require **your** credentials and network. The commands above are the **exact** intended success path; run them from a linked CLI session and confirm **`supabase functions list`** includes the functions in §0.
