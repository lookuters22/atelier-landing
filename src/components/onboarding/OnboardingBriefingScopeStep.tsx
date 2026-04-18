import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { OnboardingPayloadV4 } from "@/lib/onboardingV4Payload.ts";
import {
  BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
  CORE_SERVICE_TYPES,
  OFFER_COMPONENT_TYPES,
  SPECIALIZATION_TYPES,
  type CoreServiceType,
  type OfferComponentType,
  type OutOfScopeLeadAction,
  type SpecializationType,
  type TravelPolicyMode,
} from "@/lib/onboardingBusinessScopeDeterministic.ts";
import {
  getOfferComponentsAllowedForCoreServices,
  getVisibleOfferGroups,
} from "@/lib/onboardingOfferComponentGroups.ts";
import {
  BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
  type BusinessScopeCustomOfferComponent,
  type BusinessScopeCustomSpecialization,
  type BusinessScopeExtensionsV2,
  resolveBusinessScopeExtensions,
} from "@/lib/onboardingBusinessScopeExtensions.ts";
import {
  BRIEFING_LANGUAGE_CODES,
  CORE_SERVICE_LABELS,
  CORE_SERVICE_TAGLINES,
  OFFER_COMPONENT_LABELS,
  OUT_OF_SCOPE_ACTION_LABELS,
  SPECIALIZATION_LABELS,
  TRAVEL_LABELS,
  languageCodesToJson,
  parseLanguageSupportCodes,
  resolveBusinessScopeDeterministic,
} from "@/lib/onboardingBriefingScopeDefaults.ts";
import { useRegisterOnboardingBriefingHeader } from "@/components/onboarding/OnboardingBriefingHeaderContext.tsx";
import { ScopeSectorCluster } from "@/components/onboarding/ScopeSectorCluster.tsx";
import { scopeSectorGlassPillBase } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import { ServiceAreaPicker } from "@/components/onboarding/serviceAreaPicker/ServiceAreaPicker.tsx";
import type { BusinessScopeServiceArea } from "@/lib/serviceAreaPicker/serviceAreaPickerTypes.ts";
import type { StudioBaseLocation } from "@/lib/studioBaseLocation.ts";
import { canAdvanceGeographyStage } from "@/lib/onboardingGeographyStageGate.ts";
import { obMotionShell } from "@/components/onboarding/onboardingVisuals.ts";
import {
  SelectorFocusList,
  type SelectorFocusListItem,
  SelectorInlineAddOwn,
} from "@/components/onboarding/selectors";
import { OfferingsBento } from "@/components/onboarding/offerings/OfferingsBento";
import { cn } from "@/lib/utils";

type ScopeStageId =
  | "core_services"
  | "specializations"
  | "offer_components"
  | "service_areas"
  | "travel"
  | "rules_languages"
  | "rules_lead_service"
  | "rules_lead_geo";

const STAGES: ScopeStageId[] = [
  "core_services",
  "specializations",
  "offer_components",
  "service_areas",
  "travel",
  "rules_languages",
  "rules_lead_service",
  "rules_lead_geo",
];

const STAGE_COPY: Record<
  ScopeStageId,
  { kicker: string; title: string; hint: string; nextLabel: string }
> = {
  core_services: {
    kicker: "Business scope",
    title: "What is your studio built around?",
    hint: "Tell us what you actually shoot for clients. Pick more than one if your studio offers different kinds of coverage.",
    nextLabel: "Next",
  },
  specializations: {
    kicker: "Specializing in",
    title: "What do you specialize in?",
    hint: "The kinds of moments and clients you focus on. Pick everything you regularly take on — add your own if something is missing.",
    nextLabel: "Next",
  },
  offer_components: {
    kicker: "What’s on your offer",
    title: "What can clients actually get?",
    hint: "Everything that can end up in a package — grouped by what clients receive, the extras you offer, and the way you deliver it. Pick whatever genuinely shows up in your work.",
    nextLabel: "Next",
  },
  // `service_areas` is now a two-phase stage: the H1 + next-button copy
  // below is the *coverage* phase (after a base location is set). The
  // *base* phase copy is resolved at render time from
  // `SERVICE_AREAS_BASE_COPY` because `STAGE_COPY` is a flat lookup
  // keyed by stage id and we don't want to fork the stage id itself.
  // Both halves are required to advance — see `canAdvanceGeographyStage`.
  service_areas: {
    kicker: "Service areas",
    title: "Where do you want to show up?",
    hint: "Pick the cities, regions, and countries you actively want to book in. At least one — we'll use these whenever someone asks where you work.",
    nextLabel: "Next",
  },
  travel: {
    kicker: "Travel",
    title: "How should Ana understand your travel posture?",
    hint: "How open are you to traveling for work? This sets expectations when a lead reaches out from far away.",
    nextLabel: "Next",
  },
  rules_languages: {
    kicker: "Lead rules",
    title: "Which languages do you work in?",
    hint: "Pick every language you’re comfortable working with clients in. You can adjust this any time.",
    nextLabel: "Next",
  },
  rules_lead_service: {
    kicker: "Lead rules",
    title: "When a lead asks for a service you do not offer",
    hint: "What’s your default move when someone asks for something you don’t normally offer? You can still make exceptions case by case.",
    nextLabel: "Next",
  },
  rules_lead_geo: {
    kicker: "Lead rules",
    title: "When a lead is outside your service areas",
    hint: "What’s your default move when an inquiry is outside the places you picked on the map? You can still make exceptions case by case.",
    nextLabel: "Continue",
  },
};

/**
 * Copy overlay applied when the `service_areas` stage is in *base* phase
 * (no home location picked yet). Same stage id, same body component —
 * just a different H1 / kicker / hint so the stage reads as two
 * distinct questions on the same screen.
 */
const SERVICE_AREAS_BASE_COPY = {
  kicker: "Where you're based",
  title: "Where are you based?",
  hint: "Pick your home city, region, or country. We’ll anchor the map here and use this to bias travel messaging once Ana takes over.",
  nextLabel: "Next",
} as const;

const SCOPE_CINEMATIC_TEXT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const scopeSceneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.32, ease: obMotionShell.ease } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: obMotionShell.ease } },
} as const;

const TRAVEL_POLICY_MODES = Object.keys(TRAVEL_LABELS) as TravelPolicyMode[];
const LEAD_ACTION_ORDER: OutOfScopeLeadAction[] = [
  "decline_politely",
  "route_to_operator",
  "escalate",
];

function navRevealDelayForStage(stage: ScopeStageId): number {
  switch (stage) {
    case "core_services":
      return 1.08;
    case "specializations":
      return 1.0;
    case "offer_components":
      return 0.95;
    case "service_areas":
      return 0.95;
    case "travel":
      return 0.95;
    case "rules_languages":
      return 0.9;
    case "rules_lead_service":
      return 0.88;
    case "rules_lead_geo":
      return 0.86;
    default:
      return 0.9;
  }
}

export type OnboardingBriefingScopeStepProps = {
  payload: OnboardingPayloadV4;
  updatePayload: (fn: (prev: OnboardingPayloadV4) => OnboardingPayloadV4) => void;
  onAdvanceStep: () => void;
  onBackStep: () => void;
};

export function OnboardingBriefingScopeStep({
  payload,
  updatePayload,
  onAdvanceStep,
  onBackStep,
}: OnboardingBriefingScopeStepProps) {
  const scopeResolved = useMemo(
    () => resolveBusinessScopeDeterministic(payload.business_scope_deterministic),
    [payload.business_scope_deterministic],
  );
  const extResolved = useMemo(
    () => resolveBusinessScopeExtensions(payload.business_scope_extensions),
    [payload.business_scope_extensions],
  );
  const langCodes = useMemo(
    () => parseLanguageSupportCodes(payload.studio_scope.language_support),
    [payload.studio_scope.language_support],
  );

  const [stageIndex, setStageIndex] = useState(0);
  const stage = STAGES[stageIndex]!;
  const activeCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = activeCardRef.current?.querySelector<HTMLElement>(
      "input, button, select, [role='checkbox'], [role='radio']",
    );
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, [stageIndex]);

  function setScope(next: ReturnType<typeof resolveBusinessScopeDeterministic>) {
    updatePayload((p) => ({
      ...p,
      business_scope_deterministic: next,
    }));
  }

  function commitExtensions(next: BusinessScopeExtensionsV2) {
    updatePayload((p) => ({
      ...p,
      business_scope_extensions: resolveBusinessScopeExtensions(next),
    }));
  }

  function setCoreServices(nextIds: string[]) {
    const filtered = nextIds.filter((x): x is CoreServiceType =>
      (CORE_SERVICE_TYPES as readonly string[]).includes(x),
    );
    setScope({ ...scopeResolved, core_services: filtered });
  }

  function setSpecializations(nextIds: string[]) {
    const filtered = nextIds.filter((x): x is SpecializationType =>
      (SPECIALIZATION_TYPES as readonly string[]).includes(x),
    );
    setScope({ ...scopeResolved, specializations: filtered });
  }

  function setOfferComponents(nextIds: string[]) {
    const filtered = nextIds.filter((x): x is OfferComponentType =>
      (OFFER_COMPONENT_TYPES as readonly string[]).includes(x),
    );
    setScope({ ...scopeResolved, offer_components: filtered });
  }

  function addCustomSpecialization(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const existing = extResolved.custom_specializations ?? [];
    if (existing.some((r) => r.label.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    const next: BusinessScopeCustomSpecialization[] = [...existing, { label: trimmed }];
    commitExtensions({
      schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
      ...extResolved,
      custom_specializations: next,
    });
  }

  function removeCustomSpecialization(label: string) {
    const existing = extResolved.custom_specializations ?? [];
    const next = existing.filter((r) => r.label !== label);
    commitExtensions({
      schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
      ...extResolved,
      custom_specializations: next,
    });
  }

  function addCustomOfferComponent(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    const existing = extResolved.custom_offer_components ?? [];
    if (existing.some((r) => r.label.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
    const next: BusinessScopeCustomOfferComponent[] = [
      ...existing,
      { label: trimmed },
    ];
    commitExtensions({
      schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
      ...extResolved,
      custom_offer_components: next,
    });
  }

  function removeCustomOfferComponent(label: string) {
    const existing = extResolved.custom_offer_components ?? [];
    const next = existing.filter((r) => r.label !== label);
    commitExtensions({
      schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
      ...extResolved,
      custom_offer_components: next,
    });
  }

  function setServiceAreas(next: BusinessScopeServiceArea[]) {
    commitExtensions({
      schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
      ...extResolved,
      service_areas: next,
    });
  }

  const baseLocation = payload.settings_identity.base_location ?? null;

  function setBaseLocation(next: StudioBaseLocation) {
    updatePayload((p) => ({
      ...p,
      settings_identity: { ...p.settings_identity, base_location: next },
    }));
  }

  function clearBaseLocation() {
    updatePayload((p) => ({
      ...p,
      // Explicit `null` (not `undefined`) so the settings patch writes
      // `base_location: null` into `photographers.settings`, which
      // `parsePhotographerSettings` treats as "explicit absence".
      settings_identity: { ...p.settings_identity, base_location: null },
    }));
  }

  function setTravel(m: TravelPolicyMode) {
    setScope({ ...scopeResolved, travel_policy_mode: m });
  }

  function setLead(
    which: "when_service_not_offered" | "when_geography_not_in_scope",
    v: OutOfScopeLeadAction,
  ) {
    setScope({
      ...scopeResolved,
      lead_acceptance: { ...scopeResolved.lead_acceptance, [which]: v },
    });
  }

  function toggleLang(code: string) {
    const set = new Set(langCodes);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    updatePayload((p) => ({
      ...p,
      business_scope_deterministic:
        p.business_scope_deterministic ?? {
          schema_version: BUSINESS_SCOPE_JSON_SCHEMA_VERSION,
          core_services: [],
          specializations: [],
          offer_components: [],
          geography: { mode: "local_only" },
          travel_policy_mode: "selective_travel",
          lead_acceptance: {
            when_service_not_offered: "decline_politely",
            when_geography_not_in_scope: "decline_politely",
          },
        },
      studio_scope: {
        ...p.studio_scope,
        language_support: languageCodesToJson([...set]),
      },
    }));
  }

  function handleBack() {
    if (stageIndex === 0) {
      onBackStep();
      return;
    }
    setStageIndex((current) => Math.max(0, current - 1));
  }

  function handleNext() {
    if (!canAdvance(stage)) return;
    if (stageIndex >= STAGES.length - 1) {
      onAdvanceStep();
      return;
    }
    setStageIndex((current) => Math.min(STAGES.length - 1, current + 1));
  }

  function canAdvance(current: ScopeStageId): boolean {
    if (current === "core_services") {
      return scopeResolved.core_services.length > 0;
    }
    if (current === "service_areas") {
      // Two-phase stage — both halves required. See
      // `canAdvanceGeographyStage` for the canonical rule and rationale.
      return canAdvanceGeographyStage({
        baseLocation,
        serviceAreas: extResolved.service_areas,
      });
    }
    return true;
  }

  // When `service_areas` is in base phase, overlay the alternate copy
  // over the stage's default so both the H1/hint and the briefing
  // header (kicker) swap in lockstep. Coverage phase keeps the
  // existing "Where do you want to show up?" copy.
  const serviceAreasBasePhase = stage === "service_areas" && !baseLocation;
  const copy =
    serviceAreasBasePhase ? SERVICE_AREAS_BASE_COPY : STAGE_COPY[stage];
  const navDelay = navRevealDelayForStage(stage);
  const advanceEnabled = canAdvance(stage);

  useRegisterOnboardingBriefingHeader(
    copy.kicker,
    `${stageIndex + 1} of ${STAGES.length}`,
  );

  const coreItems: SelectorFocusListItem[] = useMemo(
    () =>
      CORE_SERVICE_TYPES.map((id) => ({
        id,
        label: CORE_SERVICE_LABELS[id],
        description: CORE_SERVICE_TAGLINES[id],
      })),
    [],
  );
  const specItems: SelectorFocusListItem[] = useMemo(
    () =>
      SPECIALIZATION_TYPES.map((id) => ({
        id,
        label: SPECIALIZATION_LABELS[id],
      })),
    [],
  );
  // Step 3 (Offerings & Deliverables) is grouped, and which groups are visible
  // depends on Step 1 (core_services). When the operator changes core_services
  // in a previous stage, any previously selected offer_components that belong
  // to a now-invisible group must be auto-purged so they don't survive into
  // the final payload.
  const visibleOfferGroups = useMemo(
    () => getVisibleOfferGroups(scopeResolved.core_services),
    [scopeResolved.core_services],
  );
  useEffect(() => {
    const allowed = getOfferComponentsAllowedForCoreServices(
      scopeResolved.core_services,
    );
    const current = scopeResolved.offer_components;
    const filtered = current.filter((id) => allowed.has(id));
    if (filtered.length !== current.length) {
      setScope({ ...scopeResolved, offer_components: filtered });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeResolved.core_services]);
  // Step 3 renders via `OfferingsBento` which consumes the visible groups
  // directly — it owns its own cluster / subsection / row rendering and
  // needs nothing else precomputed here.
  const offerLabelFor = useCallback(
    (id: OfferComponentType) => OFFER_COMPONENT_LABELS[id],
    [],
  );

  // All three stages share the same outer/inner max-widths and vertical
  // alignment so the H1 + hint + nav never "jump" when the operator moves
  // between stages. The only per-stage size difference lives in the body
  // wrapper below (reading column for Steps 1 & 2, slightly wider column
  // for the Step 3 accordion to give the expanded chip grid room).
  const outerMaxW = "max-w-4xl";
  const innerMaxW = "max-w-3xl";

  return (
    <div className={cn("mx-auto flex h-full min-h-0 w-full flex-col", outerMaxW)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          ref={activeCardRef}
          className={cn(
            "cinematic-scope relative flex h-full min-h-0 w-full flex-1 flex-col items-stretch overflow-visible px-4 pb-3 pt-1 text-center sm:px-8 sm:pb-4 sm:pt-2",
            outerMaxW,
          )}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={scopeSceneMotion}
        >
          <div className={cn(
            "relative z-10 mx-auto flex w-full min-h-0 flex-1 flex-col items-center overflow-visible",
            innerMaxW,
          )}>
            {/*
              Fixed-offset header block. By anchoring the H1 + hint at a
              consistent top offset (instead of vertically centering the
              whole stack), the headline never jumps between stages even
              when the body below differs in height. The body wrapper below
              is `flex-1` and vertically centers itself in the remaining
              space so shorter bodies (e.g. Step 3 collapsed accordion)
              still look balanced rather than top-heavy.
            */}
            <div className="flex w-full shrink-0 flex-col items-center pt-[6vh] sm:pt-[8vh]">
              <motion.h1
                className="mx-auto max-w-[38rem] text-balance font-serif text-[clamp(1.65rem,4.2vw,2.55rem)] font-normal leading-[1.08] tracking-tight text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.55)]"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: SCOPE_CINEMATIC_TEXT_EASE }}
              >
                {copy.title}
              </motion.h1>

              {stage === "service_areas" ? null : (
                // `service_areas` replaces the prose hint with a ghost
                // "Search for a city…" trigger rendered by the picker
                // itself, so the stage's H1 → body rhythm stays intact
                // while still leaving the search affordance where the
                // hint used to sit.
                <motion.p
                  className="mx-auto mt-3 max-w-xl text-pretty text-[13px] leading-relaxed text-white/75 sm:mt-4 sm:text-[14px]"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.28, ease: SCOPE_CINEMATIC_TEXT_EASE }}
                >
                  {copy.hint}
                </motion.p>
              )}
            </div>

            <div
              className={cn(
                "mt-6 flex w-full min-h-0 flex-1 flex-col items-center overflow-visible sm:mt-8",
                // `service_areas` anchors the body to the top (right
                // under the H1) because its map is taller and the
                // ghost-search trigger should sit visually close to
                // the title, not float in the middle of the page.
                stage === "service_areas"
                  ? "justify-start pt-2 sm:pt-3"
                  : "justify-center",
              )}
            >
            {stage === "core_services" ? (
              // Step 1 — editorial serif list, visually centered on the stage.
              // `align="center"` pulls each row's dot indicator inline with
              // its label and centers the whole [dot + label] cluster, so
              // every option sits on the same vertical axis as the title.
              <div className="mx-auto flex w-full max-w-[600px] justify-center">
                <SelectorFocusList
                  items={coreItems}
                  value={[...scopeResolved.core_services]}
                  onChange={setCoreServices}
                  mode="multi"
                  size="lg"
                  rowGap="lg"
                  align="center"
                  ariaLabel="Core services"
                  className="w-max max-w-full"
                />
              </div>
            ) : null}

            {stage === "specializations" ? (
              // Step 2 — centered vertical list, sans, 32px vertical rhythm.
              // Same centered alignment as Step 1 so the page rhythm stays
              // consistent between the two scope stages.
              <div className="mx-auto flex w-full max-w-[600px] justify-center">
                <SelectorFocusList
                  items={specItems}
                  value={[...scopeResolved.specializations]}
                  onChange={setSpecializations}
                  mode="multi"
                  size="md"
                  rowGap="lg"
                  align="center"
                  ariaLabel="Specializations"
                  className="w-max max-w-full"
                  trailingSlot={
                    <div className="flex flex-col gap-4 pt-2">
                      {extResolved.custom_specializations &&
                      extResolved.custom_specializations.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {extResolved.custom_specializations.map((row) => (
                            <button
                              key={row.label}
                              type="button"
                              onClick={() => removeCustomSpecialization(row.label)}
                              className="rounded-full border border-white/15 bg-transparent px-3 py-1 text-[12px] text-white/70 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white"
                              aria-label={`Remove custom specialization ${row.label}`}
                            >
                              {row.label}
                              <span className="ml-2 text-white/40">×</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <SelectorInlineAddOwn
                        variant="inline"
                        onAdd={addCustomSpecialization}
                        addLabel="+ Add your own specialization"
                        placeholder="e.g. Destination weddings"
                      />
                    </div>
                  }
                />
              </div>
            ) : null}

            {stage === "offer_components" ? (
              // Step 3 — vertical accordion menu of offer categories. Sits
              // in the same ~720px reading column used by Steps 1 & 2 so
              // the H1 / hint / nav never reflow between stages.
              //
              // When one or more categories are expanded the chip grid can
              // exceed viewport height, so we clip it to its own scrollable
              // region with soft top/bottom mask fades (see
              // `.scope-offer-scroll` in index.css).
              <div className="mx-auto w-full max-w-[720px] text-left">
                <div className="scope-offer-scroll max-h-[min(56vh,560px)] overflow-y-auto pr-2 pt-1 sm:max-h-[min(58vh,600px)]">
                  <OfferingsBento
                    groups={visibleOfferGroups}
                    value={[...scopeResolved.offer_components]}
                    onChange={setOfferComponents}
                    labelFor={offerLabelFor}
                    ariaLabel="Offerings and deliverables"
                    trailingSlot={
                      <div className="mt-2 flex flex-col gap-3">
                        {extResolved.custom_offer_components &&
                        extResolved.custom_offer_components.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-2">
                            {extResolved.custom_offer_components.map((row) => (
                              <button
                                key={row.label}
                                type="button"
                                onClick={() => removeCustomOfferComponent(row.label)}
                                className="rounded-full border border-white/15 bg-transparent px-3 py-1 text-[12px] text-white/70 transition-colors hover:border-white/35 hover:bg-white/[0.04] hover:text-white"
                                aria-label={`Remove custom offer ${row.label}`}
                              >
                                {row.label}
                                <span className="ml-2 text-white/40">×</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <SelectorInlineAddOwn
                          variant="inline"
                          onAdd={addCustomOfferComponent}
                          addLabel="+ Add your own"
                          placeholder="e.g. Wedding website"
                          className="justify-center"
                        />
                      </div>
                    }
                  />
                </div>
              </div>
            ) : null}

            {stage === "service_areas" ? (
              <div className="w-full">
                <ServiceAreaPicker
                  value={[...(extResolved.service_areas ?? [])]}
                  onChange={setServiceAreas}
                  baseLocation={baseLocation}
                  onChangeBaseLocation={setBaseLocation}
                  onClearBaseLocation={clearBaseLocation}
                />
              </div>
            ) : null}

            {stage === "travel" ? (
              <ScopeSectorCluster<TravelPolicyMode>
                itemIds={TRAVEL_POLICY_MODES}
                getLabel={(m) => TRAVEL_LABELS[m]}
                isSelected={(m) => scopeResolved.travel_policy_mode === m}
                onActivate={setTravel}
                phaseShift={0.08}
                layoutGroupId="scope-travel-donut"
                roleRadio
              />
            ) : null}

            {stage === "rules_languages" ? (
              <ScopeSectorCluster
                itemIds={BRIEFING_LANGUAGE_CODES}
                getLabel={(code) => code.toUpperCase()}
                isSelected={(code) => langCodes.includes(code)}
                onActivate={(code) => toggleLang(code)}
                phaseShift={langCodes.length * 0.05}
                layoutGroupId="scope-languages-donut"
                pillClassName={cn(
                  scopeSectorGlassPillBase,
                  "font-mono text-[12px] uppercase tracking-wide sm:text-[13px]",
                )}
                role="group"
                aria-label="Languages you work in"
              />
            ) : null}

            {stage === "rules_lead_service" ? (
              <ScopeSectorCluster<OutOfScopeLeadAction>
                itemIds={LEAD_ACTION_ORDER}
                getLabel={(opt) => OUT_OF_SCOPE_ACTION_LABELS[opt]}
                isSelected={(opt) =>
                  scopeResolved.lead_acceptance.when_service_not_offered === opt
                }
                onActivate={(opt) => setLead("when_service_not_offered", opt)}
                phaseShift={0}
                layoutGroupId="scope-lead-service-donut"
                roleRadio
                role="radiogroup"
                aria-label="When a lead asks for a service you do not offer"
              />
            ) : null}

            {stage === "rules_lead_geo" ? (
              <ScopeSectorCluster<OutOfScopeLeadAction>
                itemIds={LEAD_ACTION_ORDER}
                getLabel={(opt) => OUT_OF_SCOPE_ACTION_LABELS[opt]}
                isSelected={(opt) =>
                  scopeResolved.lead_acceptance.when_geography_not_in_scope === opt
                }
                onActivate={(opt) => setLead("when_geography_not_in_scope", opt)}
                phaseShift={0}
                layoutGroupId="scope-lead-geo-donut"
                roleRadio
                role="radiogroup"
                aria-label="When a lead is outside your geography"
              />
            ) : null}
            </div>
          </div>

          <motion.div
            className="navigation-reveal relative z-50 mx-auto mt-auto flex w-full max-w-lg shrink-0 flex-wrap items-center justify-between gap-3 pt-4 sm:pt-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: navDelay, ease: obMotionShell.ease }}
          >
            <button
              type="button"
              className="text-[13px] font-medium text-white/50 transition-colors hover:text-white/85"
              onClick={handleBack}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!advanceEnabled}
              className={cn(
                "rounded-full border border-white/35 bg-white/10 px-6 py-2.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm transition-[background,border-color] hover:border-white/50 hover:bg-white/16",
                !advanceEnabled && "cursor-not-allowed opacity-45 hover:bg-white/10",
              )}
              onClick={handleNext}
            >
              {copy.nextLabel}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
