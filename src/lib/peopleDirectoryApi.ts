import { supabase } from "./supabase";
import type { Tables } from "../types/database.types";
import { normalizeMailboxForComparison } from "./mailboxNormalize";
import { parseCompanyFromNotes, parseRoleFromNotes, buildContactNotes } from "./peopleDirectoryNotes";
import type { DirectoryContact, StakeholderGroup } from "../data/contactsDirectory";

export const directoryPeopleQueryKey = (photographerId: string) =>
  ["directory", "people", photographerId] as const;

export type ContactCreateInput = {
  fullName: string;
  email: string;
  phone?: string;
  company?: string;
  role?: string;
  notes?: string;
};

type PersonRow = Pick<Tables<"people">, "id" | "kind" | "display_name" | "notes"> & {
  contact_points: Pick<Tables<"contact_points">, "kind" | "value_raw" | "value_normalized" | "is_primary">[] | null;
};

function stakeholderGroupFromKind(kind: Tables<"people">["kind"]): StakeholderGroup {
  return kind === "organization" ? "vendor" : "couple";
}

function mapPersonToDirectoryContact(row: PersonRow): DirectoryContact | null {
  const points = row.contact_points ?? [];
  const emails = points.filter((p) => p.kind === "email");
  const primary =
    emails.find((e) => e.is_primary) ?? emails[0];
  if (!primary?.value_raw) return null;
  const phones = points.filter((p) => p.kind === "phone");
  const primaryPhone = phones.find((p) => p.is_primary) ?? phones[0];

  return {
    personId: row.id,
    name: row.display_name,
    role: parseRoleFromNotes(row.notes),
    email: primary.value_raw.trim(),
    phone: primaryPhone?.value_raw.trim() || undefined,
    weddings: [],
    stakeholderGroup: stakeholderGroupFromKind(row.kind),
    logisticsRole: parseCompanyFromNotes(row.notes),
  };
}

export async function fetchDirectoryContacts(photographerId: string): Promise<DirectoryContact[]> {
  const { data, error } = await supabase
    .from("people")
    .select(
      "id, kind, display_name, notes, contact_points ( kind, value_raw, value_normalized, is_primary )",
    )
    .eq("photographer_id", photographerId)
    .order("display_name", { ascending: true });

  if (error) {
    console.error("fetchDirectoryContacts:", error.message);
    throw new Error(error.message);
  }

  const rows = (data ?? []) as PersonRow[];
  const out: DirectoryContact[] = [];
  for (const row of rows) {
    const c = mapPersonToDirectoryContact(row);
    if (c) out.push(c);
  }
  return out;
}

export async function findPersonIdByEmail(
  photographerId: string,
  emailRaw: string,
): Promise<string | null> {
  const value_normalized = normalizeMailboxForComparison(emailRaw);
  const { data, error } = await supabase
    .from("contact_points")
    .select("person_id")
    .eq("photographer_id", photographerId)
    .eq("kind", "email")
    .eq("value_normalized", value_normalized)
    .maybeSingle();

  if (error) {
    console.error("findPersonIdByEmail:", error.message);
    return null;
  }
  return data?.person_id ?? null;
}

export async function createDirectoryContact(
  photographerId: string,
  input: ContactCreateInput,
): Promise<
  { ok: true; personId: string } | { ok: false; error: string; existingPersonId?: string }
> {
  const email = input.email.trim();
  if (!email) return { ok: false, error: "Email is required." };
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Name is required." };

  const value_normalized = normalizeMailboxForComparison(email);
  const existing = await findPersonIdByEmail(photographerId, email);
  if (existing) return { ok: false, error: "already_exists", existingPersonId: existing };

  const hasCompany = Boolean(input.company?.trim());
  const kind = hasCompany ? "organization" : "individual";
  const canonical = fullName.toLowerCase().replace(/\s+/g, " ").trim();
  const notes = buildContactNotes({
    role: input.role,
    company: input.company,
    userNotes: input.notes,
  });

  const { data: person, error: pe } = await supabase
    .from("people")
    .insert({
      photographer_id: photographerId,
      kind,
      display_name: fullName,
      canonical_name: canonical,
      notes,
    })
    .select("id")
    .single();

  if (pe || !person) {
    return { ok: false, error: pe?.message ?? "Could not create contact." };
  }

  const personId = person.id;

  const { error: ce } = await supabase.from("contact_points").insert({
    photographer_id: photographerId,
    person_id: personId,
    kind: "email",
    value_raw: email,
    value_normalized,
    is_primary: true,
  });

  if (ce) {
    await supabase.from("people").delete().eq("id", personId).eq("photographer_id", photographerId);
    if (ce.code === "23505") {
      const pid = await findPersonIdByEmail(photographerId, email);
      if (pid) return { ok: false, error: "already_exists", existingPersonId: pid };
    }
    return { ok: false, error: ce.message };
  }

  const phone = input.phone?.trim();
  if (phone) {
    const phoneNorm = phone.replace(/\s+/g, " ").toLowerCase();
    await supabase.from("contact_points").insert({
      photographer_id: photographerId,
      person_id: personId,
      kind: "phone",
      value_raw: phone,
      value_normalized: phoneNorm,
      is_primary: true,
    });
  }

  return { ok: true, personId };
}
