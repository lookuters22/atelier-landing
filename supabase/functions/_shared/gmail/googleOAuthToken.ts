/**
 * Google OAuth token refresh + expiry skew (shared by Edge + Inngest).
 */
import { fetchWithTimeout } from "../http/fetchWithTimeout.ts";

const GOOGLE_OAUTH_FETCH_TIMEOUT_MS = 30_000;

/**
 * On OAuth reconnect, Google often omits `refresh_token`. Never overwrite a stored refresh token with null.
 * Use the new value only when Google returns a non-empty string; otherwise keep `existingStored`.
 */
export function mergeGoogleReconnectRefreshToken(
  incomingFromGoogle: string | undefined | null,
  existingStored: string | null | undefined,
): string | null {
  const trimmed = typeof incomingFromGoogle === "string" ? incomingFromGoogle.trim() : "";
  if (trimmed.length > 0) return trimmed;
  const prev = typeof existingStored === "string" ? existingStored.trim() : "";
  if (prev.length > 0) return prev;
  return null;
}

/** Default: refresh if access token expires within this many ms. */
export const DEFAULT_ACCESS_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export function shouldRefreshAccessToken(
  expiresAtIso: string | null,
  skewMs: number = DEFAULT_ACCESS_TOKEN_REFRESH_SKEW_MS,
): boolean {
  if (!expiresAtIso) return true;
  const exp = new Date(expiresAtIso).getTime();
  if (Number.isNaN(exp)) return true;
  return Date.now() >= exp - skewMs;
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
};

export async function exchangeGoogleAuthorizationCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    timeoutMs: GOOGLE_OAUTH_FETCH_TIMEOUT_MS,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : "code_exchange_failed";
    throw new Error(`Google code exchange: ${err}`);
  }
  if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") {
    throw new Error("Google code exchange: invalid response");
  }
  return {
    access_token: json.access_token,
    expires_in: json.expires_in,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : "Bearer",
  };
}

export async function exchangeGoogleRefreshToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    timeoutMs: GOOGLE_OAUTH_FETCH_TIMEOUT_MS,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : "token_refresh_failed";
    throw new Error(`Google token refresh: ${err}`);
  }
  if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") {
    throw new Error("Google token refresh: invalid response");
  }
  return {
    access_token: json.access_token,
    expires_in: json.expires_in,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : "Bearer",
  };
}
