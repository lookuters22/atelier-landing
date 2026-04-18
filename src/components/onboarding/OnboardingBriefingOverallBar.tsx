import { motion } from "framer-motion";
import {
  ONBOARDING_BRIEFING_STEPS,
  ONBOARDING_BRIEFING_STEP_LABELS,
  type OnboardingBriefingStepId,
} from "@/types/onboardingBriefing.types.ts";
import { cn } from "@/lib/utils";
import { useOnboardingBriefingHeaderContext } from "./OnboardingBriefingHeaderContext.tsx";

export type OnboardingBriefingOverallBarProps = {
  stepIndex: number;
  className?: string;
};

/**
 * Persistent top-of-stage briefing progress: a quiet hairline of segments,
 * one per step. Designed to disappear into the cinematic background until
 * you look for it — done segments fade up softly, the current one carries a
 * gentle glow, upcoming ones sit as a near-invisible track.
 */
export function OnboardingBriefingOverallBar({ stepIndex, className }: OnboardingBriefingOverallBarProps) {
  const total = ONBOARDING_BRIEFING_STEPS.length;
  const safeIndex = Math.max(0, Math.min(stepIndex, total - 1));
  const headerCtx = useOnboardingBriefingHeaderContext();
  const header = headerCtx?.header ?? null;

  return (
    <div className={cn("w-full px-4 sm:px-6 md:px-8", className)}>
      <div
        className="flex items-baseline justify-between gap-3 pb-2"
        aria-hidden="true"
      >
        <div className="flex min-w-0 items-baseline gap-3">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
            {header?.kicker ?? "Briefing progress"}
          </p>
          {header?.stageLabel ? (
            <p className="tabular-nums text-[9.5px] font-medium uppercase tracking-[0.18em] text-white/45">
              {header.stageLabel}
            </p>
          ) : null}
        </div>
        <p className="tabular-nums text-[9.5px] font-medium uppercase tracking-[0.18em] text-white/45">
          {safeIndex + 1} / {total}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={safeIndex + 1}
        aria-label={`Briefing step ${safeIndex + 1} of ${total}`}
        className="flex h-[2px] w-full gap-2"
      >
        {ONBOARDING_BRIEFING_STEPS.map((id, i) => {
          const done = i < safeIndex;
          const current = i === safeIndex;

          return (
            <motion.div
              key={id}
              title={ONBOARDING_BRIEFING_STEP_LABELS[id as OnboardingBriefingStepId]}
              className={cn(
                "min-h-[2px] min-w-0 flex-1 rounded-full",
                done && "bg-white/45",
                current && "bg-white/90",
                !done && !current && "bg-white/[0.07]",
              )}
              initial={false}
              animate={{
                boxShadow: current
                  ? "0 0 10px rgba(255,255,255,0.28)"
                  : "0 0 0 rgba(255,255,255,0)",
              }}
              transition={{ duration: 0.5, ease: [0.22, 0.68, 0.35, 1] }}
            />
          );
        })}
      </div>
    </div>
  );
}
