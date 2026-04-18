/**
 * Slice 4 — onboarding runtime finalization verification (no live DB).
 * @see docs/v3/ONBOARDING_RUNTIME_FINALIZATION_SLICE4_VERIFICATION.md
 *
 * V2 scope model tests. See `onboardingBusinessScopeDeterministic.ts` for the
 * canonical enum set, `onboardingBusinessScopeExtensions.ts` for the extensions
 * shape, and `scope_selectors_rework_2f0918f2` plan for the full rollout.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizeOnboardingBriefingRuntime } from "./completeOnboardingRuntime.ts";
import {
  FINALIZE_ONBOARDING_KB_DELETE_ONBOARDING_SOURCE,
  FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES,
} from "./onboardingFinalizeRpcContract.ts";
import {
  mapOnboardingPayloadToStorage,
  type OnboardingPayloadV4,
} from "./onboardingV4Payload.ts";
import {
  BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
  resolveBusinessScopeExtensions,
} from "./onboardingBusinessScopeExtensions.ts";
import {
  BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
  migrateLegacyCanonicalsToV2,
} from "./onboardingBusinessScopeDeterministic.ts";
import { resolveBusinessScopeDeterministic } from "./onboardingBriefingScopeDefaults.ts";
import {
  KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_KEY,
  KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
  ONBOARDING_OWNED_PLAYBOOK_RULE_SOURCE_TYPES,
} from "./onboardingRuntimeOwnership.ts";
import type { Database } from "../types/database.types.ts";
import { ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY } from "../types/onboardingBriefing.types.ts";

/** Must match `20260430200000_finalize_onboarding_briefing_v1.sql` DELETE cohort order-insensitive. */
const MIGRATION_PLAYBOOK_DELETE_COHORT = [
  "onboarding_briefing_v1",
  "onboarding_briefing_default_v1",
  "onboarding_briefing_matrix_v1",
  "onboarding_briefing_escalation_v1",
  "onboarding",
  "onboarding_default",
  "onboarding_matrix",
] as const;

function sortStr(a: string, b: string): number {
  return a.localeCompare(b);
}

describe("finalize_onboarding_briefing_v1 contract (TS ↔ SQL)", () => {
  it("exports the same playbook DELETE cohort as the migration (sorted compare)", () => {
    const a = [...FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES].sort(sortStr);
    const b = [...MIGRATION_PLAYBOOK_DELETE_COHORT].sort(sortStr);
    expect(a).toEqual(b);
  });

  it("KB replacement targets only onboarding_briefing_v1 metadata rows", () => {
    expect(FINALIZE_ONBOARDING_KB_DELETE_ONBOARDING_SOURCE).toBe(
      KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
    );
  });
});

describe("mapOnboardingPayloadToStorage — first completion & re-finalization mapping", () => {
  const photographerId = "11111111-1111-1111-1111-111111111111";

  it("merges identity, onboarding_completed_at, preserves studio_business_profiles shape, and tags KB rows", () => {
    const iso = "2026-04-16T12:00:00.000Z";
    const payload: OnboardingPayloadV4 = {
      settings_identity: {
        studio_name: "Studio X",
        manager_name: "Alex",
        timezone: "Europe/Belgrade",
      },
      settings_meta: {
        onboarding_completed_at: iso,
        playbook_version: 1,
      },
      studio_scope: {
        service_types: [],
      },
      playbook_seeds: [
        {
          scope: "global",
          action_key: "reply",
          topic: "general",
          decision_mode: "draft_only",
          instruction: "Be kind",
        },
      ],
      knowledge_seeds: [
        {
          document_type: "studio_facts",
          content: "We shoot film.",
        },
      ],
    };

    const m = mapOnboardingPayloadToStorage(photographerId, payload);
    expect(m.settingsPatch.studio_name).toBe("Studio X");
    expect(m.settingsPatch.manager_name).toBe("Alex");
    expect(m.settingsPatch.timezone).toBe("Europe/Belgrade");
    expect(m.settingsPatch.onboarding_completed_at).toBe(iso);
    expect(m.studioBusinessProfile.photographer_id).toBe(photographerId);
    expect(m.studioBusinessProfile.core_services).toEqual([]);
    expect(m.playbookRules.length).toBeGreaterThan(0);
    expect(m.knowledgeBaseSeeds.length).toBe(1);
    const meta = m.knowledgeBaseSeeds[0].metadata as Record<string, unknown>;
    expect(meta[KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_KEY]).toBe(
      KNOWLEDGE_BASE_METADATA_ONBOARDING_SOURCE_VALUE,
    );
  });

  it("maps only onboarding-owned playbook source_types (replacement cohort safety)", () => {
    const payload: OnboardingPayloadV4 = {
      settings_identity: {},
      studio_scope: {},
      playbook_seeds: [
        {
          scope: "global",
          action_key: "custom",
          topic: "t",
          decision_mode: "auto",
          instruction: "x",
        },
      ],
    };
    const m = mapOnboardingPayloadToStorage(photographerId, payload);
    const types = new Set(m.playbookRules.map((r) => r.source_type));
    for (const st of types) {
      expect(FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES).toContain(st);
    }
    for (const st of ONBOARDING_OWNED_PLAYBOOK_RULE_SOURCE_TYPES) {
      expect(FINALIZE_ONBOARDING_PLAYBOOK_DELETE_SOURCE_TYPES).toContain(st);
    }
  });

  it("round-trips a fresh v2 selection through studio_business_profiles columns + extensions", () => {
    const payload: OnboardingPayloadV4 = {
      settings_identity: {},
      studio_scope: {},
      playbook_seeds: [],
      business_scope_deterministic: {
        schema_version: BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
        core_services: ["photo", "hybrid"],
        specializations: ["weddings", "portraiture"],
        offer_components: [
          "digital_online_gallery",
          "album_fine_art",
          "vspecialty_drone_aerial",
        ],
        geography: { mode: "regional" },
        travel_policy_mode: "selective_travel",
        lead_acceptance: {
          when_service_not_offered: "decline_politely",
          when_geography_not_in_scope: "route_to_operator",
        },
      },
      business_scope_extensions: {
        schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
        custom_specializations: [
          { label: "Pet weddings", behaves_like: "weddings" },
        ],
        custom_offer_components: [
          { label: "Custom frames", behaves_like: "print_fine_art" },
        ],
      },
    };

    const m = mapOnboardingPayloadToStorage(photographerId, payload);

    // Canonical v2 columns
    expect(m.studioBusinessProfile.core_services).toEqual(["photo", "hybrid"]);
    expect(m.studioBusinessProfile.service_types).toEqual([
      "weddings",
      "portraiture",
    ]);
    expect(m.studioBusinessProfile.deliverable_types).toEqual([
      "digital_online_gallery",
      "album_fine_art",
      "vspecialty_drone_aerial",
    ]);

    // Extensions JSON — custom labels land in v2 keys.
    const ext = m.studioBusinessProfile.extensions as {
      schema_version?: number;
      custom_specializations?: { label: string; behaves_like?: string | null }[];
      custom_offer_components?: { label: string; behaves_like?: string | null }[];
    };
    expect(ext.schema_version).toBe(BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION);
    expect(ext.custom_specializations).toEqual([
      { label: "Pet weddings", behaves_like: "weddings" },
    ]);
    expect(ext.custom_offer_components).toEqual([
      { label: "Custom frames", behaves_like: "print_fine_art" },
    ]);
  });

  it("does not emit manual / curated playbook source_types from mapping", () => {
    const payload: OnboardingPayloadV4 = {
      settings_identity: {},
      studio_scope: {},
      playbook_seeds: [],
    };
    const m = mapOnboardingPayloadToStorage(photographerId, payload);
    const forbidden = new Set(["manual", "operator", "escalation_resolution", "tenant_custom"]);
    for (const r of m.playbookRules) {
      expect(forbidden.has(r.source_type)).toBe(false);
    }
  });
});

describe("legacy v1 scope -> v2 migration", () => {
  it("maps old canonical enums onto v2 core_services + specializations + offer_components", () => {
    // family/maternity/newborn collapse to portraiture; brand/editorial/corporate to commercial.
    // `video` lifts out of specializations into core_services.
    const migrated = migrateLegacyCanonicalsToV2({
      offered_services: [
        "weddings",
        "family",
        "maternity",
        "brand",
        "editorial",
        "video",
      ],
      allowed_deliverables: ["digital_gallery", "album", "video_deliverable"],
      selected_service_capabilities: [
        { id: "drone" },
        { id: "super_8" },
        { id: "highlight_film" },
        { id: "teaser_clips" },
        { id: "short_form_social_clips" },
        { id: "unknown_cap" },
      ],
    });

    // `video` landed first from the canonical list; `photo` is lifted in front
    // because non-video canonicals were present → studio is photo-primary.
    expect(migrated.core_services).toEqual(["photo", "video"]);
    // Old `family`/`maternity` collapse to `family_maternity`;
    // `brand`/`editorial` collapse to `commercial`.
    expect(migrated.specializations).toEqual([
      "weddings",
      "family_maternity",
      "commercial",
    ]);
    // Walks v1 deliverables, then v1 capabilities. `highlight_film` collapses
    // into `vfilm_cinematic_highlight` (already added via `video_deliverable`),
    // so it is deduped. `teaser_clips` → `vfilm_teaser`,
    // `short_form_social_clips` → `vsocial_reels`.
    expect(migrated.offer_components).toEqual([
      "digital_online_gallery",
      "album_fine_art",
      "vfilm_cinematic_highlight",
      "vspecialty_drone_aerial",
      "analog_35mm",
      "vfilm_teaser",
      "vsocial_reels",
    ]);
  });

  it("lifts photo into core_services when media selection includes photo", () => {
    const migrated = migrateLegacyCanonicalsToV2({
      selected_media_groups: [{ id: "photo" }, { id: "video" }],
    });
    expect(migrated.core_services).toEqual(["photo", "video"]);
  });

  it("empty legacy input yields empty v2 selections", () => {
    const migrated = migrateLegacyCanonicalsToV2({});
    expect(migrated.core_services).toEqual([]);
    expect(migrated.specializations).toEqual([]);
    expect(migrated.offer_components).toEqual([]);
  });

  it("resolveBusinessScopeDeterministic migrates a v1 blob into a v2 scope", () => {
    const v1Blob = {
      schema_version: 1,
      offered_services: ["weddings", "brand", "video"],
      geography: { mode: "regional" },
      travel_policy_mode: "travels_freely",
      lead_acceptance: {
        when_service_not_offered: "decline_politely",
        when_geography_not_in_scope: "decline_politely",
      },
      allowed_deliverables: ["album", "digital_gallery"],
    };
    const v2 = resolveBusinessScopeDeterministic(v1Blob as unknown);
    expect(v2.schema_version).toBe(BUSINESS_SCOPE_JSON_SCHEMA_VERSION);
    expect(v2.core_services).toEqual(["photo", "video"]);
    expect(v2.specializations).toEqual(["weddings", "commercial"]);
    expect(v2.offer_components).toEqual([
      "album_fine_art",
      "digital_online_gallery",
    ]);
  });

  it("unknown schema version falls back to empty v2 selections", () => {
    const v2 = resolveBusinessScopeDeterministic({ schema_version: 99 } as unknown);
    expect(v2.core_services).toEqual([]);
    expect(v2.specializations).toEqual([]);
    expect(v2.offer_components).toEqual([]);
  });

  it("resolveBusinessScopeExtensions migrates v1 custom_services + custom_deliverables into v2 keys", () => {
    const v1Ext = {
      schema_version: 1,
      custom_services: [
        { label: "Pet weddings", behaves_like_service_type: "weddings" },
        { label: "Mystery gigs" },
      ],
      custom_deliverables: [
        { label: "Antique prints", behaves_like_deliverable: "prints" },
        { label: "Custom flipbook" },
      ],
    };
    const ext = resolveBusinessScopeExtensions(v1Ext);
    expect(ext.schema_version).toBe(BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION);
    expect(ext.custom_specializations).toEqual([
      { label: "Pet weddings", behaves_like: "weddings" },
      { label: "Mystery gigs" },
    ]);
    expect(ext.custom_offer_components).toEqual([
      { label: "Antique prints", behaves_like: "print_fine_art" },
      { label: "Custom flipbook" },
    ]);
  });

  it("resolveBusinessScopeExtensions returns empty v2 for unknown schema versions", () => {
    const ext = resolveBusinessScopeExtensions({ schema_version: 99 });
    expect(ext.schema_version).toBe(BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION);
    expect(ext.custom_specializations).toBeUndefined();
    expect(ext.custom_offer_components).toBeUndefined();
  });
});

describe("finalizeOnboardingBriefingRuntime — RPC payload (mocked client)", () => {
  const photographerId = "22222222-2222-2222-2222-222222222222";

  // Geography must satisfy the finalize guard introduced in
  // `onboardingFinalizeGeographyContract.ts` / migration 20260506.
  const validBase = {
    schema_version: 1 as const,
    provider_id: "ne:city:Sombor",
    label: "Sombor",
    kind: "city" as const,
    provider: "bundled" as const,
    centroid: [19.11, 45.77] as [number, number],
    bbox: [18.9, 45.6, 19.3, 45.9] as [number, number, number, number],
    country_code: "RS",
    selected_at: "2026-04-17T00:00:00.000Z",
  };
  const validServiceAreas = [
    {
      provider_id: "ne:country:RS",
      label: "Serbia",
      kind: "country" as const,
      provider: "bundled" as const,
      centroid: [20, 44] as [number, number],
      bbox: [18, 42, 23, 46] as [number, number, number, number],
      country_code: "RS",
      selected_at: "2026-04-17T00:00:00.000Z",
    },
  ];

  function draftSnapshot() {
    const payload: OnboardingPayloadV4 = {
      settings_identity: { studio_name: "S", base_location: validBase },
      studio_scope: {},
      business_scope_extensions: {
        schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
        service_areas: validServiceAreas,
      },
      playbook_seeds: [],
    };
    return {
      schema_version: 1 as const,
      status: "draft" as const,
      completed_steps: ["identity"],
      last_saved_at: "2026-01-01T00:00:00.000Z",
      current_step: "identity" as const,
      payload,
    };
  }

  function buildClient(settings: Record<string, unknown>, rpc: ReturnType<typeof vi.fn>) {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { settings }, error: null })),
          })),
        })),
      })),
      rpc,
    } as unknown as SupabaseClient<Database>;
  }

  it("calls finalize_onboarding_briefing_v1 with completed snapshot in settings and mapped rows", async () => {
    const snap = draftSnapshot();
    const raw = { [ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY]: snap, other_key: "keep" };
    const rpc = vi.fn(async () => ({ error: null }));
    const client = buildClient(raw, rpc);

    const now = "2026-04-16T15:00:00.000Z";
    const completedPayload: OnboardingPayloadV4 = {
      ...snap.payload,
      settings_meta: { onboarding_completed_at: now },
    };

    await finalizeOnboardingBriefingRuntime({
      supabase: client,
      photographerId,
      completedPayload,
      completedSteps: ["identity"],
      nowIso: now,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("finalize_onboarding_briefing_v1");
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_photographer_id).toBe(photographerId);
    expect(args.p_playbook_rules).toBeDefined();
    expect(args.p_knowledge_base_rows).toBeDefined();
    expect(args.p_studio_business_profile).toBeDefined();

    const settings = args.p_settings as Record<string, unknown>;
    expect(settings.other_key).toBe("keep");
    const blob = settings[ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY] as Record<string, unknown>;
    expect(blob.status).toBe("completed");
    expect(blob.payload).toMatchObject({ settings_identity: { studio_name: "S" } });
  });

  it("rejects finalize when base_location is missing (client-side mirror of SQL guard)", async () => {
    const snap = draftSnapshot();
    const raw = { [ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY]: snap };
    const rpc = vi.fn(async () => ({ error: null }));
    const client = buildClient(raw, rpc);
    const now = "2026-04-16T16:00:00.000Z";
    const badPayload: OnboardingPayloadV4 = {
      ...snap.payload,
      settings_identity: { studio_name: "S" }, // no base_location
      settings_meta: { onboarding_completed_at: now },
    };
    await expect(
      finalizeOnboardingBriefingRuntime({
        supabase: client,
        photographerId,
        completedPayload: badPayload,
        completedSteps: ["identity"],
        nowIso: now,
      }),
    ).rejects.toThrowError(/base_location is required/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects finalize when service_areas is empty", async () => {
    const snap = draftSnapshot();
    const raw = { [ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY]: snap };
    const rpc = vi.fn(async () => ({ error: null }));
    const client = buildClient(raw, rpc);
    const now = "2026-04-16T16:00:00.000Z";
    const badPayload: OnboardingPayloadV4 = {
      ...snap.payload,
      business_scope_extensions: {
        schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
        service_areas: [],
      },
      settings_meta: { onboarding_completed_at: now },
    };
    await expect(
      finalizeOnboardingBriefingRuntime({
        supabase: client,
        photographerId,
        completedPayload: badPayload,
        completedSteps: ["identity"],
        nowIso: now,
      }),
    ).rejects.toThrowError(/at least one valid entry/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("can be invoked twice (re-finalization) with the same mock client", async () => {
    const snap = draftSnapshot();
    const raw = { [ONBOARDING_BRIEFING_SNAPSHOT_SETTINGS_KEY]: snap };
    const rpc = vi.fn(async () => ({ error: null }));
    const client = buildClient(raw, rpc);
    const now = "2026-04-16T16:00:00.000Z";
    const p1: OnboardingPayloadV4 = {
      ...snap.payload,
      settings_meta: { onboarding_completed_at: now },
    };
    await finalizeOnboardingBriefingRuntime({
      supabase: client,
      photographerId,
      completedPayload: p1,
      completedSteps: ["identity"],
      nowIso: now,
    });
    const p2: OnboardingPayloadV4 = {
      ...snap.payload,
      settings_identity: { studio_name: "S2", base_location: validBase },
      settings_meta: { onboarding_completed_at: now },
    };
    await finalizeOnboardingBriefingRuntime({
      supabase: client,
      photographerId,
      completedPayload: p2,
      completedSteps: ["identity"],
      nowIso: now,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
