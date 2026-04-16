/**
 * SPA-safe Gmail OAuth start: returns JSON { url } so the client can attach JWT via invoke,
 * then navigate with window.location.href (no blind <a href> to this URL).
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { maskGoogleOAuthClientId } from "../_shared/gmail/googleOAuthDebug.ts";
import { signGoogleOAuthState, type GoogleOAuthStatePayload } from "../_shared/gmail/googleOAuthState.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
/** Required for `users.messages.send` — Google lists this among accepted scopes: https://developers.google.com/gmail/api/reference/rest/v1/users.messages/send#authorization-scopes */
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
/** Required for `users.messages.modify` (labels, star, read/unread). https://developers.google.com/gmail/api/reference/rest/v1/users.messages/modify#authorization-scopes */
const GMAIL_MODIFY = "https://www.googleapis.com/auth/gmail.modify";
const USERINFO_EMAIL = "https://www.googleapis.com/auth/userinfo.email";
const OPENID = "openid";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const photographerId = await requirePhotographerIdFromJwt(req);

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")?.trim();
    const stateSecret = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET")?.trim();
    if (!clientId || !redirectUri || !stateSecret) {
      console.error(
        "[auth-google-init] missing GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_REDIRECT_URI, or GOOGLE_OAUTH_STATE_SECRET",
      );
      return json({ error: "Server misconfigured" }, 500);
    }

    let redirectHost = "(invalid_redirect_uri)";
    let redirectPath = "";
    try {
      const ru = new URL(redirectUri);
      redirectHost = ru.host;
      redirectPath = ru.pathname;
    } catch {
      console.error("[auth-google-init] GOOGLE_OAUTH_REDIRECT_URI is not a valid URL");
      return json({ error: "Server misconfigured" }, 500);
    }

    console.info(
      "[auth-google-init] oauth_url_ready",
      JSON.stringify({
        client_id_masked: maskGoogleOAuthClientId(clientId),
        redirect_uri_host: redirectHost,
        redirect_uri_path: redirectPath,
      }),
    );

    const payload: GoogleOAuthStatePayload = {
      v: 1,
      photographerId,
      exp: Math.floor(Date.now() / 1000) + 15 * 60,
      nonce: crypto.randomUUID(),
    };
    const state = await signGoogleOAuthState(payload, stateSecret);

    const scope = [GMAIL_READONLY, GMAIL_SEND, GMAIL_MODIFY, USERINFO_EMAIL, OPENID].join(" ");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
      access_type: "offline",
      prompt: "consent",
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Unauthorized" || msg.startsWith("Missing or invalid")) {
      return json({ error: msg }, 401);
    }
    console.error("[auth-google-init]", msg);
    return json({ error: msg }, 500);
  }
});
