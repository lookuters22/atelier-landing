/**
 * Slice A (ops): bulk-cancel running/recent Inngest function runs for Gmail maintenance workers.
 *
 * Requires Inngest Cloud **Signing key** (same as `INNGEST_SIGNING_KEY` on Supabase Edge for `inngest` serve).
 *
 * Usage (PowerShell):
 *   $env:INNGEST_SIGNING_KEY = "signkey-prod-..."
 *   npx tsx scripts/inngest_cancel_gmail_maintenance_runs.ts
 *
 * Or pass app id if different from `atelier-os`:
 *   $env:INNGEST_APP_ID = "atelier-os"
 *
 * Cancels by `function_id` (Inngest function slug) over the last 7 days. Adjust window in script if needed.
 * See: https://www.inngest.com/docs/guides/cancel-running-functions
 */

const INNGEST_API = "https://api.inngest.com/v1/cancellations";

const GMAIL_MAINTENANCE_FUNCTION_IDS = [
  "prepare-gmail-import-candidate-materialization",
  "backfill-gmail-import-candidate-materialization",
  "repair-gmail-messages-inline-html-artifacts",
  "repair-gmail-import-candidate-artifact-inline-html",
] as const;

async function main(): Promise<void> {
  const key = process.env.INNGEST_SIGNING_KEY?.trim();
  const appId = process.env.INNGEST_APP_ID?.trim() || "atelier-os";
  if (!key) {
    console.error(
      "Missing INNGEST_SIGNING_KEY. Set it to your Inngest signing key, then re-run.\n" +
        "Alternatively: Inngest Cloud → Runs → Bulk cancel (filter by function name).",
    );
    process.exit(1);
  }

  const startedBefore = new Date().toISOString();
  const startedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const results: { function_id: string; ok: boolean; status: number; body: string }[] = [];

  for (const function_id of GMAIL_MAINTENANCE_FUNCTION_IDS) {
    const res = await fetch(INNGEST_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: appId,
        function_id,
        started_after: startedAfter,
        started_before: startedBefore,
      }),
    });
    const body = await res.text();
    results.push({
      function_id,
      ok: res.ok,
      status: res.status,
      body: body.slice(0, 2000),
    });
  }

  console.log(JSON.stringify({ appId, startedAfter, startedBefore, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
