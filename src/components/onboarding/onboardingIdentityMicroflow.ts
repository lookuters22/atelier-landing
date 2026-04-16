/**
 * Identity microflow — field order and editorial prompts only.
 * Values still read/write `payload.settings_identity` via same keys (no second persistence model).
 */

export type IdentityMicroflowFieldId =
  | "studio_name"
  | "currency"
  | "timezone"
  | "manager_name"
  | "photographer_names"
  | "admin_mobile_number";

export type IdentityMicroflowField = {
  id: IdentityMicroflowFieldId;
  /** Prompt shown to the photographer (not a chatbot line). */
  prompt: string;
  /** Optional hint below the control. */
  hint?: string;
  /** Short label for confirmed summary rows. */
  shortLabel: string;
};

export const IDENTITY_MICROFLOW_FIELDS: readonly IdentityMicroflowField[] = [
  {
    id: "studio_name",
    prompt: "What is your studio called?",
    shortLabel: "Studio",
  },
  {
    id: "currency",
    prompt: "Which currency do you usually quote in?",
    shortLabel: "Currency",
  },
  {
    id: "timezone",
    prompt: "What timezone should Ana use for scheduling and reminders?",
    shortLabel: "Timezone",
  },
  {
    id: "manager_name",
    prompt: "Who should Ana name as the manager when it matters?",
    shortLabel: "Manager",
  },
  {
    id: "photographer_names",
    prompt: "Who are the photographers on the team?",
    shortLabel: "Photographers",
  },
  {
    id: "admin_mobile_number",
    prompt: "Operator WhatsApp in E.164 for urgent escalations (optional)",
    hint: "Same role as Settings admin_mobile_number. Leave blank if you prefer not to add it yet.",
    shortLabel: "Operator WhatsApp",
  },
];

function trimVal(v: string | undefined): string {
  return v?.trim() ?? "";
}

/**
 * First empty required field, else optional mobile if prior fields filled, else last index when all filled.
 */
export function initialIdentityMicroflowIndex(
  get: (id: IdentityMicroflowFieldId) => string | undefined,
): number {
  for (let i = 0; i < IDENTITY_MICROFLOW_FIELDS.length; i++) {
    const f = IDENTITY_MICROFLOW_FIELDS[i]!;
    if (f.id === "admin_mobile_number") {
      if (trimVal(get("admin_mobile_number")).length === 0) return i;
      continue;
    }
    if (trimVal(get(f.id)).length === 0) return i;
  }
  return IDENTITY_MICROFLOW_FIELDS.length - 1;
}

export function formatIdentityConfirmedValue(id: IdentityMicroflowFieldId, get: (k: IdentityMicroflowFieldId) => string | undefined): string {
  const v = trimVal(get(id));
  if (v.length === 0) return "—";
  return v;
}
