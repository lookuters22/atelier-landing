export type StakeholderGroup = "couple" | "planning" | "vendor";

export type ContactAuthority = "primary" | "secondary";

export type DirectoryContact = {
  /** Stable id from `public.people` when loaded from Supabase. */
  personId: string;
  name: string;
  role: string;
  email: string;
  phone?: string;
  weddings: string[];
  stakeholderGroup: StakeholderGroup;
  /** Lead planner / main couple contact (legacy demo; optional for DB-backed rows) */
  authority?: ContactAuthority;
  /** e.g. company / logistics label */
  logisticsRole?: string;
};

const GROUP_LABEL: Record<StakeholderGroup, string> = {
  couple: "Couple",
  planning: "Planning team",
  vendor: "Vendors & logistics",
};

export function groupLabel(g: StakeholderGroup): string {
  return GROUP_LABEL[g];
}
