import type { KnowledgeStructuredBodyV1, OnboardingKnowledgeSeed } from "./onboardingKnowledgeBaseStructured.ts";
import { KNOWLEDGE_STRUCTURED_SCHEMA_VERSION } from "./onboardingKnowledgeBaseStructured.ts";

export const BRIEFING_VOICE_V1_DOC = "briefing_voice_v1" as const;

/** Explicit short fact keys for draft voice (no long prose). */
export const BRIEFING_VOICE_FACT_KEYS = [
  "tone_archetype",
  "signature_closing",
  "banned_phrases",
  "standard_booking_language",
  "standard_scope_language",
] as const;

export type BriefingVoiceFactKey = (typeof BRIEFING_VOICE_FACT_KEYS)[number];

export type ToneArchetypeId =
  | "warm_editorial"
  | "direct_minimal"
  | "luxury_formal"
  | "friendly_casual";

export const TONE_ARCHETYPES: readonly {
  id: ToneArchetypeId;
  label: string;
}[] = [
  { id: "warm_editorial", label: "Warm editorial" },
  { id: "direct_minimal", label: "Direct & minimal" },
  { id: "luxury_formal", label: "Luxury formal" },
  { id: "friendly_casual", label: "Friendly casual" },
];

/** Deterministic preview copy (not LLM). */
export const TONE_PREVIEW_BY_ARCHETYPE: Record<
  ToneArchetypeId,
  { before: string; after: string }
> = {
  warm_editorial: {
    before: "We need pricing today or we walk.",
    after: "We’d love a clear sense of investment when you have a moment — no rush on our side.",
  },
  direct_minimal: {
    before: "Can you send something detailed about packages?",
    after: "Packages: reply with tier + price. One follow-up if unclear.",
  },
  luxury_formal: {
    before: "Hey, what do you charge?",
    after: "Thank you for reaching out. We’d be pleased to share tailored investment details following a brief introduction.",
  },
  friendly_casual: {
    before: "Not sure if we can afford you lol",
    after: "Totally fair question — happy to suggest a path that fits, no awkwardness.",
  },
};

export type BriefingVoiceFacts = Partial<Record<BriefingVoiceFactKey, string>>;

export function parseBriefingVoiceFactsFromSeeds(
  seeds: OnboardingKnowledgeSeed[] | undefined,
): BriefingVoiceFacts {
  const seed = seeds?.find((s) => s.document_type === BRIEFING_VOICE_V1_DOC);
  const facts = seed?.structured?.facts;
  if (!facts?.length) return {};
  const out: BriefingVoiceFacts = {};
  for (const f of facts) {
    if (BRIEFING_VOICE_FACT_KEYS.includes(f.key as BriefingVoiceFactKey)) {
      out[f.key as BriefingVoiceFactKey] = f.value;
    }
  }
  return out;
}

export function buildBriefingVoiceKnowledgeSeed(facts: BriefingVoiceFacts): OnboardingKnowledgeSeed {
  const rows: { key: string; value: string }[] = [];
  for (const k of BRIEFING_VOICE_FACT_KEYS) {
    const v = facts[k]?.trim();
    if (v) rows.push({ key: k, value: v });
  }
  const structured: KnowledgeStructuredBodyV1 = {
    schema_version: KNOWLEDGE_STRUCTURED_SCHEMA_VERSION,
    title: "Studio voice (briefing draft)",
    facts: rows,
  };
  return {
    document_type: BRIEFING_VOICE_V1_DOC,
    structured,
  };
}

export function upsertBriefingVoiceSeed(
  seeds: OnboardingKnowledgeSeed[] | undefined,
  facts: BriefingVoiceFacts,
): OnboardingKnowledgeSeed[] {
  const list = [...(seeds ?? [])].filter((s) => s.document_type !== BRIEFING_VOICE_V1_DOC);
  const voice = buildBriefingVoiceKnowledgeSeed(facts);
  if (voice.structured && voice.structured.facts.length === 0) {
    return list;
  }
  return [...list, voice];
}
