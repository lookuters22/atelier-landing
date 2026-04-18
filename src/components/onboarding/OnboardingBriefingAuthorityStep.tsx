import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { OnboardingPayloadV4 } from "@/lib/onboardingV4Payload.ts";
import type {
  ActionPermissionDecisionMode,
  SchedulingActionKey,
} from "@/lib/onboardingActionPermissionMatrixScheduling.ts";
import { SCHEDULING_ACTION_MATRIX_KEYS } from "@/lib/onboardingActionPermissionMatrixScheduling.ts";
import {
  SCHEDULING_AUTHORITY_ROW_LABELS,
  SCHEDULING_DECISION_CHIP_OPTIONS,
  resolveSchedulingActionPermissionMatrix,
} from "@/lib/onboardingBriefingAuthorityScheduling.ts";
import {
  AUTHORITY_BOARD_GROUPS,
  DEFAULT_NON_SCHEDULING_AUTHORITY_MODE,
  type AuthorityBoardRowDef,
  type NonSchedulingAuthorityActionKey,
  resolveNonSchedulingAuthorityMode,
  upsertBriefingAuthorityPlaybookSeed,
} from "@/lib/onboardingBriefingAuthorityPlaybook.ts";
import {
  ESCALATION_BATCHING_OPTIONS,
  ESCALATION_IMMEDIATE_TOPIC_KEYS,
  ESCALATION_TOPIC_LABELS,
  resolveEscalationPreferencesForUi,
} from "@/lib/onboardingBriefingAuthorityEscalationUi.ts";
import type { EscalationBatchingPreference, EscalationImmediateTopicKey } from "@/lib/onboardingCaptureEscalationPreferences.ts";
import { scopeSectorGlassPillBase, scopeSectorGlassPillOn } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import { obMotionShell } from "@/components/onboarding/onboardingVisuals.ts";
import { cn } from "@/lib/utils";
import { useRegisterOnboardingBriefingHeader } from "@/components/onboarding/OnboardingBriefingHeaderContext.tsx";

type AuthorityStage =
  | { kind: "scheduling" }
  | { kind: "group"; groupIndex: number }
  | { kind: "escalation" };

/** Match Voice / Business scope editorial easing. */
const AUTHORITY_CINEMATIC_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const authoritySceneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.32, ease: obMotionShell.ease } },
  exit: { opacity: 0, transition: { duration: 0.22, ease: obMotionShell.ease } },
} as const;

const authorityFieldLabel = "text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55";

function navRevealDelayForAuthorityStage(stage: AuthorityStage): number {
  if (stage.kind === "escalation") return 0.95;
  if (stage.kind === "group") return 0.9;
  return 0.92;
}

function ChipRow({
  selected,
  onSelect,
}: {
  selected: ActionPermissionDecisionMode;
  onSelect: (mode: ActionPermissionDecisionMode) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 px-2 py-2 sm:gap-2.5 sm:px-3">
      {SCHEDULING_DECISION_CHIP_OPTIONS.map(({ mode, label }) => {
        const isOn = selected === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            className={cn(
              "min-h-[44px] shrink-0 rounded-full border px-3 py-2 text-center text-[12px] leading-snug transition-[background,border-color,box-shadow] duration-200 sm:min-h-0 sm:px-4",
              scopeSectorGlassPillBase,
              "whitespace-normal text-white/88",
              isOn && scopeSectorGlassPillOn,
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export type OnboardingBriefingAuthorityStepProps = {
  payload: OnboardingPayloadV4;
  updatePayload: (fn: (prev: OnboardingPayloadV4) => OnboardingPayloadV4) => void;
  onAdvanceStep: () => void;
  onBackStep: () => void;
};

export function OnboardingBriefingAuthorityStep({
  payload,
  updatePayload,
  onAdvanceStep,
  onBackStep,
}: OnboardingBriefingAuthorityStepProps) {
  const stages: AuthorityStage[] = [
    { kind: "scheduling" },
    ...AUTHORITY_BOARD_GROUPS.map((_, groupIndex) => ({ kind: "group", groupIndex }) as const),
    { kind: "escalation" },
  ];
  const [stageIndex, setStageIndex] = useState(0);
  const stage = stages[stageIndex]!;
  const navDelay = navRevealDelayForAuthorityStage(stage);
  const activeCardRef = useRef<HTMLDivElement>(null);
  useRegisterOnboardingBriefingHeader(
    "Authority",
    `${stageIndex + 1} of ${stages.length}`,
  );

  const matrix = useMemo(
    () => resolveSchedulingActionPermissionMatrix(payload.scheduling_action_permission_matrix),
    [payload.scheduling_action_permission_matrix],
  );

  const escalation = useMemo(
    () => resolveEscalationPreferencesForUi(payload.escalation_preferences),
    [payload.escalation_preferences],
  );

  const modeByAction = useMemo(() => {
    const m = new Map<NonSchedulingAuthorityActionKey, ActionPermissionDecisionMode>();
    for (const g of AUTHORITY_BOARD_GROUPS) {
      for (const row of g.rows) {
        m.set(row.action_key, resolveNonSchedulingAuthorityMode(payload.playbook_seeds, row.action_key));
      }
    }
    return m;
  }, [payload.playbook_seeds]);

  useEffect(() => {
    const el = activeCardRef.current?.querySelector<HTMLElement>("input, button, select");
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, [stageIndex]);

  function setSchedulingMode(key: SchedulingActionKey, mode: ActionPermissionDecisionMode) {
    updatePayload((prev) => {
      const next = resolveSchedulingActionPermissionMatrix(prev.scheduling_action_permission_matrix);
      return {
        ...prev,
        scheduling_action_permission_matrix: { ...next, [key]: mode },
      };
    });
  }

  function setPlaybookMode(row: AuthorityBoardRowDef, mode: ActionPermissionDecisionMode) {
    updatePayload((prev) => ({
      ...prev,
      playbook_seeds: upsertBriefingAuthorityPlaybookSeed(prev.playbook_seeds, row, mode),
    }));
  }

  function toggleImmediateTopic(key: EscalationImmediateTopicKey) {
    updatePayload((prev) => {
      const base = resolveEscalationPreferencesForUi(prev.escalation_preferences);
      const set = new Set(base.immediate_notification_topics);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return {
        ...prev,
        escalation_preferences: {
          ...base,
          immediate_notification_topics: [...set] as EscalationImmediateTopicKey[],
        },
      };
    });
  }

  function setBatchingPreference(value: EscalationBatchingPreference) {
    updatePayload((prev) => ({
      ...prev,
      escalation_preferences: {
        ...resolveEscalationPreferencesForUi(prev.escalation_preferences),
        batching_preference: value,
      },
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
    if (stageIndex >= stages.length - 1) {
      onAdvanceStep();
      return;
    }
    setStageIndex((current) => Math.min(stages.length - 1, current + 1));
  }

  const activeGroup = stage.kind === "group" ? AUTHORITY_BOARD_GROUPS[stage.groupIndex] : null;

  const titleAndHint = (() => {
    if (stage.kind === "scheduling") {
      return {
        title: "Which scheduling actions can Ana decide without stopping the flow?",
        hint: "How much can Ana do with your calendar without checking in first? Pick what feels safe — you can tighten or loosen any of this later.",
      };
    }
    if (stage.kind === "group" && activeGroup) {
      return {
        title: activeGroup.title,
        hint: "How much should Ana handle on her own in this area? Set it where you’d be comfortable if you were on a slow week.",
      };
    }
    return {
      title: "When Ana escalates, what should hit you immediately?",
      hint: "When Ana flags something for you, how should it reach you? Decide what’s urgent enough to interrupt — everything else will batch quietly.",
    };
  })();

  const nextLabel = stageIndex < stages.length - 1 ? "Next" : "Continue";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-x-hidden overflow-y-visible">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${stage.kind}-${stage.kind === "group" ? stage.groupIndex : "x"}`}
          ref={activeCardRef}
          className="cinematic-scope relative flex h-full min-h-0 w-full max-w-4xl flex-1 flex-col items-stretch overflow-x-hidden overflow-y-visible px-4 pb-3 pt-1 text-center sm:px-8 sm:pb-4 sm:pt-2"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={authoritySceneMotion}
        >
          <motion.h1
            className="mx-auto max-w-[38rem] shrink-0 text-balance font-serif text-[clamp(1.35rem,3.8vw,2.35rem)] font-normal leading-[1.1] tracking-tight text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.55)] sm:text-[clamp(1.65rem,4.2vw,2.55rem)]"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: AUTHORITY_CINEMATIC_EASE }}
          >
            {titleAndHint.title}
          </motion.h1>

          <motion.p
            className="mx-auto mt-2 max-w-xl shrink-0 text-pretty text-[13px] leading-relaxed text-white/75 sm:mt-3 sm:text-[14px]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.28, ease: AUTHORITY_CINEMATIC_EASE }}
          >
            {titleAndHint.hint}
          </motion.p>

          <div className="relative z-10 mx-auto mt-2 flex w-full min-h-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-visible sm:mt-3 max-w-3xl">
            <motion.div
              className="w-full min-h-0 flex-1 overflow-visible text-center"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.52, ease: AUTHORITY_CINEMATIC_EASE }}
            >
              {stage.kind === "scheduling" ? (
                <div className="space-y-6 pb-1">
                  {SCHEDULING_ACTION_MATRIX_KEYS.map((key) => (
                    <div key={key}>
                      <p className="text-[13px] font-medium leading-snug text-white/90">
                        {SCHEDULING_AUTHORITY_ROW_LABELS[key]}
                      </p>
                      <ChipRow selected={matrix[key]} onSelect={(mode) => setSchedulingMode(key, mode)} />
                    </div>
                  ))}
                </div>
              ) : null}

              {stage.kind === "group" && activeGroup ? (
                <div className="space-y-6 pb-1">
                  {activeGroup.rows.map((row) => (
                    <div key={row.action_key}>
                      <p className="text-[13px] font-medium leading-snug text-white/90">{row.scenarioLabel}</p>
                      <ChipRow
                        selected={modeByAction.get(row.action_key) ?? DEFAULT_NON_SCHEDULING_AUTHORITY_MODE}
                        onSelect={(mode) => setPlaybookMode(row, mode)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {stage.kind === "escalation" ? (
                <div className="space-y-6 pb-1 text-center">
                  <div>
                    <p className={cn(authorityFieldLabel, "mb-2")}>Immediate notification topics</p>
                    <div className="flex flex-wrap justify-center gap-2 px-1 py-1">
                      {ESCALATION_IMMEDIATE_TOPIC_KEYS.map((key) => {
                        const on = escalation.immediate_notification_topics.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleImmediateTopic(key)}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-left text-[12px] leading-snug transition-[background,border-color,box-shadow] duration-200",
                              scopeSectorGlassPillBase,
                              "text-white/88",
                              on && scopeSectorGlassPillOn,
                            )}
                          >
                            {ESCALATION_TOPIC_LABELS[key]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mx-auto w-full max-w-xl text-left">
                    <p className={cn(authorityFieldLabel, "mb-2 text-center")}>Batching preference</p>
                    <div className="flex flex-col gap-2">
                      {ESCALATION_BATCHING_OPTIONS.map(({ value, label }) => (
                        <label
                          key={value}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-[13px] transition-[background,border-color] duration-200",
                            escalation.batching_preference === value
                              ? "border-[#9ca893]/90 bg-[#9ca893]/22 text-white shadow-[0_0_20px_rgba(156,168,147,0.2)]"
                              : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10",
                          )}
                        >
                          <input
                            type="radio"
                            name="escalation-batching"
                            className="mt-1 accent-[#9ca893]"
                            checked={escalation.batching_preference === value}
                            onChange={() => setBatchingPreference(value)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
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
