import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { DynamicBackground } from "@/components/modes/today/DynamicBackground";
import {
  obMotionStageEntrance,
  obStageVignette,
} from "@/components/onboarding/onboardingVisuals.ts";

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export type OnboardingBriefingShellProps = {
  title?: string;
  subtitle?: string;
  progress?: ReactNode;
  footer?: ReactNode;
  saveError?: string | null;
  stepEyebrow?: string;
  children?: ReactNode;
  /** When true, main content fills height (top-aligned) so inner panels can scroll — e.g. final review dossier. */
  contentFillHeight?: boolean;
};

export function OnboardingBriefingShell({
  progress,
  footer,
  saveError,
  children,
  contentFillHeight,
}: OnboardingBriefingShellProps) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden bg-black" aria-hidden="true">
        <DynamicBackground />
        <div className={cn("pointer-events-none absolute inset-0 z-[1]", obStageVignette)} />
        <div
          className="pointer-events-none absolute inset-0 z-[2]"
          style={{
            backgroundImage: GRAIN_SVG,
            backgroundRepeat: "repeat",
            mixBlendMode: "overlay",
            opacity: 0.05,
          }}
        />
      </div>

      <motion.div
        className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-3 sm:p-4 md:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: obMotionStageEntrance.duration * 0.45, ease: obMotionStageEntrance.ease }}
      >
        <motion.div
          className="flex h-full min-h-0 w-full flex-col"
          initial={{ opacity: 0, y: 24, scale: 0.982 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={obMotionStageEntrance}
        >
          {progress ? (
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 w-full pt-3 sm:pt-4">{progress}</div>
          ) : null}
          <div
            className={cn(
              "min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-6",
              progress && "pt-[4.75rem] sm:pt-[5rem]",
            )}
          >
            {saveError ? (
              <p
                role="alert"
                className="mx-auto mb-4 max-w-xl rounded-lg border border-red-300/90 bg-red-50 px-3 py-2 text-[13px] text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              >
                {saveError}
              </p>
            ) : null}

            <div
              className={cn(
                "mx-auto flex h-full min-h-0 w-full max-w-6xl",
                contentFillHeight
                  ? "flex-col items-stretch justify-start"
                  : "items-center justify-center",
              )}
            >
              {children}
            </div>
          </div>

          {footer ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
              <div className="pointer-events-auto w-full max-w-3xl">{footer}</div>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </div>
  );
}
