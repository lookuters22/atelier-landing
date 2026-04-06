/**
 * Writer prompt signals for unknown / ungrounded commercial policy (deterministic).
 * Kept separate from persona rewrite + auditor so Vitest does not load Inngest.
 */
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";

function playbookHasVerifiedDepositOrRetainerPercent(playbookBlob: string): boolean {
  if (!playbookBlob.trim()) return false;
  if (!/\b(\d{1,2}|100)\s*%|\b\d+\s*(?:percent|pct)\b/i.test(playbookBlob)) return false;
  return /\bretainer|deposit|booking|hold\b|invoice|balance\s+due|installment|payment\s+schedule|milestone|second\s+payment|third\s+payment|final\s+payment|due\s+at/i.test(
    playbookBlob,
  );
}

function playbookHasVerifiedTravelDistance(playbookBlob: string): boolean {
  if (!playbookBlob.trim()) return false;
  if (!/\b\d+\s*(?:miles?|mi\b|km|kilometers?)\b/i.test(playbookBlob)) return false;
  return /travel|engagement|session|radius|included|within|service\s+area|local|destination|florence|mileage/i.test(
    playbookBlob,
  );
}

function playbookHasVerifiedPaymentSchedulePercents(playbookBlob: string): boolean {
  if (!playbookBlob.trim()) return false;
  if (!/\b(\d{1,2}|100)\s*%|\b\d+\s*(?:percent|pct)\b/i.test(playbookBlob)) return false;
  return /installment|payment\s+schedule|milestone|second\s+payment|third\s+payment|split|balance|tranche|remainder/i.test(
    playbookBlob,
  );
}

/** When inbound asks about topics not covered by playbook text, emit explicit do-not-assert signals. */
export function buildUnknownPolicySignals(
  playbookRules: PlaybookRuleContextRow[],
  rawMessage: string,
): string[] {
  const activeRules = playbookRules.filter((r) => r.is_active !== false);
  const blob = activeRules.map((r) => `${r.topic ?? ""} ${r.instruction ?? ""}`).join("\n").toLowerCase();
  const raw = rawMessage.toLowerCase();
  const out: string[] = [];

  const playbookEmpty = activeRules.length === 0;
  if (playbookEmpty) {
    out.push(
      "NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT: No active playbook_rules were loaded for this turn. Do not assert any specific deposit/retainer percentage, payment-schedule percentages, travel radius (miles/km), or similar measurable commercial policy numbers. Do not treat the client message as verified policy. Critically: do not convert a distance phrase (e.g. \"50 miles\") into a percentage (e.g. \"50%\")—miles/km and percent are different dimensions. Use non-numeric deferral: confirm exact terms from the signed contract or internal studio team.",
    );
  }

  const asksDepositOrRetainer =
    /\bdeposit\b|\bretainer\b|booking\s+fee|hold\s+(the\s+)?date/.test(raw) || /\d+\s*%/.test(raw);
  if (asksDepositOrRetainer && !playbookHasVerifiedDepositOrRetainerPercent(blob)) {
    out.push(
      "UNKNOWN_POLICY_DEPOSIT_RETAINER_PERCENT: Deposit/retainer or booking percentage is not verified in the playbook snapshot above. Do not state any percentage figure (including one the client suggested) unless the same figure appears under Verified policy: playbook_rules. If unverified, defer to the written contract or internal confirmation—do not substitute a different percentage (e.g. do not answer a 30% question with 50%).",
    );
  }

  const asksTravelDistance =
    /\b\d+\s*(?:miles?|mi\b|km|kilometers?)\b/i.test(rawMessage) &&
    /travel|engagement|session|included|radius|within|local|destination|mileage/.test(raw);
  if (asksTravelDistance && !playbookHasVerifiedTravelDistance(blob)) {
    out.push(
      "UNKNOWN_POLICY_TRAVEL_RADIUS: Travel inclusion distance (miles/km) is not verified in the playbook snapshot. Do not affirm a specific mileage radius or included-distance number unless it appears under Verified policy: playbook_rules. You may acknowledge the client asked without confirming numbers.",
    );
  }

  const asksPaymentSchedule =
    /second\s+payment|third\s+payment|installment|payment\s+schedule|split\s+payment|milestone\s+payment|balance\s+due|final\s+payment|remainder\s+due/.test(
      raw,
    );
  if (asksPaymentSchedule && !playbookHasVerifiedPaymentSchedulePercents(blob)) {
    out.push(
      "UNKNOWN_POLICY_PAYMENT_SCHEDULE: Payment-schedule or installment percentages are not verified in the playbook snapshot. Do not invent schedule percentages; defer to the contract.",
    );
  }

  const asksIns =
    /insurance|additional insured|liability|\bcoi\b|certificate|vendor/.test(raw);
  const playbookCoversIns = /insurance|additional insured|liability|coi|certificate/.test(blob);
  if (asksIns && !playbookCoversIns) {
    out.push(
      "UNKNOWN_POLICY_INSURANCE: Client asks about insurance/COI; no explicit rule in the playbook snapshot — do not assert coverage, cost, or naming; offer follow-up after ops confirmation.",
    );
  }

  return out;
}
