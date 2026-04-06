/**
 * Distinguish local `supabase functions serve` / docker from deployed Edge (supabase.co).
 * Optional escape hatch: WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS=true (never set in staging/prod).
 */
export function isWebhookWebLocalDevRuntime(): boolean {
  if (Deno.env.get("WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS") === "true") {
    return true;
  }
  const u = (Deno.env.get("SUPABASE_URL") ?? "").trim().toLowerCase();
  if (!u) return true;
  return (
    u.includes("127.0.0.1") ||
    u.includes("localhost") ||
    u.includes("kong:8000") ||
    u.startsWith("http://kong")
  );
}
