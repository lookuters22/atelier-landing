/**
 * Anonymous tenant for `webhook-web`: HMAC proves knowledge of WEBHOOK_WEB_INGRESS_SECRET
 * for a given photographer_id (execute_v3 Step 3E follow-up).
 *
 * Token format (header `X-Atelier-Ingress-Token` or JSON body `ingress_token`):
 *   `<photographer_uuid>.<64_hex_chars>`
 * where hex is HMAC-SHA256(secret, photographer_uuid_lower) as hex.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = hexToBytes(a.toLowerCase());
  const bb = hexToBytes(b.toLowerCase());
  if (!ab || !bb || ab.length !== bb.length) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

/**
 * Returns verified photographer id for anonymous requests, or null if:
 * - WEBHOOK_WEB_INGRESS_SECRET is unset/empty (caller may treat as "no anonymous tenant"), or
 * - token missing/invalid.
 */
export async function verifyWebhookWebIngressToken(
  req: Request,
  body: Record<string, unknown>,
): Promise<string | null> {
  const secret = Deno.env.get("WEBHOOK_WEB_INGRESS_SECRET") ?? "";
  if (!secret) return null;

  const raw =
    req.headers.get("x-atelier-ingress-token") ??
    (typeof body.ingress_token === "string" ? body.ingress_token : null);
  if (!raw || typeof raw !== "string") return null;

  const lastDot = raw.lastIndexOf(".");
  if (lastDot <= 0) return null;

  const photographerId = raw.slice(0, lastDot).trim();
  const sigHex = raw.slice(lastDot + 1).trim().toLowerCase();
  if (!UUID_RE.test(photographerId) || !/^[0-9a-f]{64}$/.test(sigHex)) {
    return null;
  }

  const canonical = photographerId.toLowerCase();
  const expected = await hmacSha256Hex(secret, canonical);
  if (!timingSafeEqualHex(sigHex, expected)) return null;
  return canonical;
}
