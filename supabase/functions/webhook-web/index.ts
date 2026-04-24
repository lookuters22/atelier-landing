/**
 * Stateless Web Support webhook — **pre-ingress web path retired** (orchestrator retirement execution Slice A).
 *
 * **Does not** emit `comms/web.received`. Successful auth/ingress checks end in **410 Gone** with
 * `web_pre_ingress_retired` so operators and clients get an explicit signal. Gmail/thread post-ingest routing is
 * unchanged (`inbox/thread.requires_triage.v1`).
 *
 * Legacy payload shapes (parsed only for ingress token verification when applicable):
 *  - Test button / lead form: { source, lead: { name, email, event_date, message }, ingress_token? }
 *  - Support widget:          { message: "...", ingress_token? }
 *
 * Tenant resolution (execute_v3 Step 3E + ingress hardening) — unchanged for anonymous/JWT gates:
 *  1. If `Authorization: Bearer <jwt>` is present and valid → request allowed past JWT gate.
 *  2. Else (anonymous): in deployed environments `WEBHOOK_WEB_INGRESS_SECRET` must be set and a
 *     valid ingress token is required; missing secret → 500 (misconfiguration).
 *  3. In local dev (SUPABASE_URL host is localhost / 127.0.0.1 / kong, or
 *     WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS=true), anonymous may omit tenant when secret is unset.
 *
 * Anonymous ingress token (same value in header or body):
 *   Header: `X-Atelier-Ingress-Token: <uuid>.<64_hex_hmac>`
 *   Body:   `ingress_token` same string
 *   HMAC:   SHA256-HMAC( WEBHOOK_WEB_INGRESS_SECRET, lowercased(uuid) ) as 64 hex chars.
 */
import { getPhotographerIdFromJwtIfPresent } from "../_shared/authPhotographer.ts";
import { isWebhookWebLocalDevRuntime } from "../_shared/webhookWebRuntime.ts";
import { verifyWebhookWebIngressToken } from "../_shared/webhookIngressToken.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-atelier-ingress-token",
  "Content-Type": "application/json",
};

const WEB_PRE_INGRESS_RETIRED_BODY = JSON.stringify({
  error: "web_pre_ingress_retired",
  hint: "This endpoint no longer emits comms/web.received. Use the supported replacement path.",
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const jwtTenant = await getPhotographerIdFromJwtIfPresent(req);

    if (jwtTenant !== null) {
      // JWT valid — endpoint still retired (no Inngest emit).
    } else {
      const ingressSecret = Deno.env.get("WEBHOOK_WEB_INGRESS_SECRET") ?? "";
      const localDev = isWebhookWebLocalDevRuntime();

      if (ingressSecret.length > 0) {
        const verified = await verifyWebhookWebIngressToken(req, body);
        if (!verified) {
          return new Response(
            JSON.stringify({
              error: "missing_or_invalid_ingress_token",
              hint:
                "Set X-Atelier-Ingress-Token or body.ingress_token to <uuid>.<hmac_hex> signed with WEBHOOK_WEB_INGRESS_SECRET, or authenticate with Bearer JWT.",
            }),
            { status: 401, headers: CORS_HEADERS },
          );
        }
      } else if (localDev) {
        // Loose local dev — still retired.
      } else {
        return new Response(
          JSON.stringify({
            error: "ingress_secret_not_configured",
            hint:
              "Set Edge secret WEBHOOK_WEB_INGRESS_SECRET for anonymous webhook-web. Local dev uses loose mode when SUPABASE_URL is localhost/127.0.0.1/kong or WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS=true.",
          }),
          { status: 500, headers: CORS_HEADERS },
        );
      }
    }

    return new Response(WEB_PRE_INGRESS_RETIRED_BODY, {
      status: 410,
      headers: CORS_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
