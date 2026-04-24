/**
 * Stateless Web Support webhook — zero business logic (.cursorrules Section 5).
 * Parse body, emit `comms/web.received`, return 200.
 *
 * **Pre-ingress retention:** This Edge function is the **intentional in-repo emitter** for dashboard/web traffic into
 * `triageFunction`. Pre-ingress routing remains registered by design (`legacyRoutingCutoverGate.ts`); do not treat this
 * emit as removable without an explicit product/ops decision to reroute or retire web pre-ingress.
 *
 * Accepts two payload shapes:
 *  - Test button / lead form: { source, lead: { name, email, event_date, message }, ingress_token? }
 *  - Support widget:          { message: "...", ingress_token? }
 *
 * Tenant resolution (execute_v3 Step 3E + ingress hardening):
 *  1. If `Authorization: Bearer <jwt>` is present and valid → photographer_id = JWT user id
 *     (Supabase Auth user id must match `photographers.id`).
 *  2. Else (anonymous): in deployed environments `WEBHOOK_WEB_INGRESS_SECRET` must be set and a
 *     valid ingress token is required; missing secret → 500 (misconfiguration).
 *  3. In local dev (SUPABASE_URL host is localhost / 127.0.0.1 / kong, or
 *     WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS=true), anonymous may omit tenant when secret is unset.
 *
 * Anonymous ingress token (same value in header or body):
 *   Header: `X-Atelier-Ingress-Token: <uuid>.<64_hex_hmac>`
 *   Body:   `ingress_token` same string
 *   HMAC:   SHA256-HMAC( WEBHOOK_WEB_INGRESS_SECRET, lowercased(uuid) ) as 64 hex chars.
 *
 * Generate server-side only, e.g. (Node): crypto.createHmac('sha256', secret).update(uuid.toLowerCase()).digest('hex')
 */
import { getPhotographerIdFromJwtIfPresent } from "../_shared/authPhotographer.ts";
import { isWebhookWebLocalDevRuntime } from "../_shared/webhookWebRuntime.ts";
import { verifyWebhookWebIngressToken } from "../_shared/webhookIngressToken.ts";
import { inngest } from "../_shared/inngest.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-atelier-ingress-token",
  "Content-Type": "application/json",
};

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
    const lead = body.lead as Record<string, unknown> | undefined;

    let rawMessage: Record<string, unknown>;

    if (lead) {
      const name = (lead.name as string) ?? "";
      const email = (lead.email as string) ?? "";
      const eventDate = (lead.event_date as string) ?? "";
      const msg = (lead.message as string) ?? "";

      rawMessage = {
        body: `New inquiry from ${name} (${email}):\nDesired date: ${eventDate}\n\n${msg}`,
        email,
        name,
        event_date: eventDate,
        source: body.source ?? "web_lead",
      };
    } else {
      rawMessage = {
        body: (body.message as string) ?? "",
        source: "web_widget",
      };
    }

    const jwtTenant = await getPhotographerIdFromJwtIfPresent(req);
    let photographer_id: string | undefined;

    if (jwtTenant !== null) {
      photographer_id = jwtTenant;
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
        photographer_id = verified;
      } else if (localDev) {
        photographer_id = undefined;
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

    /**
     * Intentional in-repo pre-ingress: `comms/web.received` → `triageFunction`. Retained until explicit retirement;
     * see `LEGACY_PRE_INGRESS_ROUTING_RETENTION_STATUS_SUMMARY` and orchestrator decommission docs.
     */
    await inngest.send({
      name: "comms/web.received",
      data: {
        raw_message: rawMessage,
        photographer_id,
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
