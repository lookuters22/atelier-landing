import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_BRIEFING_STEPS,
  ONBOARDING_BRIEFING_STEP_LABELS,
  type OnboardingBriefingStepId,
} from "@/types/onboardingBriefing.types.ts";
import {
  obMotionProgressStagger,
  obProgressCurrentIntro,
  obProgressCurrentTitle,
  obProgressIndicatorActive,
  obProgressIndicatorDone,
  obProgressIndicatorFuture,
  obProgressLabel,
  obProgressMeta,
  obProgressRail,
  obProgressStepActive,
  obProgressStepDone,
  obProgressStepFuture,
  obProgressStrip,
} from "@/components/onboarding/onboardingVisuals.ts";

const STEP_INTRO: Record<OnboardingBriefingStepId, string> = {
  identity: "Define the studio basics so Ana speaks from the right place.",
  scope: "Choose what you shoot, where you work, and what stays out of bounds.",
  voice: "Shape tone, phrases, and reusable client-facing language.",
  authority: "Set what Ana may decide, draft, or escalate to you.",
  vault: "Capture exact wording for sensitive, high-stakes situations.",
  review: "Read the briefing like a dossier before handing Ana the keys.",
};

const railVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: obMotionProgressStagger, delayChildren: 0.04 },
  },
} as const;

const stepVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 0.68, 0.35, 1] } },
} as const;

export type OnboardingBriefingProgressProps = {
  stepIndex: number;
  currentStepId: OnboardingBriefingStepId;
  onStepSelect?: (index: number) => void;
  className?: string;
};

export function OnboardingBriefingProgress({
  stepIndex,
  currentStepId,
  onStepSelect,
  className,
}: OnboardingBriefingProgressProps) {
  const total = ONBOARDING_BRIEFING_STEPS.length;
  const selectable = typeof onStepSelect === "function";

  return (
    <div className={cn(obProgressStrip, className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={obProgressCurrentTitle}>{ONBOARDING_BRIEFING_STEP_LABELS[currentStepId]}</p>
          <p className={cn(obProgressCurrentIntro, "mt-1 max-w-2xl")}>{STEP_INTRO[currentStepId]}</p>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
          {stepIndex + 1} of {total}
        </p>
      </div>

      <motion.nav
        role="navigation"
        aria-label="Briefing steps"
        className={obProgressRail}
        initial="hidden"
        animate="show"
        variants={railVariants}
      >
        {ONBOARDING_BRIEFING_STEPS.map((id, i) => {
          const active = i === stepIndex;
          const done = i < stepIndex;

          let shellClass = obProgressStepFuture;
          if (active) shellClass = obProgressStepActive;
          else if (done) shellClass = obProgressStepDone;

          let indicatorClass = obProgressIndicatorFuture;
          if (active) indicatorClass = obProgressIndicatorActive;
          else if (done) indicatorClass = obProgressIndicatorDone;

          return (
            <motion.div key={id} variants={stepVariants}>
              <button
                type="button"
                disabled={!selectable}
                onClick={() => selectable && onStepSelect?.(i)}
                className={cn(
                  shellClass,
                  selectable ? "cursor-pointer" : "cursor-default",
                  active && "translate-y-[-1px]",
                )}
                aria-current={active ? "step" : undefined}
              >
                <span className={indicatorClass} aria-hidden="true">
                  {done && !active ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <span className="tabular-nums">{i + 1}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className={obProgressLabel}>{ONBOARDING_BRIEFING_STEP_LABELS[id]}</span>
                  <span className={obProgressMeta}>
                    {done && !active ? "Complete" : active ? "Current" : "Upcoming"}
                  </span>
                </span>
              </button>
            </motion.div>
          );
        })}
      </motion.nav>
    </div>
  );
}
