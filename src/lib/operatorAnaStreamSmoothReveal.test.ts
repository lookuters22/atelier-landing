import { describe, expect, it } from "vitest";
import {
  CATCH_UP_DAMPING,
  computeRevealNewLength,
  MAX_BUDGET_PER_FRAME_AFTER_DONE,
  MAX_BUDGET_PER_FRAME_LIVE,
  MAX_LAG_MS_AFTER_DONE,
  MAX_LAG_MS_LIVE,
  REVEAL_PACING_DEFAULTS,
  shouldBypassPacedDrain,
  SHORT_REPLY_BYPASS,
  TARGET_CPS,
} from "./operatorAnaStreamSmoothReveal.ts";

describe("computeRevealNewLength", () => {
  it("natural-rate path with low CPS: small first step, no catch-up for tiny backlog", () => {
    // 3 chars, lag time 3*1000/50=60 < MAX_LAG_MS_LIVE
    const r = computeRevealNewLength(
      { receivedLen: 3, displayedLen: 0, receivedEnded: false, lastTs: 0 },
      20,
    );
    const natural = Math.round((TARGET_CPS * 20) / 1000);
    expect(natural).toBe(1);
    expect(r.newDisplayedLen).toBe(1);
    expect(r.newDisplayedLen - 0).toBeLessThanOrEqual(MAX_BUDGET_PER_FRAME_LIVE);
  });

  it("live: never advances by more than MAX_BUDGET_PER_FRAME_LIVE in one call", () => {
    for (const backlog of [1, 5, 100, 5000]) {
      const r = computeRevealNewLength(
        { receivedLen: backlog, displayedLen: 0, receivedEnded: false, lastTs: 0 },
        32,
      );
      const step = r.newDisplayedLen;
      expect(step).toBeLessThanOrEqual(MAX_BUDGET_PER_FRAME_LIVE);
    }
  });

  it("post-done: never advances by more than MAX_BUDGET_PER_FRAME_AFTER_DONE in one call", () => {
    for (const backlog of [1, 20, 400, 5000]) {
      const r = computeRevealNewLength(
        { receivedLen: backlog, displayedLen: 0, receivedEnded: true, lastTs: 0 },
        32,
      );
      expect(r.newDisplayedLen).toBeLessThanOrEqual(MAX_BUDGET_PER_FRAME_AFTER_DONE);
    }
  });

  it("large backlog: live path drains in many small steps, not a jump (simulated steps)", () => {
    const total = 200;
    let displayed = 0;
    const dt = 16;
    for (let i = 0; i < 200; i++) {
      if (displayed >= total) break;
      const t0 = i * dt;
      const t1 = t0 + dt;
      const { newDisplayedLen } = computeRevealNewLength(
        { receivedLen: total, displayedLen: displayed, receivedEnded: false, lastTs: t0 },
        t1,
      );
      const step = newDisplayedLen - displayed;
      expect(step).toBeLessThanOrEqual(MAX_BUDGET_PER_FRAME_LIVE);
      expect(step).toBeGreaterThan(0);
      displayed = newDisplayedLen;
    }
    // With cap 2, 200 chars needs at least 100 frames; we took less than 200 iterations
    expect(displayed).toBe(total);
  });

  it("post-done can step slightly larger than live for same frame duration (capped 4 vs 2)", () => {
    const stepLive = computeRevealNewLength(
      { receivedLen: 500, displayedLen: 0, receivedEnded: false, lastTs: 0 },
      20,
    ).newDisplayedLen;
    const stepDone = computeRevealNewLength(
      { receivedLen: 500, displayedLen: 0, receivedEnded: true, lastTs: 0 },
      20,
    ).newDisplayedLen;
    expect(stepLive).toBeLessThanOrEqual(2);
    expect(stepDone).toBeLessThanOrEqual(4);
    // First frame, both want progress; after-done is allowed a bit more than live (same backlog)
    expect(stepDone).toBeGreaterThanOrEqual(Math.min(1, stepLive));
  });

  it("damping + lag thresholds use constants", () => {
    expect(CATCH_UP_DAMPING).toBe(0.15);
    expect(MAX_LAG_MS_LIVE).toBe(2500);
    expect(MAX_LAG_MS_AFTER_DONE).toBe(1500);
  });
});

describe("shouldBypassPacedDrain", () => {
  it("bypasses when under SHORT_REPLY_BYPASS", () => {
    expect(shouldBypassPacedDrain(0)).toBe(true);
    expect(shouldBypassPacedDrain(SHORT_REPLY_BYPASS - 1)).toBe(true);
    expect(shouldBypassPacedDrain(SHORT_REPLY_BYPASS)).toBe(false);
  });
});

describe("REVEAL_PACING_DEFAULTS", () => {
  it("exports split caps and target CPS 50", () => {
    expect(REVEAL_PACING_DEFAULTS.targetCps).toBe(50);
    expect(REVEAL_PACING_DEFAULTS.maxBudgetPerFrameLive).toBe(2);
    expect(REVEAL_PACING_DEFAULTS.maxBudgetPerFrameAfterDone).toBe(4);
  });
});
