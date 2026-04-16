import type { KnowledgeStructuredBodyV1, OnboardingKnowledgeSeed } from "./onboardingKnowledgeBaseStructured.ts";
import { KNOWLEDGE_STRUCTURED_SCHEMA_VERSION } from "./onboardingKnowledgeBaseStructured.ts";

/** Single structured knowledge seed for sensitive policy language (draft-only until finalize). */
export const BRIEFING_VAULT_V1_DOC = "briefing_vault_v1" as const;

/** Flat fact keys — wording only; authority remains in playbook seeds / scheduling matrix. */
export const BRIEFING_VAULT_FACT_KEYS = [
  "discount_language",
  "payment_exception_language",
  "late_extension_language",
  "raw_files_language",
  "publication_permission_language",
  "privacy_language",
] as const;

export type BriefingVaultFactKey = (typeof BRIEFING_VAULT_FACT_KEYS)[number];

export type BriefingVaultFacts = Partial<Record<BriefingVaultFactKey, string>>;

export function parseBriefingVaultFactsFromSeeds(seeds: OnboardingKnowledgeSeed[] | undefined): BriefingVaultFacts {
  const seed = seeds?.find((s) => s.document_type === BRIEFING_VAULT_V1_DOC);
  const facts = seed?.structured?.facts;
  if (!facts?.length) return {};
  const out: BriefingVaultFacts = {};
  for (const f of facts) {
    if (BRIEFING_VAULT_FACT_KEYS.includes(f.key as BriefingVaultFactKey)) {
      out[f.key as BriefingVaultFactKey] = f.value;
    }
  }
  return out;
}

export function buildBriefingVaultKnowledgeSeed(facts: BriefingVaultFacts): OnboardingKnowledgeSeed {
  const rows: { key: string; value: string }[] = [];
  for (const k of BRIEFING_VAULT_FACT_KEYS) {
    const v = facts[k]?.trim();
    if (v) rows.push({ key: k, value: v });
  }
  const structured: KnowledgeStructuredBodyV1 = {
    schema_version: KNOWLEDGE_STRUCTURED_SCHEMA_VERSION,
    title: "Sensitive policy language (briefing draft)",
    facts: rows,
  };
  return {
    document_type: BRIEFING_VAULT_V1_DOC,
    structured,
  };
}

/** Replace the vault seed; drop it entirely when every fact is empty. */
export function upsertBriefingVaultSeed(
  seeds: OnboardingKnowledgeSeed[] | undefined,
  facts: BriefingVaultFacts,
): OnboardingKnowledgeSeed[] {
  const list = [...(seeds ?? [])].filter((s) => s.document_type !== BRIEFING_VAULT_V1_DOC);
  const vault = buildBriefingVaultKnowledgeSeed(facts);
  if (vault.structured && vault.structured.facts.length === 0) {
    return list;
  }
  return [...list, vault];
}
