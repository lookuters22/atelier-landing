import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { OnboardingPayloadV4 } from "@/lib/onboardingV4Payload.ts";
import { cn } from "@/lib/utils";
import {
  type BriefingVaultFactKey,
  parseBriefingVaultFactsFromSeeds,
  upsertBriefingVaultSeed,
} from "@/lib/onboardingBriefingVault.ts";
import { obIdentityGlassInput, obMotionShell } from "@/components/onboarding/onboardingVisuals.ts";
import { useRegisterOnboardingBriefingHeader } from "@/components/onboarding/OnboardingBriefingHeaderContext.tsx";

/**
 * Rotating typewriter hints — slightly faster keystroke cadence than Identity (70ms vs 88ms per char).
 * Shown only while the field is empty; stops when the user types.
 */
const VAULT_TYPEWRITER_EXAMPLES: Record<BriefingVaultFactKey, string[]> = {
  discount_language: [
    "Our collections are priced to reflect the full scope we deliver…",
    "If budget is tight, we can adjust scope before we adjust price…",
    "We don't discount our core packages; we can tailor add-ons instead…",
  ],
  payment_exception_language: [
    "Split payments can be arranged when the contract is signed by…",
    "We typically hold the line on our schedule unless there's a documented…",
    "One-off exceptions need written approval from…",
  ],
  late_extension_language: [
    "If you need a few extra days, tell us before the due date and…",
    "We allow one extension per invoice when we have…",
    "After the grace period, late fees apply as stated in…",
  ],
  raw_files_language: [
    "Deliverables are edited high-resolution files; RAWs are not included because…",
    "We retain RAWs for archival use only and do not release…",
    "Our agreement specifies finished work; unedited files stay…",
  ],
  publication_permission_language: [
    "We may share highlights with credit when you've approved…",
    "Gallery and vendor use require your written consent for…",
    "Credits should read exactly as…",
  ],
  privacy_language: [
    "We don't share client contact details with vendors without…",
    "Sensitive information stays within our team and…",
    "We retain records only as long as needed for…",
  ],
};

function useVaultTypewriterPlaceholder(factKey: BriefingVaultFactKey, enabled: boolean): string {
  const [display, setDisplay] = useState("");

  // Clear before paint when switching cards so the previous card's typewriter line never flashes.
  useLayoutEffect(() => {
    setDisplay("");
  }, [factKey]);

  useEffect(() => {
    if (!enabled) {
      setDisplay("");
      return;
    }
    const examples = VAULT_TYPEWRITER_EXAMPLES[factKey];
    let cancelled = false;
    let exIdx = 0;
    let charIdx = 0;
    let tid: ReturnType<typeof setTimeout> | undefined;
    let startDelay: ReturnType<typeof setTimeout>;

    const typeLoop = () => {
      if (cancelled) return;
      const full = examples[exIdx % examples.length]!;
      if (charIdx < full.length) {
        setDisplay(full.slice(0, charIdx + 1));
        charIdx++;
        tid = setTimeout(typeLoop, 70);
        return;
      }
      tid = setTimeout(() => {
        charIdx = 0;
        exIdx++;
        setDisplay("");
        typeLoop();
      }, 2000);
    };

    startDelay = setTimeout(() => {
      if (!cancelled) typeLoop();
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(startDelay);
      if (tid) clearTimeout(tid);
    };
  }, [factKey, enabled]);

  return display;
}

const VAULT_CARDS: readonly {
  factKey: BriefingVaultFactKey;
  title: string;
  whenUsed: string;
}[] = [
  {
    factKey: "discount_language",
    title: "Discounts & investment",
    whenUsed: "When a conversation turns to price changes, custom packages, or how you frame cost.",
  },
  {
    factKey: "payment_exception_language",
    title: "Payment exceptions",
    whenUsed: "When someone asks for a one-off payment arrangement outside your usual flow.",
  },
  {
    factKey: "late_extension_language",
    title: "Late payment extensions",
    whenUsed: "When a client needs more time on an invoice or a due date adjustment.",
  },
  {
    factKey: "raw_files_language",
    title: "RAW files",
    whenUsed: "When deliverables include or exclude RAWs, or someone insists on unedited files.",
  },
  {
    factKey: "publication_permission_language",
    title: "Publication & gallery use",
    whenUsed: "When usage rights, sharing, credits, or gallery visibility come up.",
  },
  {
    factKey: "privacy_language",
    title: "Sensitive data & privacy",
    whenUsed: "When protecting client details, vendors, or compliance-sensitive information.",
  },
];

const VAULT_CINEMATIC_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const vaultSceneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.32, ease: obMotionShell.ease } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: obMotionShell.ease } },
} as const;

const vaultFieldLabel = "text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55";

export type OnboardingBriefingVaultStepProps = {
  payload: OnboardingPayloadV4;
  updatePayload: (fn: (prev: OnboardingPayloadV4) => OnboardingPayloadV4) => void;
  onAdvanceStep: () => void;
  onBackStep: () => void;
};

export function OnboardingBriefingVaultStep({
  payload,
  updatePayload,
  onAdvanceStep,
  onBackStep,
}: OnboardingBriefingVaultStepProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const activeCard = VAULT_CARDS[stageIndex]!;
  const activeCardRef = useRef<HTMLDivElement>(null);
  useRegisterOnboardingBriefingHeader(
    "Vault",
    `${stageIndex + 1} of ${VAULT_CARDS.length}`,
  );

  const facts = useMemo(
    () => parseBriefingVaultFactsFromSeeds(payload.knowledge_seeds),
    [payload.knowledge_seeds],
  );

  const vaultValue = facts[activeCard.factKey] ?? "";
  const vaultValueEmpty = !vaultValue.trim();
  const vaultAnimatedPlaceholder = useVaultTypewriterPlaceholder(activeCard.factKey, vaultValueEmpty);

  useEffect(() => {
    const el = activeCardRef.current?.querySelector<HTMLElement>("textarea");
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, [stageIndex]);

  function patchFacts(patch: Partial<Record<BriefingVaultFactKey, string>>) {
    const next = { ...facts, ...patch };
    updatePayload((prev) => ({
      ...prev,
      knowledge_seeds: upsertBriefingVaultSeed(prev.knowledge_seeds, next),
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
    if (stageIndex >= VAULT_CARDS.length - 1) {
      onAdvanceStep();
      return;
    }
    setStageIndex((current) => Math.min(VAULT_CARDS.length - 1, current + 1));
  }

  const nextLabel = stageIndex < VAULT_CARDS.length - 1 ? "Next" : "Continue";
  const navDelay = 0.88;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-x-hidden overflow-y-visible">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCard.factKey}
          ref={activeCardRef}
          className="cinematic-scope relative flex h-full min-h-0 w-full max-w-4xl flex-1 flex-col items-stretch overflow-x-hidden overflow-y-visible px-4 pb-3 pt-1 text-center sm:px-8 sm:pb-4 sm:pt-2"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={vaultSceneMotion}
        >
          <motion.p
            className="mx-auto max-w-2xl shrink-0 text-pretty text-[12px] leading-relaxed text-white/65 sm:text-[13px]"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: VAULT_CINEMATIC_EASE }}
          >
            If Ana is allowed to respond, what standard language should she use for sensitive topics? This is{" "}
            <span className="font-medium text-white/85">reusable wording only</span> — it does not grant permission by
            itself.
          </motion.p>
          <motion.p
            className="mx-auto mt-2 max-w-2xl shrink-0 text-pretty text-[11px] leading-relaxed text-white/45"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12, ease: VAULT_CINEMATIC_EASE }}
          >
            Authority still controls whether Ana may act, draft, ask you, or stop.
          </motion.p>

          <motion.h1
            className="mx-auto mt-5 max-w-[38rem] shrink-0 text-balance font-serif text-[clamp(1.35rem,3.8vw,2.35rem)] font-normal leading-[1.1] tracking-tight text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.55)] sm:mt-6 sm:text-[clamp(1.65rem,4.2vw,2.55rem)]"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.22, ease: VAULT_CINEMATIC_EASE }}
          >
            {activeCard.title}
          </motion.h1>

          <motion.p
            className="mx-auto mt-2 max-w-xl shrink-0 text-pretty text-[13px] leading-relaxed text-white/75 sm:mt-3 sm:text-[14px]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.38, ease: VAULT_CINEMATIC_EASE }}
          >
            {activeCard.whenUsed}
          </motion.p>

          <div className="relative z-10 mx-auto mt-3 flex w-full min-h-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-visible sm:mt-4 max-w-2xl">
            <motion.div
              className="w-full text-left"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.55, ease: VAULT_CINEMATIC_EASE }}
            >
              <p className={cn(vaultFieldLabel, "mb-2 text-center sm:mb-2.5")}>Standard wording</p>
              <label className="block">
                <span className="sr-only">Standard wording for {activeCard.title}</span>
                <textarea
                  key={activeCard.factKey}
                  className={cn(
                    obIdentityGlassInput,
                    "min-h-[min(7.5rem,24vh)] resize-y leading-relaxed",
                  )}
                  value={vaultValue}
                  onChange={(e) => patchFacts({ [activeCard.factKey]: e.target.value })}
                  placeholder={vaultValueEmpty ? vaultAnimatedPlaceholder : ""}
                  rows={5}
                  autoComplete="off"
                />
              </label>
            </motion.div>
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
              {nextLabel}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
