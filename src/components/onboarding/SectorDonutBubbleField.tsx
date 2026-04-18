import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup, motion, useAnimationFrame } from "framer-motion";
import {
  type BubbleSizeBucket,
  type SectorDonutLayoutOptions,
  bubbleRadiusForBucket,
  bubbleRadiusJitterPx,
  bubbleSizeClassForBucket,
  defaultBubbleSizeBucket,
  scatterUnit,
} from "@/lib/onboardingScopeRadialScatter.ts";
import { cn } from "@/lib/utils";

/**
 * Apple-Music-style bubble field (à la `react-native-bubble-select`):
 *  - rigid circular bodies, no squish/distortion
 *  - draggable (pointer down + move = grab and shove neighbors)
 *  - tap = select; selected bubbles grow physically and push others out
 *  - tight center gravity keeps the cluster packed
 *  - circles stay circles ALWAYS — enforced via inline borderRadius:50%
 *    to bypass the global `corner-shape: superellipse(1.5)` rule.
 */
export const scopeSectorGlassPillBase =
  "flex flex-col items-center justify-center text-center text-balance aspect-square border border-white/20 bg-white/10 text-[14px] sm:text-[15px] font-medium leading-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px] transition-[background,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 select-none touch-none cursor-grab active:cursor-grabbing";

export const scopeSectorGlassPillOn =
  "border-[#9ca893]/90 bg-[#9ca893]/22 shadow-[0_0_24px_rgba(156,168,147,0.38),inset_0_1px_0_rgba(255,255,255,0.1)]";

export type SectorDonutBubbleFieldProps<T extends string> = {
  itemIds: readonly T[];
  getLabel: (id: T) => ReactNode;
  isSelected: (id: T) => boolean;
  onActivate: (id: T) => void;
  size: { w: number; h: number };
  phaseShift: number;
  centerYOffsetPx?: number;
  layoutGroupId: string;
  roleRadio?: boolean;
  pillClassName?: string;
  staggerBaseMs?: number;
  staggerStepMs?: number;
  bubbleMarginClassName?: string;
  orbitLayout?: SectorDonutLayoutOptions;
  renderItemSlot?: (id: T, index: number) => ReactNode | null | undefined;
  /**
   * Optional per-bubble size bucket. When omitted, falls back to a deterministic
   * index-based bucket so the field still feels intentionally varied.
   * Used to make higher-weight bubbles (core categories) visibly larger than
   * narrower sub-labels.
   */
  getSizeBucket?: (id: T, index: number) => BubbleSizeBucket;
  /**
   * Optional predicate — true means "this bubble is the cluster anchor".
   * Anchored bubbles spawn at (0, centerY) and feel a much stronger pull
   * back to center, so they read as the visual pivot of the field while
   * everything else orbits around them.
   */
  getIsCenterAnchored?: (id: T, index: number) => boolean;
  /**
   * Optional per-bubble tint. When returned, the bubble renders with a
   * muted colored edge, a faint tinted inner wash, and (when selected) a
   * soft outer glow in the same hue. Returning two tints produces a
   * diagonal gradient border — used to signal a "shared" capability that
   * lives under multiple currently-selected parents.
   */
  getBubbleTint?: (
    id: T,
    index: number,
  ) => { primary: string; secondary?: string } | null | undefined;
};

type PhysicsNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * Smoothed display position (what actually gets written to the DOM).
   *
   * Physics integrates on `(x, y)`; the rendered position exponentially
   * chases it every frame (`disp += (x - disp) * SMOOTH`). In a dense
   * cluster every bubble is simultaneously tugged toward the center by
   * gravity and shoved outward by collision — those forces nearly cancel
   * but the tiny per-frame residual (~0.3–1 px) shows up as a visible
   * shimmer. Low-pass filtering the output kills it without compromising
   * the physics itself. During drag we snap `disp` to `(x, y)` so the
   * grabbed bubble tracks the pointer 1:1 with zero lag.
   */
  dispX: number;
  dispY: number;
  /** Current (animated) radius. Lerps toward `targetR`. */
  r: number;
  /**
   * Smoothed display radius — same trick as `dispX/dispY`, keeps scale
   * changes (selection growth) visually glassy instead of stepping.
   */
  dispR: number;
  /** Selection-aware desired radius. */
  targetR: number;
  /** Resting base radius (used for visual scale = r/baseR). */
  baseR: number;
  mass: number;
  /** When grabbed, physics treats the body as kinematic (infinite mass). */
  isDragging: boolean;
  /**
   * Anchored bubbles live at the cluster center — strong spring-back and a
   * much heavier effective mass in collisions so neighbors are pushed out,
   * not the other way round.
   */
  isAnchor: boolean;
};

type DragState = {
  idx: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startNodeX: number;
  startNodeY: number;
  lastClientX: number;
  lastClientY: number;
  lastTime: number;
  /** Peak pointer travel (px) — used to distinguish tap from drag. */
  moved: number;
};

const TAP_THRESHOLD_PX = 6;

/**
 * Run a pass of pairwise positional collision resolution.
 *
 * Shared between the per-frame physics loop and the synchronous init pass
 * that runs right before the first paint — so whenever a new anchor or
 * sibling is introduced, overlapping bubbles have already been separated
 * by the time the browser shows them. No frame-0 flash of stacked pills.
 *
 * Anchors and drag-kinematic bubbles are treated as immovable. Two
 * immovable non-drag bubbles still get a symmetric split (defensive —
 * anchors should never visibly overlap each other).
 */
function resolveCollisions(
  nodes: PhysicsNode[],
  iterations: number,
  slop = 0.35,
  /**
   * Baumgarte-style correction factor. Each iteration pushes overlapping
   * pairs apart by `baumgarte × overlap` rather than the full overlap —
   * this turns the collision constraint into a "soft" spring that settles
   * into non-overlap over ~3 iterations instead of snapping in one. The
   * snap version fought gravity every frame (correct → gravity pulls back
   * → correct again → …) and that back-and-forth is exactly the shimmer
   * the user was seeing in dense clusters. 0.82 = imperceptibly slower
   * separation but no more limit-cycle jitter.
   */
  baumgarte = 0.82,
): void {
  for (let pass = 0; pass < iterations; pass++) {
    let anyOverlap = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.r + b.r;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(distSq) || 0.0001;
        const rawOverlap = minDist - dist - slop;
        if (rawOverlap <= 0) continue;
        anyOverlap = true;

        const correction = rawOverlap * baumgarte;

        const nx = dx / dist;
        const ny = dy / dist;

        const aImmovable = a.isDragging || a.isAnchor;
        const bImmovable = b.isDragging || b.isAnchor;
        if (aImmovable && bImmovable) {
          if (a.isDragging || b.isDragging) continue;
          a.x -= nx * correction * 0.5;
          a.y -= ny * correction * 0.5;
          b.x += nx * correction * 0.5;
          b.y += ny * correction * 0.5;
          continue;
        }

        if (aImmovable) {
          b.x += nx * correction;
          b.y += ny * correction;
          if (a.isDragging) {
            b.vx += nx * correction * 0.3;
            b.vy += ny * correction * 0.3;
          }
        } else if (bImmovable) {
          a.x -= nx * correction;
          a.y -= ny * correction;
          if (b.isDragging) {
            a.vx -= nx * correction * 0.3;
            a.vy -= ny * correction * 0.3;
          }
        } else {
          const totalMass = a.mass + b.mass;
          const aShare = b.mass / totalMass;
          const bShare = a.mass / totalMass;
          a.x -= nx * correction * aShare;
          a.y -= ny * correction * aShare;
          b.x += nx * correction * bShare;
          b.y += ny * correction * bShare;
        }
      }
    }
    if (!anyOverlap) break;
  }
}

/**
 * Compose the inline style that tints a bubble.
 *
 * Uses the classic `padding-box` + `border-box` layered-gradient trick so
 * the transparent 1px border can carry either a solid hue (single tint) or
 * a 135° gradient between two hues (shared-capability tint) without losing
 * the inner backdrop blur / dark-glass feel.
 *
 * The selected state intensifies edge alpha, deepens the inner wash, and
 * adds a soft outer glow — same palette, just louder.
 */
function tintedBubbleStyle(
  tint: { primary: string; secondary?: string },
  selected: boolean,
): CSSProperties {
  const { primary, secondary } = tint;
  const edgeAlpha = selected ? 0.88 : 0.5;
  const washAlpha = selected ? 0.22 : 0.08;

  const edgeGradient = secondary
    ? `linear-gradient(135deg, rgba(${primary}, ${edgeAlpha}), rgba(${secondary}, ${edgeAlpha}))`
    : `linear-gradient(rgba(${primary}, ${edgeAlpha}), rgba(${primary}, ${edgeAlpha}))`;

  const washGradient =
    secondary && selected
      ? `linear-gradient(135deg, rgba(${primary}, ${washAlpha}), rgba(${secondary}, ${washAlpha}))`
      : `linear-gradient(rgba(${primary}, ${washAlpha}), rgba(${primary}, ${washAlpha}))`;

  const shadows: string[] = ["inset 0 1px 0 rgba(255,255,255,0.07)"];
  if (selected) {
    shadows.unshift(`0 0 22px rgba(${primary}, 0.34)`);
    if (secondary) shadows.unshift(`0 0 18px rgba(${secondary}, 0.22)`);
  }

  return {
    border: "1px solid transparent",
    background: `${washGradient} padding-box, ${edgeGradient} border-box`,
    boxShadow: shadows.join(", "),
  };
}

export function SectorDonutBubbleField<T extends string>({
  itemIds,
  getLabel,
  isSelected,
  onActivate,
  size,
  centerYOffsetPx = 0,
  layoutGroupId,
  roleRadio = false,
  pillClassName,
  bubbleMarginClassName,
  renderItemSlot,
  getSizeBucket,
  getIsCenterAnchored,
  getBubbleTint,
}: SectorDonutBubbleFieldProps<T>) {
  const count = itemIds.length;
  const pill = pillClassName ?? scopeSectorGlassPillBase;

  const sizeBucketFor = (id: T, i: number): BubbleSizeBucket =>
    getSizeBucket ? getSizeBucket(id, i) : defaultBubbleSizeBucket(i);

  const isAnchorFor = (id: T, i: number): boolean =>
    getIsCenterAnchored ? getIsCenterAnchored(id, i) : false;

  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nodesRef = useRef<PhysicsNode[]>([]);
  const selectedRef = useRef<boolean[]>([]);
  const dragRef = useRef<DragState | null>(null);
  /** Suppresses the synthetic click that follows a real drag. */
  const justDraggedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  // Track the breakpoint in state so *both* the physics init and the render
  // pass agree on bubble sizes. Previously the physics used an `isDesktop`
  // check while the visual CSS came from Tailwind classes — with per-bubble
  // radius jitter added on top, the physics circle could end up smaller than
  // the painted circle, which is exactly what produced the overlap you saw.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 640,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsDesktop(window.innerWidth >= 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /**
   * Authoritative per-bubble base radius (collision radius).
   * Painted bubble radius = physicsBaseR − VISUAL_PAD_PX, so two resting
   * neighbours always have a visible gap of 2 × VISUAL_PAD_PX between them.
   */
  const VISUAL_PAD_PX = 5;
  /** Raw (pre-density-scale) core radius for a bubble — bucket + jitter only. */
  const rawCoreRadius = (id: T, i: number): number => {
    const bucket = sizeBucketFor(id, i);
    const isAnchor = isAnchorFor(id, i);
    const jitter = isAnchor ? 0 : bubbleRadiusJitterPx(i);
    return bubbleRadiusForBucket(bucket, isDesktop) + jitter;
  };

  /**
   * Collective density scale for the whole cluster.
   *
   * As the user drills deeper into the taxonomy (photo+video → categories
   * → subcategories + shared capabilities), the bubble count can easily
   * reach 30+. At their full bucket sizes the cluster would spill past
   * the container and cover the page title / nav row — exactly the bug
   * the user hit.
   *
   * So we compute the total circular area of every bubble at its raw
   * bucket size, compare against the container area, and if the bubbles
   * would exceed a target fill fraction we uniformly shrink every `baseR`
   * by a single scale factor. One knob, proportional, perfectly stable
   * (same inputs give the same scale every render), and it animates
   * smoothly because `n.r` lerps toward the new `targetR` via the
   * existing radius animation.
   *
   *   target fill    : 0.50 of container (leaves breathing room + settles
   *                    nicely in the anisotropic ellipse gravity forms)
   *   headroom       : 1.15× for selection-growth worst case (selected
   *                    bubbles grow to 1.18× → area × 1.39)
   *   floor          : 0.45 so bubbles never become un-tappable no matter
   *                    how many are revealed
   */
  const densityScale = useMemo(() => {
    if (size.w <= 0 || size.h <= 0 || count === 0) return 1;
    let totalRawArea = 0;
    for (let i = 0; i < count; i++) {
      const id = itemIds[i]!;
      const r = rawCoreRadius(id, i);
      totalRawArea += Math.PI * r * r;
    }
    const selectionHeadroom = 1.15;
    // Allow bubbles to fill a larger fraction of the container before we
    // start compressing — up from 0.50 → 0.58. The hard container walls
    // will still catch anything that spills past the rect.
    const target = 0.58;
    const budget = totalRawArea * selectionHeadroom;
    const allowed = size.w * size.h * target;
    if (budget <= allowed) return 1;
    const s = Math.sqrt(allowed / budget);
    // Higher readability floor (0.58). Below this the labels just stop
    // being legible no matter how clever the typography is — we'd rather
    // pack slightly tighter at the walls than have the cluster dissolve
    // into a field of unreadable dots. The density floor lines up with
    // the target fill so ~30 bubbles sit at the floor without visible
    // collision pressure at the walls.
    return Math.max(0.58, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, size.w, size.h, isDesktop, itemIds, getSizeBucket, getIsCenterAnchored]);

  /**
   * Final per-bubble base (collision) radius after density scaling.
   *
   * Note: `VISUAL_PAD_PX` is applied *outside* the scale factor so the
   * breathing gap between neighbours stays a fixed 2 × VISUAL_PAD_PX in
   * pixels regardless of density. Scaling the pad too would make dense
   * clusters look claustrophobically tight; this way they just look
   * smaller but keep the same glassy rhythm.
   */
  const computeBaseR = (id: T, i: number): number => {
    return rawCoreRadius(id, i) * densityScale + VISUAL_PAD_PX;
  };

  /**
   * Active-frames gate — the cluster only runs physics for a short window
   * after something happens (initial spawn, drag, selection change). When
   * the counter hits zero, physics is skipped entirely: velocities are zero,
   * gravity doesn't tug, collisions don't fire, nothing trades sub-pixel
   * nudges with anything else → zero jitter, pixel-perfect rest.
   */
  const activeFramesRef = useRef(0);
  /** Bump the physics window (in frames). Called from drag/selection/init. */
  const bumpActive = (frames = 90) => {
    if (activeFramesRef.current < frames) activeFramesRef.current = frames;
  };

  // Stable selection key — only re-run the sync effect when selection actually changes.
  const selectionKey = itemIds.map((id) => (isSelected(id) ? "1" : "0")).join("");

  useEffect(() => {
    selectedRef.current = itemIds.map((id) => isSelected(id));
    // Push target radius changes into existing nodes immediately so selected
    // bubbles grow and shove their neighbors.
    const nodes = nodesRef.current;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      n.targetR = selectedRef.current[i] ? n.baseR * 1.18 : n.baseR;
    }
    // Selection changed → give physics a short settle window so neighbors
    // can ease out of the way of the grown bubble before we freeze again.
    bumpActive(60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  // (Re)initialize physics state whenever the item count or layout changes.
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    const m = Math.min(size.w, size.h) || 400;

    const next: PhysicsNode[] = [];
    for (let i = 0; i < count; i++) {
      const id = itemIds[i]!;
      const isAnchor = isAnchorFor(id, i);
      // Authoritative base radius (includes jitter) — shared with the render
      // pass via `computeBaseR` so physics and visuals can't drift apart.
      const baseR = computeBaseR(id, i);
      const selected = selectedRef.current[i] ?? false;
      const targetR = selected ? baseR * 1.18 : baseR;
      // Anchors get a 3× mass multiplier on top of r² so neighbors barely
      // shove them even before central gravity kicks in.
      const anchorMassBoost = isAnchor ? 3 : 1;
      const prev = nodesRef.current[i];
      if (prev) {
        prev.baseR = baseR;
        prev.targetR = targetR;
        prev.isAnchor = isAnchor;
        prev.mass = prev.r * prev.r * anchorMassBoost;
        // Keep the existing `disp*` values on reuse — they're already the
        // last-smoothed rendered position, so the bubble visibly stays
        // exactly where it was while physics does whatever it needs behind
        // the scenes.
        next.push(prev);
      } else if (isAnchor) {
        // Anchors spawn at the cluster center so the hero bubble reads as the
        // pivot point of the field from the first frame.
        next.push({
          x: 0,
          y: centerYOffsetPx,
          dispX: 0,
          dispY: centerYOffsetPx,
          vx: 0,
          vy: 0,
          r: baseR,
          dispR: baseR,
          targetR,
          baseR,
          mass: baseR * baseR * anchorMassBoost,
          isDragging: false,
          isAnchor: true,
        });
      } else {
        // Spawn newly-introduced bubbles **outside the extent of every
        // already-placed bubble** (anchors included). Previously they
        // spawned near the center, which parked them inside the anchor's
        // collision radius — the next physics frame then pushed the anchor
        // off its pivot so the cluster visibly "kicked" on every reveal.
        //
        // `maxExistingReach` = the furthest (dist-from-center + radius)
        // over everything we've placed so far. Spawning at `reach + self.r
        // + gap` guarantees zero initial overlap with any existing bubble
        // while keeping the new arrival close enough for gravity to pull
        // it into the cluster within ~1–1.5 s.
        let maxExistingReach = 0;
        for (let k = 0; k < next.length; k++) {
          const nk = next[k]!;
          const reach = Math.hypot(nk.x, nk.y - centerYOffsetPx) + nk.r;
          if (reach > maxExistingReach) maxExistingReach = reach;
        }
        const SPAWN_GAP = 14;
        const minDist = maxExistingReach + baseR + SPAWN_GAP;
        const jitterBand = Math.max(16, m * 0.06);
        const dist = minDist + scatterUnit(i, 41) * jitterBand;
        const angle = scatterUnit(i, 40) * Math.PI * 2;
        const spawnX = Math.cos(angle) * dist;
        const spawnY = Math.sin(angle) * dist + centerYOffsetPx;
        next.push({
          x: spawnX,
          y: spawnY,
          dispX: spawnX,
          dispY: spawnY,
          vx: 0,
          vy: 0,
          r: baseR,
          dispR: baseR,
          targetR,
          baseR,
          mass: baseR * baseR,
          isDragging: false,
          isAnchor: false,
        });
      }
    }
    // Pre-resolve collisions synchronously so no two bubbles overlap on
    // the first paint. Without this, adding a new anchor (Weddings) while
    // Photo/Video were already sitting near the center would briefly
    // render them stacked before the animation-frame physics loop could
    // push them apart.
    resolveCollisions(next, 12);

    nodesRef.current = next;

    // Write DOM transforms immediately for every existing ref so the
    // browser's first paint after this commit reflects the post-resolve
    // positions. We use `disp*` (not `x/y`) — for freshly-spawned bubbles
    // they're identical, but for *reused* bubbles that resolveCollisions
    // just nudged (e.g., Photo getting pushed outward by an incoming
    // Weddings anchor) `disp*` still holds the last visible position.
    // The per-frame smoothing below then glides them to their new resting
    // spot over ~5 frames instead of snapping in one.
    for (let i = 0; i < count; i++) {
      const el = bubbleRefs.current[i];
      if (!el) continue;
      const n = next[i]!;
      const s = n.dispR / n.baseR;
      el.style.transform =
        `translate3d(calc(-50% + ${n.dispX.toFixed(2)}px), calc(-50% + ${n.dispY.toFixed(2)}px), 0) ` +
        `scale(${s.toFixed(4)})`;
    }

    setIsReady(true);
    // Newly-revealed bubbles now spawn beyond the existing cluster extent
    // and ride gravity inward, so give them a 4 s settle window before the
    // cluster freezes — enough for the slower (0.95 s) scale-in entrance
    // plus ~1.5 s of anisotropic gravity pull to pack everything snugly.
    bumpActive(240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, size.w, size.h, centerYOffsetPx, isDesktop, densityScale]);

  useAnimationFrame((_time, delta) => {
    const nodes = nodesRef.current;
    if (nodes.length !== count || !isReady) return;

    const dt = Math.min(delta / 16.66, 2.0);

    // Is anything actually happening? We only run physics when:
    //   • a bubble is being dragged, OR
    //   • a bubble's radius is still lerping toward its selection target, OR
    //   • the active-frames window (bumped on init/drag/selection) is open, OR
    //   • the display-smoothed position hasn't caught up to physics yet.
    // Otherwise we skip the whole loop — no gravity, no collision, no DOM
    // rewrite. Zero work ⇒ zero jitter at rest.
    let anyRadiusAnimating = false;
    for (let i = 0; i < count; i++) {
      const n = nodes[i]!;
      if (Math.abs(n.r - n.targetR) > 0.05) {
        anyRadiusAnimating = true;
        break;
      }
    }
    let anyDragging = false;
    for (let i = 0; i < count; i++) {
      if (nodes[i]!.isDragging) {
        anyDragging = true;
        break;
      }
    }
    let anyDisplaySettling = false;
    for (let i = 0; i < count; i++) {
      const n = nodes[i]!;
      if (
        Math.abs(n.dispX - n.x) > 0.05 ||
        Math.abs(n.dispY - n.y) > 0.05 ||
        Math.abs(n.dispR - n.r) > 0.05
      ) {
        anyDisplaySettling = true;
        break;
      }
    }
    const shouldStep =
      anyDragging ||
      anyRadiusAnimating ||
      anyDisplaySettling ||
      activeFramesRef.current > 0;
    if (!shouldStep) return;
    if (activeFramesRef.current > 0) activeFramesRef.current -= 1;

    // --- 1. Lerp radius toward selection target (smooth growth) ---
    for (let i = 0; i < count; i++) {
      const n = nodes[i]!;
      const rPrev = n.r;
      n.r += (n.targetR - n.r) * Math.min(1, 0.18 * dt);
      if (Math.abs(n.r - n.targetR) < 0.05) n.r = n.targetR;
      if (n.r !== rPrev) n.mass = n.r * n.r;
    }

    // --- 2. Integrate velocity, damp, sleep aggressively ---
    // Heavier damping (0.55 per frame) + a higher sleep threshold means
    // post-drag fling velocity decays in ~4 frames and then disappears,
    // rather than leaving residual sub-pixel motion that feeds back into
    // gravity and keeps the cluster twitching.
    const damping = Math.pow(0.55, dt);
    const velSleep = 0.18;
    for (let i = 0; i < count; i++) {
      const n = nodes[i]!;
      if (n.isDragging) continue;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.vx *= damping;
      n.vy *= damping;
      if (Math.abs(n.vx) < velSleep) n.vx = 0;
      if (Math.abs(n.vy) < velSleep) n.vy = 0;
    }

    // --- 3. Anisotropic positional gravity toward center ---
    // Gravity uses a **wider dead-zone** so bubbles sitting within a few
    // pixels of their resting spot feel no pull at all. This is the other
    // half of the jitter fix: in a tight pack, the old 4 px dead-zone
    // was too narrow — gravity still tugged every frame against collision
    // correction. 6 px kills the tug-of-war without visibly loosening the
    // cluster (the collision pads are 2×VISUAL_PAD_PX = 10 px apart
    // already, so nothing floats away).
    const pullX = 0.022;
    const pullY = 0.08;
    const anchorPull = 0.22;
    const deadZone = 6;
    for (let i = 0; i < count; i++) {
      const n = nodes[i]!;
      if (n.isDragging) continue;
      const dx = 0 - n.x;
      const dy = centerYOffsetPx - n.y;
      const distFromPivot = Math.hypot(dx, dy);
      if (distFromPivot < deadZone) continue;
      // Soft ramp: gravity ramps from 0 → full strength across the first
      // 6 px outside the dead-zone, so neighbours near rest feel a gentle
      // nudge instead of a full yank. Removes the last bit of micro-jolt
      // that was bleeding through when an outer ring bubble oscillated.
      const ramp = Math.min(1, (distFromPivot - deadZone) / 6);
      const kt = Math.min(1, dt) * ramp;
      if (n.isAnchor) {
        n.x += dx * anchorPull * kt;
        n.y += dy * anchorPull * kt;
      } else {
        n.x += dx * pullX * kt;
        n.y += dy * pullY * kt;
      }
    }

    // --- 3b. Hard container walls — no bubble may ever leave the shell ----
    // These clamps are *hard* (snap, not spring) so that no matter how
    // many bubbles the user reveals, they can never cover the page
    // heading or the Next/Previous nav row. Combined with the upstream
    // density scale this means the cluster auto-fits the container, and
    // if anything does slip through (transient collision chains, large
    // dt spike, etc.) the wall clamp catches it the same frame.
    //
    // Dragging skips the clamp so the user can still fling a bubble
    // anywhere they like — release snaps it back inside via a short
    // inward impulse on the next non-drag frame.
    if (size.w > 0 && size.h > 0) {
      const halfW = size.w / 2;
      const halfH = size.h / 2;
      const pad = 4;
      for (let i = 0; i < count; i++) {
        const n = nodes[i]!;
        if (n.isDragging) continue;
        const leftLimit = -halfW + n.r + pad;
        const rightLimit = halfW - n.r - pad;
        const topLimit = -halfH + n.r + pad + centerYOffsetPx;
        const bottomLimit = halfH - n.r - pad + centerYOffsetPx;
        if (n.x < leftLimit) {
          n.x = leftLimit;
          if (n.vx < 0) n.vx = 0;
        } else if (n.x > rightLimit) {
          n.x = rightLimit;
          if (n.vx > 0) n.vx = 0;
        }
        if (n.y < topLimit) {
          n.y = topLimit;
          if (n.vy < 0) n.vy = 0;
        } else if (n.y > bottomLimit) {
          n.y = bottomLimit;
          if (n.vy > 0) n.vy = 0;
        }
      }
    }

    // --- 4. Pairwise positional collision resolution (non-penetrating) ---
    resolveCollisions(nodes, 6);

    // --- 5. Low-pass the rendered position toward physics position -------
    // Every frame the display position exponentially chases the real
    // physics position. This is what actually kills the "shakiness with
    // a lot of bubbles" — in a tight pack, gravity + collision leave a
    // residual ±0.5 px oscillation in `(x, y)` that a human eye perceives
    // as shimmer. Filtering it at the render stage (not the physics
    // stage) means the simulation itself stays physically correct while
    // the *visible* motion is glassy-smooth.
    //
    // Smoothing factor is framerate-independent so a 30 fps or 120 fps
    // device sees the same perceived lag (~80 ms). A dragged bubble
    // snaps display = physics so the pointer tracks 1:1.
    const SMOOTH_TAU_FRAMES = 5; // ~83 ms @ 60 fps to catch 63% of delta
    const smoothAlpha = 1 - Math.exp(-dt / SMOOTH_TAU_FRAMES);
    for (let i = 0; i < count; i++) {
      const n = nodes[i]!;
      if (n.isDragging) {
        n.dispX = n.x;
        n.dispY = n.y;
        n.dispR = n.r;
      } else {
        n.dispX += (n.x - n.dispX) * smoothAlpha;
        n.dispY += (n.y - n.dispY) * smoothAlpha;
        n.dispR += (n.r - n.dispR) * smoothAlpha;
        // Snap to exact target when within a sub-pixel so we don't keep
        // the simulation spinning forever chasing a 0.01 px delta.
        if (Math.abs(n.dispX - n.x) < 0.03) n.dispX = n.x;
        if (Math.abs(n.dispY - n.y) < 0.03) n.dispY = n.y;
        if (Math.abs(n.dispR - n.r) < 0.03) n.dispR = n.r;
      }
    }

    // --- 6. Write DOM transforms (uniform scale, perfect circles, no rotation) ---
    for (let i = 0; i < count; i++) {
      const n = nodes[i]!;
      const el = bubbleRefs.current[i];
      if (!el) continue;
      const s = n.dispR / n.baseR;
      el.style.transform =
        `translate3d(calc(-50% + ${n.dispX.toFixed(2)}px), calc(-50% + ${n.dispY.toFixed(2)}px), 0) ` +
        `scale(${s.toFixed(4)})`;
    }
  });

  // --- Pointer handlers: drag + tap distinction ---
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, i: number) => {
    if (e.button !== undefined && e.button !== 0) return;
    // If the pointer started on a real interactive child (e.g. a Remove button
    // inside a custom bubble), do NOT start dragging. Pointer capture would
    // otherwise redirect the follow-up click to this wrapper and swallow it.
    const target = e.target as Element | null;
    if (target && target !== e.currentTarget && target.closest("button, [data-no-drag]")) {
      return;
    }
    const node = nodesRef.current[i];
    if (!node) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    node.isDragging = true;
    node.vx = 0;
    node.vy = 0;
    // Drag begins → wake physics so neighbours can make room.
    bumpActive(90);
    dragRef.current = {
      idx: i,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      lastTime: performance.now(),
      moved: 0,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const node = nodesRef.current[d.idx];
    if (!node) return;

    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    d.moved = Math.max(d.moved, Math.hypot(dx, dy));

    node.x = d.startNodeX + dx;
    node.y = d.startNodeY + dy;

    // Imparted velocity for a natural fling on release.
    const now = performance.now();
    const dtMs = Math.max(1, now - d.lastTime);
    node.vx = ((e.clientX - d.lastClientX) * 16) / dtMs;
    node.vy = ((e.clientY - d.lastClientY) * 16) / dtMs;

    d.lastClientX = e.clientX;
    d.lastClientY = e.clientY;
    d.lastTime = now;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const node = nodesRef.current[d.idx];
    if (node) node.isDragging = false;

    if (d.moved > TAP_THRESHOLD_PX) {
      // Real drag: swallow the synthetic click that follows.
      justDraggedRef.current = true;
      queueMicrotask(() => {
        justDraggedRef.current = false;
      });
    }
    dragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    // Release → give the cluster a window to settle back, then freeze.
    bumpActive(90);
  };

  const handleClick = (id: T) => {
    if (justDraggedRef.current) return;
    onActivate(id);
  };

  return (
    <LayoutGroup id={layoutGroupId}>
      {itemIds.map((id, i) => {
        const on = isSelected(id);
        const slot = renderItemSlot?.(id, i);
        const tint = getBubbleTint?.(id, i) ?? null;
        // Visual diameter = collision diameter minus 2× VISUAL_PAD_PX so the
        // painted circle is guaranteed to sit *inside* the physics circle.
        // This keeps a small breathing gap between neighbours even when the
        // deterministic jitter shrinks the bubble below its bucket default.
        const baseR = computeBaseR(id, i);
        const visualDiameter = Math.max(24, 2 * (baseR - VISUAL_PAD_PX));
        // Scale typography with density but with a gentler curve and a
        // higher floor — the previous linear curve dropped to 10.5 px
        // immediately and that's right at the edge of readability. This
        // curve keeps type at ≥12 px until ~30 bubbles, and never goes
        // below 11.5 px (same pixel value the cluster's tightest label
        // like "Hospitality" needs to stay legible in the smallest
        // bucket).
        const labelFontPx = Math.max(
          11.5,
          Math.min(15, 10.5 + 5 * densityScale),
        );
        // 6 % horizontal padding (was 10 %) — the tighter the bubble gets
        // the more every pixel of usable text width matters. 6 % still
        // keeps labels off the border-glow edge but gives 2-word phrases
        // like "Rehearsal dinner" enough room to wrap at the natural
        // space instead of mid-word.
        const labelPaddingInlinePct = 6;

        return (
          <div
            key={String(id)}
            ref={(el) => {
              bubbleRefs.current[i] = el;
            }}
            className={cn(
              "absolute left-1/2 top-1/2 z-10 will-change-transform",
              !isReady && "opacity-0",
            )}
            style={{
              transition: isReady ? "opacity 0.6s ease-out" : "none",
              opacity: isReady ? 1 : 0,
              transform: "translate3d(-50%, -50%, 0)",
            }}
          >
            <motion.div
              className={cn("pointer-events-auto", bubbleMarginClassName ?? "m-1.5")}
              initial={{ scale: 0.08, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                // Slower, smoother ease-out (no overshoot) so newly revealed
                // bubbles grow in instead of snapping, with a generous
                // stagger to stop the whole sub-layer from arriving at once.
                duration: 0.95,
                delay: Math.min(i * 0.06, 0.45),
                ease: [0.22, 0.61, 0.36, 1],
              }}
            >
              {slot != null ? (
                slot
              ) : (
                <div
                  role={roleRadio ? "radio" : "button"}
                  aria-checked={roleRadio ? on : undefined}
                  tabIndex={0}
                  onPointerDown={(e) => handlePointerDown(e, i)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onClick={() => handleClick(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onActivate(id);
                    }
                  }}
                  className={cn(
                    pill,
                    bubbleSizeClassForBucket(sizeBucketFor(id, i)),
                    // Tinted bubbles manage their own border / bg / glow
                    // inline — skip the default sage "on" override so the
                    // per-bubble palette stays intact.
                    on && !tint && scopeSectorGlassPillOn,
                  )}
                  style={{
                    borderRadius: "50%",
                    width: `${visualDiameter}px`,
                    height: `${visualDiameter}px`,
                    // Density-aware typography — overrides the Tailwind
                    // text-[14px] / sm:text-[15px] on the base pill so
                    // labels track the bubble's actual painted size.
                    fontSize: `${labelFontPx}px`,
                    lineHeight: 1.1,
                    paddingInline: `${labelPaddingInlinePct}%`,
                    // `break-word` — only breaks mid-word when there's
                    // no other way to fit the word. Natural word/hyphen
                    // boundaries are preferred, so "Rehearsal dinner"
                    // becomes "Rehearsal\ndinner" instead of "Rehears\n
                    // al dinner". Mid-word breaks only trigger for truly
                    // overflowing single words like "Hospitality" in the
                    // tightest bucket, where it's still better than the
                    // word poking outside the bubble entirely.
                    overflowWrap: "break-word",
                    wordBreak: "normal",
                    hyphens: "auto",
                    ...(tint ? tintedBubbleStyle(tint, on) : {}),
                  }}
                >
                  {getLabel(id)}
                </div>
              )}
            </motion.div>
          </div>
        );
      })}
    </LayoutGroup>
  );
}
