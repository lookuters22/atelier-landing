/**
 * Pure UI bucket for inbox threads — maps persisted `ai_routing_metadata` + link state
 * to product semantics (no classification; read-only).
 */

export type InboxThreadBucket = "inquiry" | "unfiled" | "operator_review" | "suppressed";

/** Minimal shape for bucket derivation (matches {@link UnfiledThread} fields used). */
export type InboxThreadBucketInput = {
  weddingId: string | null;
  ai_routing_metadata: unknown;
};

const OPERATOR_REVIEW_SENDER_ROLES = new Set<string>([
  "vendor_solicitation",
  "partnership_or_collaboration",
  "billing_or_account_followup",
  "recruiter_or_job_outreach",
]);

function asRecord(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  return meta as Record<string, unknown>;
}

function readStringField(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function readInboxMetadataSenderRole(ai_routing_metadata: unknown): string | null {
  return readStringField(asRecord(ai_routing_metadata), "sender_role");
}

/** Central precedence — see product spec / task brief. */
export function deriveInboxThreadBucket(thread: InboxThreadBucketInput): InboxThreadBucket {
  const meta = asRecord(thread.ai_routing_metadata);
  const disposition = readStringField(meta, "routing_disposition");

  if (disposition === "promo_automated") return "suppressed";

  if (thread.weddingId) return "inquiry";

  const senderRole = readStringField(meta, "sender_role");

  if (senderRole === "customer_lead") return "inquiry";

  if (senderRole && OPERATOR_REVIEW_SENDER_ROLES.has(senderRole)) return "operator_review";

  if (
    disposition === "suggested_match_unresolved" ||
    disposition === "near_match_escalation_candidate" ||
    disposition === "unresolved_human"
  ) {
    return "unfiled";
  }

  return "unfiled";
}

export function isSuppressedInboxThread(thread: InboxThreadBucketInput): boolean {
  return deriveInboxThreadBucket(thread) === "suppressed";
}

/** Today / Zen row pill — unlinked thread actions only. */
export function inboxBucketTodayStatusLabel(thread: InboxThreadBucketInput & { sender?: string }): string {
  const bucket = deriveInboxThreadBucket(thread);
  if (bucket === "suppressed") return "Suppressed";
  if (bucket === "inquiry") return "Inquiry";
  if (bucket === "unfiled") return "Needs filing";
  const meta = asRecord(thread.ai_routing_metadata);
  const role = readStringField(meta, "sender_role");
  if (role === "vendor_solicitation") return "Vendor / pitch";
  if (role === "partnership_or_collaboration") return "Partnership";
  if (role === "billing_or_account_followup") return "Billing / account";
  if (role === "recruiter_or_job_outreach") return "Recruiting";
  return "Operator review";
}

/**
 * ZenLobby hero tag for a priority row derived from a Today action (`message` kind).
 */
export function zenLobbyHeroTagForInboxBucket(
  bucket: InboxThreadBucket,
  senderRole: string | null,
): string {
  if (bucket === "inquiry") return "Inquiry";
  if (bucket === "unfiled") return "Needs filing";
  if (bucket === "operator_review") {
    if (senderRole === "vendor_solicitation") return "Vendor / pitch";
    if (senderRole === "partnership_or_collaboration") return "Partnership";
    if (senderRole === "billing_or_account_followup") return "Billing / account";
    if (senderRole === "recruiter_or_job_outreach") return "Recruiting";
    return "Operator review";
  }
  return "Inbox";
}

/** List row chip for unlinked threads (linked rows use project tags only). */
export function inboxUnlinkedBucketChipLabel(thread: InboxThreadBucketInput): string {
  const bucket = deriveInboxThreadBucket(thread);
  if (bucket === "suppressed") return "Suppressed";
  if (bucket === "inquiry") return "Inquiry";
  if (bucket === "unfiled") return "Needs filing";
  const meta = asRecord(thread.ai_routing_metadata);
  const role = readStringField(meta, "sender_role");
  if (role === "vendor_solicitation") return "Vendor / pitch";
  if (role === "partnership_or_collaboration") return "Partnership";
  if (role === "billing_or_account_followup") return "Billing / account";
  if (role === "recruiter_or_job_outreach") return "Recruiting";
  return "Operator review";
}
