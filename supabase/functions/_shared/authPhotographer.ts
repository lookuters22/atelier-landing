import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Resolves the authenticated user id (matches `photographers.id` / tenant) from the request JWT.
 */
export async function requirePhotographerIdFromJwt(req: Request): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) {
    throw new Error("Unauthorized");
  }
  return user.id;
}

/**
 * Same as {@link requirePhotographerIdFromJwt} but returns null when there is no
 * Bearer token or the session is invalid (no throw).
 */
export async function getPhotographerIdFromJwtIfPresent(
  req: Request,
): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) return null;
  return user.id;
}
