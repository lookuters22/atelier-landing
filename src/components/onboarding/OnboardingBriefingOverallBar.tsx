import { motion } from "framer-motion";
import {
  ONBOARDING_BRIEFING_STEPS,
  ONBOARDING_BRIEFING_STEP_LABELS,
  type OnboardingBriefingStepId,
} from "@/types/onboardingBriefing.types.ts";
import { obMotionShell } from "@/components/onboarding/onboardingVisuals.ts";
import { cn } from "@/lib/utils";

export type OnboardingBriefingOverallBarProps = {
  stepIndex: number;
  className?: string;
};

/**
 * Persistent top-of-stage overall progress: one segment per briefing step,
 * with sage/stone shades that deepen for completed steps (luxury, calm).
 */
export function OnboardingBriefingOverallBar({ stepIndex, className }: OnboardingBriefingOverallBarProps) {
  const total = ONBOARDING_BRIEFING_STEPS.length;
  const safeIndex = Math.max(0, Math.min(stepIndex, total - 1));

  return (
    <div className={cn("w-full px-4 sm:px-6 md:px-8", className)}>
      <div
        className="flex items-center justify-between gap-3 pb-2"
        aria-hidden="true"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500/90 dark:text-stone-400/95">
          Briefing progress
        </p>
        <p className="tabular-nums text-[10px] font-medium uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">
          {safeIndex + 1} / {total}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={safeIndex + 1}
        aria-label={`Briefing step ${safeIndex + 1} of ${total}`}
        className="flex h-2 w-full gap-1 sm:h-2.5 sm:gap-1.5"
      >
        {ONBOARDING_BRIEFING_STEPS.map((id, i) => {
          const done = i < safeIndex;
          const current = i === safeIndex;
          const upcoming = i > safeIndex;

          return (
            <motion.div
              key={id}
              layout
              title={ONBOARDING_BRIEFING_STEP_LABELS[id as OnboardingBriefingStepId]}
              className={cn(
                "min-h-[6px] min-w-0 flex-1 rounded-full transition-colors duration-300",
                done &&
                  "bg-gradient-to-b from-[#6d7a63] to-[#55604d] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] dark:from-[#8a9a7e] dark:to-[#6f7d64]",
                current &&
                  "bg-gradient-to-b from-[#8a9a7e] to-[#6d7a63] shadow-[0_0_0_1px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.18)] dark:from-[#a8b89a] dark:to-[#8a9a7e]",
                upcoming &&
                  "bg-[#e5ddd4]/95 dark:bg-stone-700/75",
              )}
              initial={false}
              animate={{
                opacity: upcoming ? 0.55 : 1,
                scaleY: current ? 1.06 : 1,
              }}
              transition={{ duration: obMotionShell.duration, ease: obMotionShell.ease }}
            />
          );
        })}
      </div>
    </div>
  );
}
