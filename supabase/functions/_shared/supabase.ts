/**
 * Server-side Supabase client for Edge Functions (service role).
 * Bypasses RLS — use with care and always filter by tenant.
 *
 * Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Supabase Edge secrets (Dashboard or `supabase secrets set`).
 * Falls back to `VITE_SUPABASE_URL` so local `.env` naming matches the frontend without duplicating keys.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

function resolveSupabaseUrl(): string {
  const raw = (Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "").trim();
  if (!raw) {
    throw new Error(
      "Missing SUPABASE_URL or VITE_SUPABASE_URL (set in Supabase Edge secrets for deployed functions)",
    );
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new Error("bad protocol");
    }
  } catch {
    throw new Error(
      `Invalid Supabase URL (must be https://…supabase.co). Got: ${raw.slice(0, 48)}…`,
    );
  }
  return raw.replace(/\/+$/, "");
}

function resolveServiceRoleKey(): string {
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (service_role JWT from Supabase API settings)");
  }
  return key;
}

export const supabaseAdmin = createClient(resolveSupabaseUrl(), resolveServiceRoleKey());
