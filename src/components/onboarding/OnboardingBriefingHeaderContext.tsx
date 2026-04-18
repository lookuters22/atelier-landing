import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Per-step header registration for the onboarding briefing shell.
 *
 * Each step component can register a short kicker (e.g. "What's on your offer")
 * and an optional sub-stage counter (e.g. "3 of 3"). The shell's top-left
 * progress bar reads this state and renders the kicker in place of the default
 * "Briefing progress" label, so the kicker sits flush with the other top-bar
 * elements and we avoid duplicating the stage indicator inside the step body.
 */
export type OnboardingBriefingHeaderState = {
  kicker: string;
  stageLabel?: string;
};

type ContextValue = {
  header: OnboardingBriefingHeaderState | null;
  setHeader: (header: OnboardingBriefingHeaderState | null) => void;
};

const OnboardingBriefingHeaderCtx = createContext<ContextValue | null>(null);

export function OnboardingBriefingHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] =
    useState<OnboardingBriefingHeaderState | null>(null);

  const setHeader = useCallback(
    (next: OnboardingBriefingHeaderState | null) => {
      setHeaderState((current) => {
        if (current === next) return current;
        if (
          current &&
          next &&
          current.kicker === next.kicker &&
          current.stageLabel === next.stageLabel
        ) {
          return current;
        }
        return next;
      });
    },
    [],
  );

  const value = useMemo(() => ({ header, setHeader }), [header, setHeader]);

  return (
    <OnboardingBriefingHeaderCtx.Provider value={value}>
      {children}
    </OnboardingBriefingHeaderCtx.Provider>
  );
}

export function useOnboardingBriefingHeaderContext(): ContextValue | null {
  return useContext(OnboardingBriefingHeaderCtx);
}

/**
 * Registers the given kicker/stageLabel while the calling component is mounted.
 * Safe to call without a provider (no-op), so individual steps remain usable
 * in isolation (e.g. tests).
 */
export function useRegisterOnboardingBriefingHeader(
  kicker: string,
  stageLabel?: string,
): void {
  const ctx = useOnboardingBriefingHeaderContext();
  const setHeader = ctx?.setHeader;
  useEffect(() => {
    if (!setHeader) return;
    setHeader({ kicker, stageLabel });
    return () => {
      setHeader(null);
    };
  }, [setHeader, kicker, stageLabel]);
}
