/**
 * Deterministic radial layouts for scope onboarding bubbles.
 * Final poses sit on a **symmetrical orbit** (equal angles, shared radius, 12 o'clock start).
 * Entry poses stay organic so the existing spring entrance animation is unchanged.
 */

export type RadialScatterPose = {
  /** Final offset from donut center (px). */
  x: number;
  y: number;
  /** Final subtle tilt (deg). */
  rotate: number;
  /** Entry scatter (before spring settles). */
  entryX: number;
  entryY: number;
  entryRotate: number;
};

/** 0–1 deterministic pseudo-random from index + salt. */
export function scatterUnit(i: number, salt: number): number {
  const t = Math.sin(i * 12.9898 + salt * 78.233 + salt * 0.001) * 43758.5453123;
  return t - Math.floor(t);
}

export type SectorDonutLayoutOptions = {
  /** Multiplies the computed orbit radius (e.g. 1.12 to spread bubbles). Clamped to fit the field. */
  orbitRadiusScale?: number;
  /** Max share of half-span used as radius (default 0.92). Slightly higher uses more of the box. */
  maxRadiusFraction?: number;
};

/**
 * Perfect circular orbit for settled poses: angle `i` = `(i/count)·2π − π/2 + phaseShift`
 * (first bubble at 12 o'clock, equal spacing). Radius is chosen to fit the padded field.
 * `centerYOffsetPx` shifts the orbit center (e.g. room for a bottom slot).
 */
export function computeSectorDonutPoses(
  count: number,
  w: number,
  h: number,
  phaseShift = 0,
  centerYOffsetPx = 0,
  layout?: SectorDonutLayoutOptions,
): RadialScatterPose[] {
  if (count <= 0 || w < 40 || h < 40) {
    return [];
  }

  const m = Math.min(w, h);
  const sector = (2 * Math.PI) / count;

  const rMin = Math.max(m * 0.2, 88);
  const rMax = Math.min(m * 0.42, m * 0.48);
  const rMid = (rMin + rMax) / 2;

  /** Extra top inset so top bubbles aren’t clipped by overflow. */
  const padX = Math.max(36, m * 0.1);
  const padYTop = Math.max(48, m * 0.13);
  const padYBottom = Math.max(36, m * 0.1);

  const maxHalfX = w / 2 - padX;
  const maxHalfY = Math.min(h / 2 - padYTop, h / 2 - padYBottom);
  /** Keep the full circle inside the padded ellipse of the field. */
  const rMaxFit = Math.min(maxHalfX, maxHalfY);
  const maxFrac = layout?.maxRadiusFraction ?? 0.92;
  const rBase = Math.min(Math.max(rMin, rMid), rMax, rMaxFit * maxFrac);
  const scale = layout?.orbitRadiusScale ?? 1;
  const r = Math.min(rBase * scale, rMaxFit * maxFrac);

  const poses: RadialScatterPose[] = [];

  for (let i = 0; i < count; i++) {
    /** 12 o'clock start, equal arc between neighbors (radians). */
    const angle = (i / count) * (Math.PI * 2) - Math.PI / 2 + phaseShift;

    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r + centerYOffsetPx;

    /** Symmetrical ring — no per-bubble tilt when settled. */
    const rotate = 0;

    /** Spiral-ish entry from outside the ring (unchanged — preserves spring choreography). */
    const sectorMid = (i + 0.5) * sector + phaseShift;
    const entryAngle = sectorMid + Math.PI * 0.35 + (scatterUnit(i, 40) - 0.5) * 0.6;
    const entryDist = m * 0.38 + scatterUnit(i, 41) * m * 0.12;
    const entryX = Math.cos(entryAngle) * entryDist + (scatterUnit(i, 42) - 0.5) * 28;
    const entryY = Math.sin(entryAngle) * entryDist + (scatterUnit(i, 43) - 0.5) * 28 + centerYOffsetPx;
    const entryRotate = (scatterUnit(i, 66) - 0.5) * 10;

    poses.push({ x, y, rotate, entryX, entryY, entryRotate });
  }

  return poses;
}

/** @deprecated Use `computeSectorDonutPoses` — kept for any stale imports. */
export function computeDonutRadialPoses(count: number, w: number, h: number, phaseShift = 0): RadialScatterPose[] {
  return computeSectorDonutPoses(count, w, h, phaseShift, 0, undefined);
}

/** Slight padding variance so pills aren’t identical clones (Tailwind-friendly). */
export function scatterPillPaddingClass(i: number): string {
  const m = i % 4;
  if (m === 0) return "px-6 py-3.5";
  if (m === 1) return "px-7 py-4";
  if (m === 2) return "px-[1.65rem] py-[0.95rem]";
  return "px-[1.85rem] py-[1.05rem]";
}
