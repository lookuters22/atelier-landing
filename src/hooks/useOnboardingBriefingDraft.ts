import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { createEmptyOnboardingPayloadV4 } from "@/lib/onboardingBriefingEmptyPayload.ts";
import type { OnboardingPayloadV4 } from "@/lib/onboardingV4Payload.ts";
import { readPhotographerSettings } from "@/lib/photographerSettings.ts";
import {
  mergeOnboardingBriefingSnapshotIntoSettings,
  parseOnboardingBriefingSnapshotV1,
} from "@/lib/onboardingBriefingSettings.ts";
import { mergePhotographerSettings } from "@/lib/photographerSettings.ts";
import {
  ONBOARDING_BRIEFING_STEPS,
  type OnboardingBriefingStepId,
} from "@/types/onboardingBriefing.types.ts";
import { fireDataChanged } from "@/lib/events.ts";

function stepIndexFromId(id: OnboardingBriefingStepId | undefined): number {
  if (!id) return 0;
  const i = ONBOARDING_BRIEFING_STEPS.indexOf(id);
  return i >= 0 ? i : 0;
}

function idFromStepIndex(i: number): OnboardingBriefingStepId {
  return ONBOARDING_BRIEFING_STEPS[Math.max(0, Math.min(i, ONBOARDING_BRIEFING_STEPS.length - 1))];
}

export type UseOnboardingBriefingDraftResult = {
  loading: boolean;
  saveError: string | null;
  stepIndex: number;
  currentStepId: OnboardingBriefingStepId;
  completedSteps: string[];
  payload: OnboardingPayloadV4;
  updatePayload: (fn: (prev: OnboardingPayloadV4) => OnboardingPayloadV4) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (index: number) => void;
  saveDraft: (overrides?: {
    stepIndex?: number;
    completedSteps?: string[];
    payload?: OnboardingPayloadV4;
  }) => Promise<void>;
  completeOnboarding: () => Promise<void>;
};

export function useOnboardingBriefingDraft(
  photographerId: string | null | undefined,
): UseOnboardingBriefingDraftResult {
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [payload, setPayload] = useState<OnboardingPayloadV4>(createEmptyOnboardingPayloadV4);
  useEffect(() => {
    if (!photographerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setSaveError(null);
      try {
        const read = await readPhotographerSettings(supabase, photographerId);
        const snap = parseOnboardingBriefingSnapshotV1(read?.raw);
        if (cancelled) return;
        if (snap) {
          setPayload(snap.payload);
          setCompletedSteps(snap.completed_steps);
          setStepIndex(stepIndexFromId(snap.current_step));
        } else {
          setPayload(createEmptyOnboardingPayloadV4());
          setCompletedSteps([]);
          setStepIndex(0);
        }
      } catch (e) {
        if (!cancelled) setSaveError(e instanceof Error ? e.message : "Failed to load briefing draft");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photographerId]);

  const persist = useCallback(
    async (next: {
      stepIndex: number;
      completedSteps: string[];
      payload: OnboardingPayloadV4;
    }) => {
      if (!photographerId) return;
      setSaveError(null);
      const read = await readPhotographerSettings(supabase, photographerId);
      const raw = read?.raw ?? {};
      const now = new Date().toISOString();
      const stepId = idFromStepIndex(next.stepIndex);
      const snapshot = {
        schema_version: 1 as const,
        status: "draft" as const,
        completed_steps: next.completedSteps,
        last_saved_at: now,
        current_step: stepId,
        payload: next.payload,
      };
      const merged = mergeOnboardingBriefingSnapshotIntoSettings(raw, snapshot, { updatedAtIso: now });
      const { error } = await supabase.from("photographers").update({ settings: merged }).eq("id", photographerId);
      if (error) {
        setSaveError(error.message);
        throw new Error(error.message);
      }
      fireDataChanged("settings");
    },
    [photographerId],
  );

  const saveDraft = useCallback(
    async (overrides?: {
      stepIndex?: number;
      completedSteps?: string[];
      payload?: OnboardingPayloadV4;
    }) => {
      const si = overrides?.stepIndex ?? stepIndex;
      const cs = overrides?.completedSteps ?? completedSteps;
      const pl = overrides?.payload ?? payload;
      await persist({ stepIndex: si, completedSteps: cs, payload: pl });
    },
    [completedSteps, payload, persist, stepIndex],
  );

  const completeOnboarding = useCallback(async () => {
    if (!photographerId) return;
    setSaveError(null);
    const read = await readPhotographerSettings(supabase, photographerId);
    const raw = read?.raw ?? {};
    const now = new Date().toISOString();
    const completed = Array.from(new Set([...completedSteps, ...ONBOARDING_BRIEFING_STEPS]));
    const nextPayload: OnboardingPayloadV4 = {
      ...payload,
      settings_meta: {
        ...payload.settings_meta,
        onboarding_completed_at: now,
      },
    };
    const snapshot = {
      schema_version: 1 as const,
      status: "completed" as const,
      completed_steps: completed,
      last_saved_at: now,
      current_step: idFromStepIndex(ONBOARDING_BRIEFING_STEPS.length - 1),
      payload: nextPayload,
    };

    const withSnapshot = mergeOnboardingBriefingSnapshotIntoSettings(raw, snapshot, { updatedAtIso: now });
    const merged = mergePhotographerSettings(withSnapshot, { onboarding_completed_at: now });
    const { error } = await supabase.from("photographers").update({ settings: merged }).eq("id", photographerId);
    if (error) {
      setSaveError(error.message);
      throw new Error(error.message);
    }

    setCompletedSteps(completed);
    setPayload(nextPayload);
    fireDataChanged("settings");
  }, [completedSteps, payload, photographerId]);

  const goNext = useCallback(() => {
    setStepIndex((prev) => {
      if (prev >= ONBOARDING_BRIEFING_STEPS.length - 1) return prev;
      const curId = idFromStepIndex(prev);
      setCompletedSteps((cs) => (cs.includes(curId) ? cs : [...cs, curId]));
      return prev + 1;
    });
  }, []);

  const goBack = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToStep = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, ONBOARDING_BRIEFING_STEPS.length - 1));
    setStepIndex(clamped);
  }, []);

  const updatePayload = useCallback((fn: (prev: OnboardingPayloadV4) => OnboardingPayloadV4) => {
    setPayload(fn);
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!photographerId || loading) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist({ stepIndex, completedSteps, payload }).catch(() => {
        /* saveError set in persist */
      });
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [photographerId, loading, stepIndex, completedSteps, payload, persist]);

  const currentStepId = useMemo(() => idFromStepIndex(stepIndex), [stepIndex]);

  return useMemo(
    () => ({
      loading,
      saveError,
      stepIndex,
      currentStepId,
      completedSteps,
      payload,
      updatePayload,
      goNext,
      goBack,
      goToStep,
      saveDraft,
      completeOnboarding,
    }),
    [
      loading,
      saveError,
      stepIndex,
      currentStepId,
      completedSteps,
      payload,
      updatePayload,
      goNext,
      goBack,
      goToStep,
      saveDraft,
      completeOnboarding,
    ],
  );
}
