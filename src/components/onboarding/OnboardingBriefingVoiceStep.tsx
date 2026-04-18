import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { OnboardingPayloadV4 } from "@/lib/onboardingV4Payload.ts";
import {
  type BriefingVoiceFacts,
  type ToneArchetypeId,
  TONE_ARCHETYPES,
  TONE_PREVIEW_BY_ARCHETYPE,
  parseBriefingVoiceFactsFromSeeds,
  upsertBriefingVoiceSeed,
} from "@/lib/onboardingBriefingVoiceUi.ts";
import { useRegisterOnboardingBriefingHeader } from "@/components/onboarding/OnboardingBriefingHeaderContext.tsx";
import { ScopeSectorCluster } from "@/components/onboarding/ScopeSectorCluster.tsx";
import { scopeSectorGlassPillBase } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import { obMotionShell } from "@/components/onboarding/onboardingVisuals.ts";
import type { SectorDonutLayoutOptions } from "@/lib/onboardingScopeRadialScatter.ts";
import { cn } from "@/lib/utils";

type VoiceStage = "tone" | "language";
const STAGES: VoiceStage[] = ["tone", "language"];

/** Same editorial easing as Identity + Business scope. */
const VOICE_CINEMATIC_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Opacity-only scene crossfade — matches `OnboardingBriefingScopeStep`. */
const voiceSceneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.32, ease: obMotionShell.ease } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: obMotionShell.ease } },
} as const;

const VOICE_STAGE_COPY: Record<VoiceStage, { kicker: string; title: string; hint: string; nextLabel: string }> = {
  tone: {
    kicker: "Voice",
    title: "Which emotional voice should Ana naturally fall into?",
    hint: "How should your studio sound when it speaks to clients? Pick the tone people should feel in every reply.",
    nextLabel: "Next",
  },
  language: {
    kicker: "Voice",
    title: "What phrases and standard lines should shape the final wording?",
    hint: "A few signature phrases you actually use in real replies. They’ll quietly shape how Ana writes — they don’t have to be long.",
    nextLabel: "Continue",
  },
};

/** Glass inputs on dark briefing shell — aligned with `OnboardingBriefingIdentityStep` cinematic fields. */
const voiceCinematicInput =
  "w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-[14px] leading-snug text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px] placeholder:text-white/45 focus:border-white/45 focus:bg-white/[0.14] focus:outline-none focus:ring-2 focus:ring-white/15 sm:px-5 sm:py-3 sm:text-[15px]";

/**
 * Compact read-only snippets — natural height to match copy (not full “pill” buttons).
 * Rounded corners only; glass tint matches the shell without oversized lozenges.
 */
const voicePreviewSnippet =
  "block w-full max-w-full rounded-lg border border-white/14 bg-white/[0.07] px-3 py-2 text-left text-[12px] leading-relaxed text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[10px] sm:text-[13px] sm:leading-relaxed";

/** Slightly wider orbit + more field usage so tone bubbles aren’t cramped. */
const VOICE_TONE_ORBIT_LAYOUT: SectorDonutLayoutOptions = {
  orbitRadiusScale: 1.14,
  maxRadiusFraction: 0.97,
};

const voicePreviewMicroCinematic = "text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45";

const voiceFieldLabel = "text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55";

const voicePhraseChip =
  "rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-[12px] text-white/88";

function navRevealDelayForVoiceStage(s: VoiceStage): number {
  return s === "tone" ? 1.02 : 0.88;
}

export type OnboardingBriefingVoiceStepProps = {
  payload: OnboardingPayloadV4;
  updatePayload: (fn: (prev: OnboardingPayloadV4) => OnboardingPayloadV4) => void;
  onAdvanceStep: () => void;
  onBackStep: () => void;
};

function resolveArchetypeId(raw: string | undefined): ToneArchetypeId {
  if (raw && raw in TONE_PREVIEW_BY_ARCHETYPE) return raw as ToneArchetypeId;
  return "warm_editorial";
}

export function OnboardingBriefingVoiceStep({
  payload,
  updatePayload,
  onAdvanceStep,
  onBackStep,
}: OnboardingBriefingVoiceStepProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const stage = STAGES[stageIndex]!;
  const copy = VOICE_STAGE_COPY[stage];
  useRegisterOnboardingBriefingHeader(
    copy.kicker,
    `${stageIndex + 1} of ${STAGES.length}`,
  );
  const navDelay = navRevealDelayForVoiceStage(stage);
  const activeCardRef = useRef<HTMLDivElement>(null);

  const facts = useMemo(
    () => parseBriefingVoiceFactsFromSeeds(payload.knowledge_seeds),
    [payload.knowledge_seeds],
  );

  const archetypeId = resolveArchetypeId(facts.tone_archetype);
  const preview = TONE_PREVIEW_BY_ARCHETYPE[archetypeId];
  const bannedPhrases = (facts.banned_phrases ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  useEffect(() => {
    const el = activeCardRef.current?.querySelector<HTMLElement>("input, button, select");
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, [stageIndex]);

  function patchFacts(patch: Partial<BriefingVoiceFacts>) {
    const next: BriefingVoiceFacts = { ...facts, ...patch };
    updatePayload((p) => ({
      ...p,
      knowledge_seeds: upsertBriefingVoiceSeed(p.knowledge_seeds, next),
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

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          ref={activeCardRef}
          className="cinematic-scope relative flex h-full min-h-0 w-full max-w-4xl flex-1 flex-col items-stretch overflow-hidden px-4 pb-3 pt-1 text-center sm:px-8 sm:pb-4 sm:pt-2"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={voiceSceneMotion}
        >
          <motion.h1
            className="mx-auto max-w-[38rem] shrink-0 text-balance font-serif text-[clamp(1.35rem,3.8vw,2.35rem)] font-normal leading-[1.1] tracking-tight text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.55)] sm:text-[clamp(1.65rem,4.2vw,2.55rem)]"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: VOICE_CINEMATIC_EASE }}
          >
            {copy.title}
          </motion.h1>

          <motion.p
            className="mx-auto mt-2 max-w-xl shrink-0 text-pretty text-[13px] leading-relaxed text-white/75 sm:mt-3 sm:text-[14px]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.28, ease: VOICE_CINEMATIC_EASE }}
          >
            {copy.hint}
          </motion.p>

          <div className="relative z-10 mx-auto mt-2 flex w-full min-h-0 flex-1 flex-col items-center justify-center gap-0 overflow-hidden sm:mt-3 max-w-3xl">
            {stage === "tone" ? (
              <>
                <motion.div
                  className="w-full min-h-0 flex-1"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.52, delay: 0.52, ease: VOICE_CINEMATIC_EASE }}
                >
                  <ScopeSectorCluster<ToneArchetypeId>
                    className="!min-h-0 min-h-[min(11rem,24vh)] h-[min(14rem,min(30vh,260px))] max-w-[min(34rem,100%)] py-0 sm:min-h-[12rem] sm:h-[min(16rem,min(32vh,280px))]"
                    itemIds={TONE_ARCHETYPES.map((t) => t.id)}
                    getLabel={(id) => TONE_ARCHETYPES.find((t) => t.id === id)?.label ?? id}
                    isSelected={(id) => archetypeId === id}
                    onActivate={(id) => patchFacts({ tone_archetype: id })}
                    phaseShift={0.06}
                    layoutGroupId="voice-tone-sector-donut"
                    roleRadio
                    staggerBaseMs={380}
                    staggerStepMs={70}
                    bubbleMarginClassName="m-3"
                    orbitLayout={VOICE_TONE_ORBIT_LAYOUT}
                    pillClassName={cn(
                      scopeSectorGlassPillBase,
                      "max-w-[min(12rem,76vw)] text-center text-[13px] leading-snug whitespace-normal sm:text-[14px]",
                    )}
                  />
                </motion.div>

                <motion.div
                  className="mt-2 w-full max-w-[min(34rem,100%)] shrink-0 space-y-1.5 px-0.5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.88, ease: VOICE_CINEMATIC_EASE }}
                >
                  <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    Deterministic preview
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="text-left">
                      <p className={cn(voicePreviewMicroCinematic, "mb-1 pl-0.5")}>Before</p>
                      <p className={voicePreviewSnippet}>{preview.before}</p>
                    </div>
                    <div className="text-left">
                      <p className={cn(voicePreviewMicroCinematic, "mb-1 pl-0.5")}>After</p>
                      <p className={voicePreviewSnippet}>{preview.after}</p>
                    </div>
                  </div>
                </motion.div>
              </>
            ) : (
              <motion.div
                className="mt-1 w-full max-w-xl min-h-0 flex-1 space-y-2.5 text-left sm:space-y-2.5"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.52, ease: VOICE_CINEMATIC_EASE }}
              >
                <label className="block space-y-2 text-[13px]">
                  <span className={voiceFieldLabel}>Banned phrases</span>
                  <input
                    className={voiceCinematicInput}
                    value={facts.banned_phrases ?? ""}
                    onChange={(e) => patchFacts({ banned_phrases: e.target.value })}
                    placeholder="cheap, guarantee, last minute"
                  />
                </label>
                {bannedPhrases.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {bannedPhrases.map((phrase) => (
                      <span key={phrase} className={voicePhraseChip}>
                        {phrase}
                      </span>
                    ))}
                  </div>
                ) : null}
                <label className="block space-y-2 text-[13px]">
                  <span className={voiceFieldLabel}>Signature / closing</span>
                  <input
                    className={voiceCinematicInput}
                    value={facts.signature_closing ?? ""}
                    onChange={(e) => patchFacts({ signature_closing: e.target.value })}
                    placeholder="Warmly, - Elena"
                  />
                </label>
                <label className="block space-y-2 text-[13px]">
                  <span className={voiceFieldLabel}>Standard booking line</span>
                  <input
                    className={voiceCinematicInput}
                    value={facts.standard_booking_language ?? ""}
                    onChange={(e) => patchFacts({ standard_booking_language: e.target.value })}
                    placeholder="We typically reply within one business day."
                  />
                </label>
                <label className="block space-y-2 text-[13px]">
                  <span className={voiceFieldLabel}>Standard scope line</span>
                  <input
                    className={voiceCinematicInput}
                    value={facts.standard_scope_language ?? ""}
                    onChange={(e) => patchFacts({ standard_scope_language: e.target.value })}
                    placeholder="We photograph weddings across Europe."
                  />
                </label>
              </motion.div>
            )}
          </div>

          <motion.div
            className="navigation-reveal relative z-50 mx-auto mt-auto flex w-full max-w-lg shrink-0 flex-wrap items-center justify-between gap-2 pt-2 sm:pt-3"
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
