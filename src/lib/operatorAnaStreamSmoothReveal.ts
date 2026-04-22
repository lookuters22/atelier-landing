import type { OperatorAnaWidgetFocusSnapshot } from "./operatorAnaWidgetConversationBounds.ts";
import type { OperatorStudioAssistantAssistantDisplay } from "./operatorStudioAssistantWidgetResult.ts";

/** Steady “typing” target (chars/s). */
export const TARGET_CPS = 50;

/** How much virtual lag (ms) is allowed while streaming before catch-up helps. */
export const MAX_LAG_MS_LIVE = 2500;

/** Slightly more headroom for post-`done` tail so the tail can move a bit faster, still hard-capped per frame. */
export const MAX_LAG_MS_AFTER_DONE = 1500;

/** Dampen catch-up so bursts do not feel like a paste. */
export const CATCH_UP_DAMPING = 0.15;

/** During live streaming: at most this many code units per rAF. */
export const MAX_BUDGET_PER_FRAME_LIVE = 2;

/** After `done` while draining: at most this many per rAF (faster than live, still not word-sized). */
export const MAX_BUDGET_PER_FRAME_AFTER_DONE = 4;

/** If total received is shorter, skip long drain and finalize on `done`. */
export const SHORT_REPLY_BYPASS = 30;

export const REVEAL_PACING_DEFAULTS = {
  targetCps: TARGET_CPS,
  maxLagLive: MAX_LAG_MS_LIVE,
  maxLagAfterDone: MAX_LAG_MS_AFTER_DONE,
  catchUpDamping: CATCH_UP_DAMPING,
  maxBudgetPerFrameLive: MAX_BUDGET_PER_FRAME_LIVE,
  maxBudgetPerFrameAfterDone: MAX_BUDGET_PER_FRAME_AFTER_DONE,
} as const;

export type RevealState = {
  inFlightId: string;
  received: string;
  displayedLen: number;
  lastTs: number;
  rafId: number | null;
  receivedEnded: boolean;
  pendingFinal: {
    display: OperatorStudioAssistantAssistantDisplay;
    focusSnapshot: OperatorAnaWidgetFocusSnapshot;
  } | null;
};

export function shouldBypassPacedDrain(receivedTotalLen: number, bypassChars = SHORT_REPLY_BYPASS): boolean {
  return receivedTotalLen < bypassChars;
}

export type RevealPacingOptions = {
  targetCps: number;
  maxLagLive: number;
  maxLagAfterDone: number;
  catchUpDamping: number;
  maxBudgetPerFrameLive: number;
  maxBudgetPerFrameAfterDone: number;
};

const DEFAULT_OPTS: RevealPacingOptions = { ...REVEAL_PACING_DEFAULTS };

/**
 * Paced reveal: how many code units to show this frame, given elapsed time and (dampened) catch-up.
 * Pure: easy to test.
 */
export function computeRevealNewLength(
  input: {
    receivedLen: number;
    displayedLen: number;
    receivedEnded: boolean;
    lastTs: number;
  },
  nowTs: number,
  opts: RevealPacingOptions = DEFAULT_OPTS,
): { newDisplayedLen: number; lastTs: number } {
  const elapsedMs = Math.max(0, nowTs - input.lastTs);
  const receivedLen = input.receivedLen;
  const displayedLen = input.displayedLen;
  const lagChars = receivedLen - displayedLen;
  if (lagChars <= 0) {
    return { newDisplayedLen: displayedLen, lastTs: nowTs };
  }
  const maxFrame = input.receivedEnded ? opts.maxBudgetPerFrameAfterDone : opts.maxBudgetPerFrameLive;
  const maxLagMs = input.receivedEnded ? opts.maxLagAfterDone : opts.maxLagLive;
  const lagMs = (lagChars * 1000) / opts.targetCps;
  const natural = Math.round((opts.targetCps * elapsedMs) / 1000);
  const rawCatchUp =
    lagMs > maxLagMs ? Math.ceil(((lagMs - maxLagMs) * opts.targetCps) / 1000) : 0;
  const catchUp = Math.floor(rawCatchUp * opts.catchUpDamping);
  const rawBudget = Math.max(1, natural + catchUp);
  const step = Math.min(lagChars, rawBudget, maxFrame);
  const newLen = Math.min(receivedLen, displayedLen + step);
  return { newDisplayedLen: newLen, lastTs: nowTs };
}
