import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { OnboardingPayloadV4 } from "@/lib/onboardingV4Payload.ts";
import {
  type DeliverableKind,
  type GeographyScopeMode,
  type OfferedServiceType,
  type OutOfScopeLeadAction,
  type TravelPolicyMode,
} from "@/lib/onboardingBusinessScopeDeterministic.ts";
import {
  BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
  type BusinessScopeCustomService,
  type BusinessScopeExtensionsV1,
  resolveBusinessScopeExtensions,
} from "@/lib/onboardingBusinessScopeExtensions.ts";
import {
  ALL_DELIVERABLE_KINDS,
  BRIEFING_LANGUAGE_CODES,
  DELIVERABLE_LABELS,
  GEOGRAPHY_LABELS,
  OUT_OF_SCOPE_ACTION_LABELS,
  TRAVEL_LABELS,
  languageCodesToJson,
  parseLanguageSupportCodes,
  resolveBusinessScopeDeterministic,
} from "@/lib/onboardingBriefingScopeDefaults.ts";
import { GeographySectorCluster } from "@/components/onboarding/GeographySectorCluster.tsx";
import { ScopeSectorCluster } from "@/components/onboarding/ScopeSectorCluster.tsx";
import { scopeSectorGlassPillBase } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import { ServicesRadialPebbleCluster } from "@/components/onboarding/ServicesRadialPebbleCluster.tsx";
import { obMotionShell } from "@/components/onboarding/onboardingVisuals.ts";
import { cn } from "@/lib/utils";

type ScopeStageId =
  | "services"
  | "geography"
  | "travel"
  | "deliverables"
  | "rules_languages"
  | "rules_lead_service"
  | "rules_lead_geo";

const STAGES: ScopeStageId[] = [
  "services",
  "geography",
  "travel",
  "deliverables",
  "rules_languages",
  "rules_lead_service",
  "rules_lead_geo",
];

const STAGE_COPY: Record<
  ScopeStageId,
  { kicker: string; title: string; hint: string; nextLabel: string }
> = {
  services: {
    kicker: "Business scope",
    title: "What should pop up first when someone thinks about your studio?",
    hint: "Start with the core services only. These bubbles should feel alive and easy to choose.",
    nextLabel: "Next",
  },
  geography: {
    kicker: "Geography",
    title: "Where does the studio actually want to be in play?",
    hint: "Choose one clean stance. We can keep the details secondary.",
    nextLabel: "Next",
  },
  travel: {
    kicker: "Travel",
    title: "How should Ana understand your travel posture?",
    hint: "Keep this sharp and legible, not buried in settings clutter.",
    nextLabel: "Next",
  },
  deliverables: {
    kicker: "Deliverables",
    title: "What do clients walk away with?",
    hint: "Pick the core outputs first. We can layer extras after.",
    nextLabel: "Next",
  },
  rules_languages: {
    kicker: "Lead rules",
    title: "Which languages do you work in?",
    hint: "Select every language Ana can use with clients. You can refine this later.",
    nextLabel: "Next",
  },
  rules_lead_service: {
    kicker: "Lead rules",
    title: "When a lead asks for a service you do not offer",
    hint: "Choose one default policy. You can still handle edge cases case by case.",
    nextLabel: "Next",
  },
  rules_lead_geo: {
    kicker: "Lead rules",
    title: "When a lead is outside your geography",
    hint: "Choose one default policy for out-of-area inquiries.",
    nextLabel: "Continue",
  },
};

/** Cinematic scope — matches Identity editorial pacing (fade & glide). */
const SCOPE_CINEMATIC_TEXT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Opacity-only exit — avoids double vertical motion with briefing page crossfade */
const scopeSceneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.32, ease: obMotionShell.ease } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: obMotionShell.ease } },
} as const;

const GEOGRAPHY_MODES = Object.keys(GEOGRAPHY_LABELS) as GeographyScopeMode[];

const TRAVEL_POLICY_MODES = Object.keys(TRAVEL_LABELS) as TravelPolicyMode[];

const LEAD_ACTION_ORDER: OutOfScopeLeadAction[] = ["decline_politely", "route_to_operator", "escalate"];

function navRevealDelayForStage(stage: ScopeStageId): number {
  switch (stage) {
    case "geography":
      return 1.12;
    case "services":
      return 1.05;
    case "travel":
      return 0.95;
    case "deliverables":
      return 0.92;
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
  const langCodes = useMemo(
    () => parseLanguageSupportCodes(payload.studio_scope.language_support),
    [payload.studio_scope.language_support],
  );

  const [stageIndex, setStageIndex] = useState(0);
  const stage = STAGES[stageIndex]!;
  const activeCardRef = useRef<HTMLDivElement>(null);

  const skipSyncExtRef = useRef(false);
  const [svcRows, setSvcRows] = useState<BusinessScopeCustomService[]>([]);
  const [customBubbleDraft, setCustomBubbleDraft] = useState("");
  const [customBubbleOpen, setCustomBubbleOpen] = useState(false);

  useEffect(() => {
    if (customBubbleOpen && stage === "services") return;
    const el = activeCardRef.current?.querySelector<HTMLElement>("input, button, select");
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, [stageIndex, customBubbleOpen, stage]);

  useEffect(() => {
    if (skipSyncExtRef.current) {
      skipSyncExtRef.current = false;
      return;
    }
    const ext = resolveBusinessScopeExtensions(payload.business_scope_extensions);
    setSvcRows(ext.custom_services ?? []);
  }, [payload.business_scope_extensions]);

  function commitExtensionsPatch(patch: Partial<BusinessScopeExtensionsV1>) {
    skipSyncExtRef.current = true;
    updatePayload((p) => {
      const cur = resolveBusinessScopeExtensions(p.business_scope_extensions);
      const merged: BusinessScopeExtensionsV1 = {
        schema_version: BUSINESS_SCOPE_EXTENSIONS_SCHEMA_VERSION,
        ...cur,
        ...patch,
      };
      return {
        ...p,
        business_scope_extensions: resolveBusinessScopeExtensions(merged),
      };
    });
  }

  function commitServices(next: BusinessScopeCustomService[]) {
    setSvcRows(next);
    commitExtensionsPatch({ custom_services: next.filter((r) => r.label.trim().length > 0) });
  }

  function setScope(next: ReturnType<typeof resolveBusinessScopeDeterministic>) {
    updatePayload((p) => ({
      ...p,
      business_scope_deterministic: next,
    }));
  }

  function toggleService(s: OfferedServiceType) {
    const set = new Set(scopeResolved.offered_services);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    setScope({ ...scopeResolved, offered_services: [...set] });
  }

  function addCustomService(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    commitServices([...svcRows, { label: trimmed, behaves_like_service_type: null }]);
    setCustomBubbleDraft("");
    setCustomBubbleOpen(false);
  }

  function toggleDeliverable(d: DeliverableKind) {
    const set = new Set(scopeResolved.allowed_deliverables);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    setScope({ ...scopeResolved, allowed_deliverables: [...set] });
  }

  function setGeographyMode(mode: GeographyScopeMode) {
    setScope({
      ...scopeResolved,
      geography: {
        ...scopeResolved.geography,
        mode,
        blocked_regions: scopeResolved.geography.blocked_regions,
      },
    });
  }

  function setTravel(m: TravelPolicyMode) {
    setScope({ ...scopeResolved, travel_policy_mode: m });
  }

  function setLead(which: "when_service_not_offered" | "when_geography_not_in_scope", v: OutOfScopeLeadAction) {
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
        p.business_scope_deterministic ?? resolveBusinessScopeDeterministic(undefined),
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
    if (stageIndex >= STAGES.length - 1) {
      onAdvanceStep();
      return;
    }
    setStageIndex((current) => Math.min(STAGES.length - 1, current + 1));
  }

  const copy = STAGE_COPY[stage];
  const navDelay = navRevealDelayForStage(stage);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          ref={activeCardRef}
          className="cinematic-scope relative flex min-h-0 w-full max-w-4xl flex-1 flex-col items-stretch overflow-visible px-4 pb-4 pt-2 text-center sm:px-8 sm:pb-5 sm:pt-3"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={scopeSceneMotion}
        >
          <div className="question-header mx-auto mb-4 flex w-full max-w-2xl shrink-0 flex-wrap items-center justify-between gap-3 text-left sm:mb-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">{copy.kicker}</p>
              <p className="mt-1 text-[12px] text-white/45">
                {stageIndex + 1} of {STAGES.length}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                {STAGES.map((step, i) => (
                  <span
                    key={step}
                    className={cn(
                      "h-2 w-2 rounded-full transition-colors",
                      i === stageIndex ? "bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.12)]" : "bg-white/25",
                    )}
                  />
                ))}
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/50">
                {stageIndex + 1} of {STAGES.length}
              </span>
            </div>
          </div>

          <motion.h1
            className="mx-auto max-w-[34rem] shrink-0 font-serif text-[clamp(1.65rem,4.2vw,2.55rem)] font-normal leading-[1.08] tracking-tight text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: SCOPE_CINEMATIC_TEXT_EASE }}
          >
            {copy.title}
          </motion.h1>

          <motion.p
            className="mx-auto mt-3 max-w-xl shrink-0 text-[13px] leading-snug text-white/72 sm:mt-4 sm:text-[14px]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.28, ease: SCOPE_CINEMATIC_TEXT_EASE }}
          >
            {copy.hint}
          </motion.p>

          <div className="relative z-10 mx-auto mt-4 flex w-full min-h-0 flex-1 flex-col items-center justify-center overflow-visible sm:mt-6 max-w-3xl">
            {stage === "services" ? (
              <div className="w-full space-y-3">
                <ServicesRadialPebbleCluster
                  offeredServices={scopeResolved.offered_services}
                  customServices={svcRows}
                  onRemoveCustom={(index) => commitServices(svcRows.filter((_, i) => i !== index))}
                  onToggleService={toggleService}
                  customBubbleDraft={customBubbleDraft}
                  onCustomBubbleDraftChange={setCustomBubbleDraft}
                  customBubbleOpen={customBubbleOpen}
                  onOpenCustom={() => setCustomBubbleOpen(true)}
                  onSubmitCustom={(value) => addCustomService(value)}
                  onCancelCustom={() => {
                    setCustomBubbleOpen(false);
                    setCustomBubbleDraft("");
                  }}
                />
              </div>
            ) : null}

            {stage === "geography" ? (
              <div className="w-full">
                <GeographySectorCluster
                  modes={GEOGRAPHY_MODES}
                  labels={GEOGRAPHY_LABELS}
                  selected={scopeResolved.geography.mode}
                  onSelect={setGeographyMode}
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

            {stage === "deliverables" ? (
              <ScopeSectorCluster<DeliverableKind>
                itemIds={ALL_DELIVERABLE_KINDS}
                getLabel={(d) => DELIVERABLE_LABELS[d]}
                isSelected={(d) => scopeResolved.allowed_deliverables.includes(d)}
                onActivate={(d) => toggleDeliverable(d)}
                phaseShift={scopeResolved.allowed_deliverables.length * 0.065}
                layoutGroupId="scope-deliverables-donut"
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
                isSelected={(opt) => scopeResolved.lead_acceptance.when_service_not_offered === opt}
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
                isSelected={(opt) => scopeResolved.lead_acceptance.when_geography_not_in_scope === opt}
                onActivate={(opt) => setLead("when_geography_not_in_scope", opt)}
                phaseShift={0}
                layoutGroupId="scope-lead-geo-donut"
                roleRadio
                role="radiogroup"
                aria-label="When a lead is outside your geography"
              />
            ) : null}
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
              className="rounded-full border border-white/35 bg-white/10 px-6 py-2.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm transition-[background,border-color] hover:border-white/50 hover:bg-white/16"
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
