/**
 * V3 deterministic output auditor — validates structured `committed_terms` from the persona writer
 * against CRM + playbook + case-memory headers (no LLM).
 */
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";

/** Narrow structured extraction contract (persona writer output). */
export type CommercialCommittedTerms = {
  package_names: string[];
  deposit_percentage: number | null;
  travel_miles_included: number | null;
};

export type AuthoritativeCommercialContext = {
  crmPackageName: string | null;
  /** Lowercased concatenation of active playbook topics + instructions. */
  playbookBlobLc: string;
  /** Title + summary lines from memory headers (approved case memory surface). */
  caseMemoryBlobLc: string;
};

export function buildAuthoritativeCommercialContext(
  decisionContext: DecisionContext,
  playbookRules: PlaybookRuleContextRow[],
): AuthoritativeCommercialContext {
  const snap = decisionContext.crmSnapshot ?? {};
  const pkg =
    typeof snap.package_name === "string" && snap.package_name.trim().length > 0
      ? snap.package_name.trim()
      : null;

  const active = playbookRules.filter((r) => r.is_active !== false);
  const playbookBlobLc = active
    .map((r) => `${r.topic ?? ""} ${r.instruction ?? ""}`)
    .join("\n")
    .toLowerCase();

  const headers = decisionContext.memoryHeaders ?? [];
  const caseMemoryBlobLc = headers
    .map((h) => `${h.title ?? ""} ${h.summary ?? ""}`)
    .join("\n")
    .toLowerCase();

  return {
    crmPackageName: pkg,
    playbookBlobLc,
    caseMemoryBlobLc,
  };
}

function extractAllowedDepositPercentsFromPlaybook(playbookBlobLc: string): Set<number> {
  const allowed = new Set<number>();
  if (!/(retainer|deposit|booking|hold|invoice|installment|payment|milestone|balance)/.test(playbookBlobLc)) {
    return allowed;
  }
  const matches = playbookBlobLc.matchAll(/\b(\d{1,2}|100)\s*%/g);
  for (const m of matches) {
    allowed.add(parseInt(m[1]!, 10));
  }
  return allowed;
}

function extractAllowedTravelMilesFromPlaybook(playbookBlobLc: string): Set<number> {
  const allowed = new Set<number>();
  if (!/(travel|engagement|session|radius|included|within|mile|km|florence|destination)/.test(playbookBlobLc)) {
    return allowed;
  }
  const matches = playbookBlobLc.matchAll(/\b(\d{1,4})\s*(?:miles?|mi\b|km|kilometers?)\b/g);
  for (const m of matches) {
    allowed.add(parseInt(m[1]!, 10));
  }
  return allowed;
}

function packageNameGrounded(name: string, ctx: AuthoritativeCommercialContext): boolean {
  const n = name.trim().toLowerCase();
  if (n.length < 2) return false;
  if (ctx.crmPackageName && ctx.crmPackageName.trim().toLowerCase() === n) return true;
  if (ctx.crmPackageName && ctx.crmPackageName.toLowerCase().includes(n)) return true;
  if (ctx.playbookBlobLc.includes(n)) return true;
  if (ctx.caseMemoryBlobLc.includes(n)) return true;
  return false;
}

/** Heuristic: email prose asserts a booking/deposit percentage near commercial keywords. */
function extractDepositPercentsClaimedInProse(emailLc: string): number[] {
  const out: number[] = [];
  const re = /\b(\d{1,2}|100)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(emailLc)) !== null) {
    const idx = m.index ?? 0;
    const window = emailLc.slice(Math.max(0, idx - 80), Math.min(emailLc.length, idx + 80));
    if (/(retainer|deposit|booking|hold|invoice|payment|balance)/.test(window)) {
      out.push(parseInt(m[1]!, 10));
    }
  }
  return out;
}

function extractTravelMilesClaimedInProse(emailLc: string): number[] {
  const out: number[] = [];
  const re = /\b(\d{1,4})\s*(?:miles?|mi\b)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(emailLc)) !== null) {
    const idx = m.index ?? 0;
    const window = emailLc.slice(Math.max(0, idx - 100), Math.min(emailLc.length, idx + 100));
    if (/(travel|engagement|session|included|within|radius|florence|tuscany)/.test(window)) {
      out.push(parseInt(m[1]!, 10));
    }
  }
  return out;
}

export type AuditDraftTermsResult =
  | { isValid: true }
  | { isValid: false; violations: string[] };

/**
 * Deterministic validation: committed_terms must not claim package/deposit/travel numbers
 * absent from CRM, playbook text, or case-memory headers. Optionally cross-check email prose
 * vs structured extraction for obvious mismatches.
 */
export function auditDraftTerms(
  committedTerms: CommercialCommittedTerms,
  authoritative: AuthoritativeCommercialContext,
  emailDraft?: string,
): AuditDraftTermsResult {
  const violations: string[] = [];

  const depositAllowed = extractAllowedDepositPercentsFromPlaybook(authoritative.playbookBlobLc);
  const travelAllowed = extractAllowedTravelMilesFromPlaybook(authoritative.playbookBlobLc);

  for (const raw of committedTerms.package_names ?? []) {
    const name = String(raw).trim();
    if (name.length === 0) continue;
    if (!packageNameGrounded(name, authoritative)) {
      violations.push(
        `package_name not grounded: "${name}" (must appear in CRM package_name, playbook_rules text, or case memory headers).`,
      );
    }
  }

  if (committedTerms.deposit_percentage !== null && committedTerms.deposit_percentage !== undefined) {
    const p = Math.round(Number(committedTerms.deposit_percentage));
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      violations.push(`deposit_percentage out of range: ${committedTerms.deposit_percentage}`);
    } else if (!depositAllowed.has(p)) {
      violations.push(
        `deposit_percentage ${p}% is not present in verified playbook_rules text (CRM does not carry deposit %).`,
      );
    }
  }

  if (committedTerms.travel_miles_included !== null && committedTerms.travel_miles_included !== undefined) {
    const miles = Math.round(Number(committedTerms.travel_miles_included));
    if (!Number.isFinite(miles) || miles < 0 || miles > 50000) {
      violations.push(`travel_miles_included out of range: ${committedTerms.travel_miles_included}`);
    } else if (!travelAllowed.has(miles)) {
      violations.push(
        `travel_miles_included ${miles} is not present in verified playbook_rules text with travel/distance context.`,
      );
    }
  }

  if (emailDraft && emailDraft.trim().length > 0) {
    const el = emailDraft.toLowerCase();
    const prosePercents = extractDepositPercentsClaimedInProse(el);
    for (const pp of prosePercents) {
      if (!depositAllowed.has(pp)) {
        violations.push(
          `email_draft asserts deposit/booking percentage ${pp}% in prose without matching verified playbook_rules text.`,
        );
      }
    }
    const proseMiles = extractTravelMilesClaimedInProse(el);
    for (const pm of proseMiles) {
      if (!travelAllowed.has(pm)) {
        violations.push(
          `email_draft asserts travel/mileage ${pm} in prose without matching verified playbook_rules text.`,
        );
      }
    }
    if (
      committedTerms.deposit_percentage !== null &&
      committedTerms.deposit_percentage !== undefined &&
      prosePercents.length > 0 &&
      !prosePercents.includes(Math.round(Number(committedTerms.deposit_percentage)))
    ) {
      violations.push(
        "email_draft deposit percentages do not match structured committed_terms.deposit_percentage.",
      );
    }
  }

  if (violations.length === 0) return { isValid: true };
  return { isValid: false, violations: [...new Set(violations)] };
}
