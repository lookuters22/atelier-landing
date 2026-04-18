/**
 * Phase 4 Step 4F — structured `knowledge_base` onboarding seeds (not one giant prose blob).
 *
 * Runtime may read machine fields from `metadata.onboarding_kb_v1` while `content` stays
 * embedding-friendly deterministic text. DATABASE_SCHEMA §5.14.
 */
import type { Json } from "../types/database.types.ts";
import {
  KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_KEY,
  KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
} from "./onboardingRuntimeOwnership.ts";

export const ONBOARDING_KB_METADATA_KEY = "onboarding_kb_v1" as const;

export const KNOWLEDGE_STRUCTURED_SCHEMA_VERSION = 1 as const;

/**
 * Facts-first body — queryable keys, not a single opaque paragraph.
 */
export type KnowledgeStructuredBodyV1 = {
  schema_version: typeof KNOWLEDGE_STRUCTURED_SCHEMA_VERSION;
  title: string;
  facts: readonly { key: string; value: string }[];
};

export type OnboardingKnowledgeSeed = {
  document_type: string;
  /** Legacy path — freeform text (prefer `structured` for new onboarding). */
  content?: string;
  /** Step 4F — structured facts; when set, drives `content` + `metadata`. */
  structured?: KnowledgeStructuredBodyV1;
  metadata?: Json;
};

function jsonOr<T extends Json>(v: unknown, fallback: T): Json {
  if (v === undefined || v === null) return fallback;
  return v as Json;
}

const EMPTY_OBJECT: Json = {};

export function renderStructuredKnowledgeContent(
  body: KnowledgeStructuredBodyV1,
): string {
  const lines = body.facts.map((f) => `${f.key}: ${f.value}`);
  return [body.title, "", ...lines].join("\n");
}

function mergeMetadata(existing: Json | undefined, patch: Json): Json {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, Json>) }
      : {};
  const p =
    patch && typeof patch === "object" && !Array.isArray(patch)
      ? (patch as Record<string, Json>)
      : {};
  return { ...base, ...p };
}

export type KnowledgeBaseSeedInsertRow = {
  photographer_id: string;
  document_type: string;
  content: string;
  metadata: Json;
};

/**
 * Maps onboarding KB seeds to rows. Structured seeds merge `onboarding_kb_v1` into metadata.
 */
export function buildKnowledgeBaseSeedInsertsFromOnboarding(
  photographerId: string,
  seeds: OnboardingKnowledgeSeed[] | undefined,
): KnowledgeBaseSeedInsertRow[] {
  const list = seeds ?? [];
  return list.map((k) => knowledgeSeedToRow(photographerId, k));
}

function knowledgeSeedToRow(
  photographerId: string,
  k: OnboardingKnowledgeSeed,
): KnowledgeBaseSeedInsertRow {
  if (k.structured) {
    const content = renderStructuredKnowledgeContent(k.structured);
    const metadata = mergeMetadata(k.metadata, {
      [ONBOARDING_KB_METADATA_KEY]: k.structured as unknown as Json,
      [KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_KEY]: KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
    });
    return {
      photographer_id: photographerId,
      document_type: k.document_type,
      content,
      metadata,
    };
  }

  if (typeof k.content === "string") {
    const trimmed = k.content.trim();
    if (trimmed.length > 0) {
      const metadata = mergeMetadata(k.metadata, {
        [KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_KEY]: KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
      });
      return {
        photographer_id: photographerId,
        document_type: k.document_type,
        content: trimmed,
        metadata,
      };
    }
  }

  throw new Error(
    "OnboardingKnowledgeSeed: provide `structured` or non-empty `content`",
  );
}
