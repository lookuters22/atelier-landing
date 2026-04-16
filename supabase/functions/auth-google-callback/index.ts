/**
 * Google OAuth redirect — exchanges code, upserts connected_accounts + oauth_tokens (service_role only).
 */
import {
  exchangeGoogleAuthorizationCode,
  mergeGoogleReconnectRefreshToken,
} from "../_shared/gmail/googleOAuthToken.ts";
import { verifyGoogleOAuthState } from "../_shared/gmail/googleOAuthState.ts";
import { fetchWithTimeout } from "../_shared/http/fetchWithTimeout.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

function redirectToApp(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const appRedirect = Deno.env.get("GMAIL_OAUTH_APP_REDIRECT_URL")?.trim();
  if (!appRedirect) {
    return new Response("Missing GMAIL_OAUTH_APP_REDIRECT_URL", { status: 500 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const fail = (reason: string) => redirectToApp(`${appRedirect}${appRedirect.includes("?") ? "&" : "?"}gmail_error=${encodeURIComponent(reason)}`);

  if (oauthError) {
    return fail(oauthError);
  }
  if (!code || !state) {
    return fail("missing_code_or_state");
  }

  const stateSecret = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET")?.trim();
  if (!stateSecret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const payload = await verifyGoogleOAuthState(state, stateSecret);
  if (!payload) {
    return fail("invalid_state");
  }

  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim();
  const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    return new Response("Server misconfigured", { status: 500 });
  }

  let tokens: Awaited<ReturnType<typeof exchangeGoogleAuthorizationCode>>;
  try {
    tokens = await exchangeGoogleAuthorizationCode(code, clientId, clientSecret, redirectUri);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg);
  }

  const userRes = await fetchWithTimeout("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    timeoutMs: 30_000,
  });
  if (!userRes.ok) {
    return fail("userinfo_failed");
  }
  const user = (await userRes.json()) as { sub?: string; email?: string; name?: string };
  if (!user.sub || !user.email) {
    return fail("missing_identity");
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { data: existingRow, error: findErr } = await supabaseAdmin
    .from("connected_accounts")
    .select("id")
    .eq("photographer_id", payload.photographerId)
    .eq("provider", "google")
    .eq("provider_account_id", user.sub)
    .maybeSingle();

  if (findErr) {
    console.error("[auth-google-callback]", findErr.message);
    return fail("db_error");
  }

  const { data: existingTokens } = existingRow?.id
    ? await supabaseAdmin
        .from("connected_account_oauth_tokens")
        .select("refresh_token")
        .eq("connected_account_id", existingRow.id)
        .maybeSingle()
    : { data: null };

  const refreshTokenToStore = mergeGoogleReconnectRefreshToken(
    tokens.refresh_token,
    existingTokens?.refresh_token ?? null,
  );

  const { error: rpcErr } = await supabaseAdmin.rpc("complete_google_oauth_connection", {
    p_photographer_id: payload.photographerId,
    p_provider: "google",
    p_provider_account_id: user.sub,
    p_email: user.email,
    p_display_name: user.name ?? null,
    p_token_expires_at: expiresAt,
    p_access_token: tokens.access_token,
    p_refresh_token: refreshTokenToStore,
  });

  if (rpcErr) {
    console.error("[auth-google-callback]", rpcErr.message);
    return fail("db_error");
  }

  return redirectToApp(`${appRedirect}${appRedirect.includes("?") ? "&" : "?"}gmail=connected`);
});
