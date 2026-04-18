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
  const maxRadiusFraction = layout?.maxRadiusFraction ?? 0.85;
  const radiusScale = layout?.orbitRadiusScale ?? 1.0;
  
  // We want to simulate an organic cluster.
  // Instead of a rigid circle, we'll use a deterministic force-directed approach.
  
  // Initialize positions with a tight phyllotaxis spiral to give the simulation a good starting point.
  const nodes: { x: number; y: number; r: number }[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  
  // Estimate collision radius based on new perfect circle bubble sizes (approx 100-135px width)
  const collisionRadius = Math.max(55, Math.min(75, m * 0.15));
  
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(i + 0.5) * collisionRadius * 0.8;
    const theta = i * goldenAngle + phaseShift;
    nodes.push({
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      r: collisionRadius,
    });
  }

  // Deterministic iterative relaxation (Force-directed layout)
  // We apply collision repulsion, and a gentle gravity towards the center.
  const iterations = 80;
  const gravity = 0.05;
  const damping = 0.8;

  for (let step = 0; step < iterations; step++) {
    for (let i = 0; i < count; i++) {
      let fx = 0;
      let fy = 0;
      
      // Gravity pulls toward center
      fx -= nodes[i]!.x * gravity;
      fy -= nodes[i]!.y * gravity;

      // Repulsion between nodes
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        const dx = nodes[i]!.x - nodes[j]!.x;
        const dy = nodes[i]!.y - nodes[j]!.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        
        // Prevent division by zero
        if (dist === 0) {
          dist = 0.1;
        }

        const minDist = nodes[i]!.r + nodes[j]!.r;
        
        if (dist < minDist) {
          // Strong repulsion if overlapping
          const force = (minDist - dist) / dist * 0.5;
          fx += dx * force;
          fy += dy * force;
        } else if (dist < minDist * 1.5) {
          // Soft repulsion to keep them comfortably spaced
          const force = (minDist * 1.5 - dist) / dist * 0.05;
          fx += dx * force;
          fy += dy * force;
        }
      }
      
      // Update position
      nodes[i]!.x += fx * damping;
      nodes[i]!.y += fy * damping;
    }
  }

  const poses: RadialScatterPose[] = [];

  for (let i = 0; i < count; i++) {
    // Apply layout scale and aspect ratio tweaks
    const aspectCorrectionX = w > h ? 1.05 : 1.0;
    const aspectCorrectionY = h > w ? 1.05 : 1.0;
    
    let x = nodes[i]!.x * radiusScale * aspectCorrectionX;
    let y = nodes[i]!.y * radiusScale * aspectCorrectionY + centerYOffsetPx;
    
    // Add a tiny deterministic jitter for purely visual organic feel
    x += (scatterUnit(i, 10) - 0.5) * 8;
    y += (scatterUnit(i, 11) - 0.5) * 8;

    const rotate = 0;

    // Spiral-ish entry from outside the cluster
    const angle = Math.atan2(y - centerYOffsetPx, x);
    const entryAngle = angle + Math.PI * 0.35 + (scatterUnit(i, 40) - 0.5) * 0.6;
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

/**
 * 5-bucket diameter ladder used by the bubble field.
 *
 * Semantic ordering (small → large):
 *   0 narrow  → 1 supporting → 2 major → 3 core → 4 hero
 *
 * The ladder is deliberately wide (ratio ≈ 2.3×) so a "hero" bubble like
 * Weddings reads as the visual anchor of the cluster while narrow sub-labels
 * ("Super 8", "Drone", "After party") feel like orbiting accents.
 *
 * Per-bubble jitter (see `bubbleRadiusJitterPx`) adds a ±6 px deterministic
 * offset so two bubbles in the same bucket don't feel like clones.
 */
export type BubbleSizeBucket = 0 | 1 | 2 | 3 | 4;

/**
 * Default sizing bucket when a per-item weight is unavailable — deterministic
 * by index so non-services clusters (travel, deliverables, …) still get a
 * small, stable amount of visual variance. Capped at bucket 3 so the "hero"
 * size is reserved exclusively for opted-in labels (e.g. Weddings).
 */
export function defaultBubbleSizeBucket(i: number): BubbleSizeBucket {
  return (i % 4) as BubbleSizeBucket;
}

/** Pixel radius for a given sizing bucket (desktop / compact). Matches width CSS. */
export function bubbleRadiusForBucket(bucket: BubbleSizeBucket, isDesktop: boolean): number {
  switch (bucket) {
    case 0: // narrow
      return isDesktop ? 84 / 2 : 76 / 2;
    case 1: // supporting
      return isDesktop ? 106 / 2 : 96 / 2;
    case 2: // major
      return isDesktop ? 124 / 2 : 112 / 2;
    case 3: // core
      return isDesktop ? 146 / 2 : 132 / 2;
    case 4: // hero
    default:
      return isDesktop ? 192 / 2 : 168 / 2;
  }
}

/**
 * Deterministic per-index radius jitter (±~6px). Combined with bucket sizing
 * this makes the cluster feel more organic without breaking the hierarchy.
 */
export function bubbleRadiusJitterPx(i: number): number {
  // scatterUnit → [0,1); remap to [-1,1) then scale.
  return (scatterUnit(i, 7) * 2 - 1) * 6;
}

/** Back-compat: radius by index using the default (deterministic) bucket. */
export function getBubbleRadius(i: number, isDesktop: boolean): number {
  return bubbleRadiusForBucket(defaultBubbleSizeBucket(i), isDesktop);
}

/** Tailwind width/height/padding classes for each sizing bucket. */
export function bubbleSizeClassForBucket(bucket: BubbleSizeBucket): string {
  switch (bucket) {
    case 0:
      return "w-[76px] h-[76px] sm:w-[84px] sm:h-[84px] p-2";
    case 1:
      return "w-[96px] h-[96px] sm:w-[106px] sm:h-[106px] p-2.5";
    case 2:
      return "w-[112px] h-[112px] sm:w-[124px] sm:h-[124px] p-3";
    case 3:
      return "w-[132px] h-[132px] sm:w-[146px] sm:h-[146px] p-4";
    case 4:
    default:
      return "w-[168px] h-[168px] sm:w-[192px] sm:h-[192px] p-5";
  }
}

/** Back-compat: sizing class by index using the default bucket. */
export function scatterPillPaddingClass(i: number): string {
  return bubbleSizeClassForBucket(defaultBubbleSizeBucket(i));
}
