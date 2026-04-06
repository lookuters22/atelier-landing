/**
 * Deterministic identity helpers for `contact_points` (DATABASE_SCHEMA.md §5.4).
 * Unique key in DB: (photographer_id, kind, value_normalized).
 */
import { normalizeEmail } from "../utils/normalizeEmail.ts";

export type ContactPointKind =
  | "email"
  | "phone"
  | "whatsapp"
  | "instagram"
  | "other";

export type NormalizedContactPointValue = {
  value_raw: string;
  value_normalized: string;
};

/**
 * Maps raw inbound identity to stable `value_raw` (trimmed display) and
 * `value_normalized` (dedupe key). Email uses shared normalizeEmail; phone/WhatsApp
 * use a minimal E.164-like digit canonicalization; Instagram strips @ and URLs.
 */
export function normalizeContactPointValue(
  kind: ContactPointKind,
  raw: string,
): NormalizedContactPointValue {
  const value_raw = raw.trim();
  switch (kind) {
    case "email":
      return {
        value_raw,
        value_normalized: normalizeEmail(value_raw),
      };
    case "phone":
    case "whatsapp":
      return {
        value_raw,
        value_normalized: normalizePhoneE164Like(value_raw),
      };
    case "instagram":
      return {
        value_raw,
        value_normalized: normalizeInstagramHandle(value_raw),
      };
    case "other":
      return {
        value_raw,
        value_normalized: value_raw.toLowerCase(),
      };
  }
}

/**
 * Shape ready for `supabase.from("contact_points").insert(...)`.
 */
export function toContactPointInsertRow(input: {
  photographer_id: string;
  person_id: string;
  kind: ContactPointKind;
  raw: string;
  is_primary?: boolean;
}): {
  photographer_id: string;
  person_id: string;
  kind: ContactPointKind;
  value_raw: string;
  value_normalized: string;
  is_primary: boolean;
} {
  const { value_raw, value_normalized } = normalizeContactPointValue(
    input.kind,
    input.raw,
  );
  return {
    photographer_id: input.photographer_id,
    person_id: input.person_id,
    kind: input.kind,
    value_raw,
    value_normalized,
    is_primary: input.is_primary ?? false,
  };
}

/** Digits only, optional leading + (minimal E.164-like; extend with lib later if needed). */
function normalizePhoneE164Like(input: string): string {
  const compact = input.trim().replace(/\s/g, "");
  const hasPlus = compact.startsWith("+");
  const digits = compact.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

/** Lowercase handle without @ or common URL prefix. */
function normalizeInstagramHandle(input: string): string {
  let s = input.trim().toLowerCase();
  if (s.startsWith("@")) s = s.slice(1);
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/);
  if (urlMatch) s = urlMatch[1]!;
  return s.replace(/^@/, "");
}
