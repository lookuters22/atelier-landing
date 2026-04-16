import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_BRIEFING_STEPS,
  type OnboardingBriefingStepId,
} from "@/types/onboardingBriefing.types.ts";
import {
  obFooterBack,
  obFooterBackDisabled,
  obFooterBar,
  obFooterComplete,
  obFooterContinue,
  obFooterSave,
} from "@/components/onboarding/onboardingVisuals.ts";

const PRIMARY_LABELS: Record<OnboardingBriefingStepId, string> = {
  identity: "Continue to scope",
  scope: "Shape the voice",
  voice: "Set authority",
  authority: "Open the vault",
  vault: "Review dossier",
  review: "Initialize Ana",
};

export type OnboardingBriefingFooterProps = {
  stepIndex: number;
  currentStepId: OnboardingBriefingStepId;
  onBack: () => void;
  onNext: () => void | Promise<void>;
  onSaveAndExit: () => void;
  saving?: boolean;
  className?: string;
};

export function OnboardingBriefingFooter({
  stepIndex,
  currentStepId,
  onBack,
  onNext,
  onSaveAndExit,
  saving,
  className,
}: OnboardingBriefingFooterProps) {
  const first = stepIndex <= 0;
  const isReview = stepIndex >= ONBOARDING_BRIEFING_STEPS.length - 1;

  return (
    <footer
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        obFooterBar,
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={first || saving}
          onClick={onBack}
          className={cn("min-w-[6rem]", first || saving ? obFooterBackDisabled : obFooterBack)}
        >
          Back
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void onNext()}
          className={cn(
            "min-w-[10.5rem] font-medium",
            isReview ? obFooterComplete : obFooterContinue,
          )}
        >
          {PRIMARY_LABELS[currentStepId]}
        </Button>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(obFooterSave, "sm:ml-auto")}
        disabled={saving}
        onClick={onSaveAndExit}
      >
        {saving ? "Saving..." : "Save & exit"}
      </Button>
    </footer>
  );
}
