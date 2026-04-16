/**
 * Google Cloud Pub/Sub push → decode Gmail notification → enqueue Inngest `import/gmail.delta_sync.v1`.
 * Configure subscription push endpoint + optional `GMAIL_PUBSUB_WEBHOOK_SECRET` (header `x-gmail-pubsub-secret`).
 */
import {
  gmailMailboxLookupVariants,
  parseGmailPubSubNotification,
} from "../_shared/gmail/gmailPubSubPush.ts";
import {
  GMAIL_DELTA_SYNC_V1_EVENT,
  GMAIL_DELTA_SYNC_V1_SCHEMA_VERSION,
  inngest,
} from "../_shared/inngest.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const traceId = crypto.randomUUID();
  console.log(
    "[gmail.pubsub.webhook]",
    JSON.stringify({ trace_id: traceId, phase: "received", t: new Date().toISOString(), method: req.method }),
  );

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("GMAIL_PUBSUB_WEBHOOK_SECRET")?.trim();
  if (secret) {
    const h = req.headers.get("x-gmail-pubsub-secret");
    if (h !== secret) {
      console.warn("[gmail.pubsub.webhook] auth rejected secret_mismatch");
      return json({ error: "unauthorized" }, 401);
    }
    console.log("[gmail.pubsub.webhook] auth ok");
  } else {
    console.log("[gmail.pubsub.webhook] auth skipped GMAIL_PUBSUB_WEBHOOK_SECRET unset");
  }

  let body: unknown;
  try {
    body = (await req.json()) as unknown;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = parseGmailPubSubNotification(body);
  if (!parsed) {
    console.warn("[gmail.pubsub.webhook] parse failed invalid_pubsub_or_gmail_payload");
    return json({ error: "invalid_pubsub_or_gmail_payload" }, 400);
  }

  console.log(
    "[gmail.pubsub.webhook] parsed emailAddress=",
    parsed.emailAddress,
    "historyId=",
    parsed.historyId ?? "(none)",
  );

  let row: { id: string; photographer_id: string; email?: string } | null = null;
  let lastLookupErr: string | null = null;
  const variants = gmailMailboxLookupVariants(parsed.emailAddress);
  console.log("[gmail.pubsub.webhook] mailbox_lookup_variants=", JSON.stringify(variants));

  for (const em of variants) {
    const { data, error } = await supabaseAdmin
      .from("connected_accounts")
      .select("id, photographer_id, email")
      .eq("provider", "google")
      .ilike("email", em)
      .maybeSingle();
    if (error) {
      lastLookupErr = error.message;
      break;
    }
    if (data?.id && data.photographer_id) {
      row = data as { id: string; photographer_id: string; email?: string };
      break;
    }
  }

  if (lastLookupErr) {
    console.error("[gmail.pubsub.webhook] lookup_failed", lastLookupErr);
    return json({ error: "lookup_failed" }, 500);
  }
  if (!row?.id || !row.photographer_id) {
    console.warn(
      "[gmail.pubsub.webhook] unknown_mailbox email=",
      parsed.emailAddress,
      "variants_tried=",
      variants.length,
    );
    return json({ ok: true, ignored: "unknown_mailbox" });
  }

  console.log(
    "[gmail.pubsub.webhook] connected_account resolved id=",
    row.id,
    "photographer_id=",
    row.photographer_id,
  );

  try {
    await inngest.send({
      name: GMAIL_DELTA_SYNC_V1_EVENT,
      data: {
        schemaVersion: GMAIL_DELTA_SYNC_V1_SCHEMA_VERSION,
        photographerId: row.photographer_id as string,
        connectedAccountId: row.id as string,
        traceId,
        ...(typeof parsed.historyId === "string" && parsed.historyId.length > 0
          ? { notificationHistoryId: parsed.historyId }
          : {}),
      },
    });
    console.log(
      "[gmail.pubsub.webhook]",
      JSON.stringify({
        trace_id: traceId,
        phase: "enqueue_complete",
        t: new Date().toISOString(),
        event: GMAIL_DELTA_SYNC_V1_EVENT,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gmail.pubsub.webhook] inngest enqueue_failed", msg);
    return json({ error: "enqueue_failed" }, 500);
  }

  return json({ ok: true, enqueued: true, trace_id: traceId });
});
