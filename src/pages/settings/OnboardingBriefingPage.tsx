import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useOnboardingBriefingDraft } from "@/hooks/useOnboardingBriefingDraft.ts";
import { OnboardingBriefingOverallBar } from "@/components/onboarding/OnboardingBriefingOverallBar.tsx";
import { OnboardingBriefingHeaderProvider } from "@/components/onboarding/OnboardingBriefingHeaderContext.tsx";
import { OnboardingBriefingShell } from "@/components/onboarding/OnboardingBriefingShell.tsx";
import { OnboardingBriefingFooter } from "@/components/onboarding/OnboardingBriefingFooter.tsx";
import { OnboardingBriefingIdentityStep } from "@/components/onboarding/OnboardingBriefingIdentityStep.tsx";
import { OnboardingBriefingScopeStep } from "@/components/onboarding/OnboardingBriefingScopeStep.tsx";
import { OnboardingBriefingVoiceStep } from "@/components/onboarding/OnboardingBriefingVoiceStep.tsx";
import { OnboardingBriefingAuthorityStep } from "@/components/onboarding/OnboardingBriefingAuthorityStep.tsx";
import { OnboardingBriefingVaultStep } from "@/components/onboarding/OnboardingBriefingVaultStep.tsx";
import { OnboardingBriefingReviewStep } from "@/components/onboarding/OnboardingBriefingReviewStep.tsx";

/** Studio briefing shell — mounted at `/onboarding` (primary) and reachable from Settings via the same route. */
export function OnboardingBriefingPage() {
  const navigate = useNavigate();
  const { photographerId } = useAuth();
  const draft = useOnboardingBriefingDraft(photographerId ?? undefined);
  const [savingExit, setSavingExit] = useState(false);
  const [completing, setCompleting] = useState(false);

  const handleSaveAndExit = useCallback(async () => {
    setSavingExit(true);
    try {
      await draft.saveDraft();
      navigate("/settings");
    } catch {
      /* saveError on hook */
    } finally {
      setSavingExit(false);
    }
  }, [draft, navigate]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      void handleSaveAndExit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSaveAndExit]);

  if (draft.loading) {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80"
        aria-busy="true"
        aria-live="polite"
      >
        <p className="text-[13px] font-medium text-stone-300">Loading briefing…</p>
      </div>
    );
  }

  async function handleNext() {
    if (draft.currentStepId !== "review") {
      draft.goNext();
      return;
    }

    setCompleting(true);
    try {
      await draft.completeOnboarding();
      setTimeout(() => navigate("/today"), 520);
    } catch {
      setCompleting(false);
    }
  }

  const stepBody =
    draft.currentStepId === "identity" ? (
      <OnboardingBriefingIdentityStep
        payload={draft.payload}
        updatePayload={draft.updatePayload}
        onAdvanceStep={draft.goNext}
      />
    ) : draft.currentStepId === "scope" ? (
      <OnboardingBriefingScopeStep
        payload={draft.payload}
        updatePayload={draft.updatePayload}
        onAdvanceStep={draft.goNext}
        onBackStep={draft.goBack}
      />
    ) : draft.currentStepId === "voice" ? (
      <OnboardingBriefingVoiceStep
        payload={draft.payload}
        updatePayload={draft.updatePayload}
        onAdvanceStep={draft.goNext}
        onBackStep={draft.goBack}
      />
    ) : draft.currentStepId === "authority" ? (
      <OnboardingBriefingAuthorityStep
        payload={draft.payload}
        updatePayload={draft.updatePayload}
        onAdvanceStep={draft.goNext}
        onBackStep={draft.goBack}
      />
    ) : draft.currentStepId === "vault" ? (
      <OnboardingBriefingVaultStep
        payload={draft.payload}
        updatePayload={draft.updatePayload}
        onAdvanceStep={draft.goNext}
        onBackStep={draft.goBack}
      />
    ) : draft.currentStepId === "review" ? (
      <OnboardingBriefingReviewStep
        payload={draft.payload}
        onJumpToStep={(step) =>
          draft.goToStep(["identity", "scope", "voice", "authority", "vault", "review"].indexOf(step))
        }
        onBackStep={draft.goBack}
        onInitializeAna={() => void handleNext()}
        onSaveAndExit={handleSaveAndExit}
        saving={savingExit || completing}
      />
    ) : null;

  return (
    <OnboardingBriefingHeaderProvider>
    <OnboardingBriefingShell
      contentFillHeight={draft.currentStepId === "review"}
      progress={<OnboardingBriefingOverallBar stepIndex={draft.stepIndex} />}
      footer={
        draft.currentStepId === "identity" ||
        draft.currentStepId === "scope" ||
        draft.currentStepId === "voice" ||
        draft.currentStepId === "authority" ||
        draft.currentStepId === "vault" ||
        draft.currentStepId === "review" ? null : (
          <OnboardingBriefingFooter
            stepIndex={draft.stepIndex}
            currentStepId={draft.currentStepId}
            onBack={draft.goBack}
            onNext={handleNext}
            onSaveAndExit={handleSaveAndExit}
            saving={savingExit || completing}
          />
        )
      }
      saveError={draft.saveError}
    >
      <AnimatePresence mode="wait">
        {completing ? (
          <motion.div
            key="handoff"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mx-auto flex min-h-[26rem] max-w-3xl flex-col items-center justify-center rounded-[28px] border border-[#cabba8]/80 bg-[linear-gradient(180deg,rgba(252,249,244,0.98),rgba(240,232,221,0.96))] px-8 py-10 text-center shadow-[0_24px_60px_-36px_rgba(55,43,30,0.52)] dark:border-stone-600 dark:bg-[linear-gradient(180deg,rgba(30,27,25,0.96),rgba(22,20,18,0.94))]"
          >
            <div className="h-20 w-20 rounded-full border border-[#bca17d]/60 bg-[radial-gradient(circle,rgba(255,246,230,0.92),rgba(234,217,190,0.68))] shadow-[0_0_0_16px_rgba(204,183,145,0.12)] dark:border-stone-500 dark:bg-[radial-gradient(circle,rgba(95,86,73,0.95),rgba(43,38,34,0.82))]" />
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
              Handoff in motion
            </p>
            <h2 className="mt-3 font-serif text-[2rem] tracking-tight text-stone-900 dark:text-stone-100">
              Ana now has your studio briefing.
            </h2>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-stone-600 dark:text-stone-400">
              Saving your completed setup and carrying that context into Today...
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={draft.currentStepId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 0.68, 0.35, 1] }}
            className={
              draft.currentStepId === "review"
                ? "flex h-full min-h-0 w-full max-h-full flex-col items-stretch justify-start"
                : "flex h-full min-h-0 w-full max-h-full flex-col items-center justify-center"
            }
          >
            {stepBody}
          </motion.div>
        )}
      </AnimatePresence>
    </OnboardingBriefingShell>
    </OnboardingBriefingHeaderProvider>
  );
}
