import { memo, type JSX } from "react";
import { motion, useReducedMotion, type MotionProps } from "framer-motion";
import type { OfferGroupId } from "@/lib/onboardingOfferComponentGroups";
import { cn } from "@/lib/utils";

/**
 * Decorative line-art mark rendered at the top-left of each bento cluster.
 *
 * Each glyph is built from a handful of SVG primitives (circle / line / rect /
 * path) and "self-draws" on mount via Framer Motion's `pathLength` animation.
 * Glyphs are strictly decorative — `aria-hidden` at the root — so they carry
 * no semantic weight and can be safely skipped for assistive tech. A
 * `prefers-reduced-motion` fallback renders the final shape statically.
 */
export type OfferingsClusterGlyphProps = {
  groupId: OfferGroupId;
  /** Extra delay before the self-draw starts (for bento-wide stagger). */
  delay?: number;
  className?: string;
};

const STROKE = "currentColor";
const STROKE_WIDTH = 1;

function OfferingsClusterGlyphImpl({
  groupId,
  delay = 0,
  className,
}: OfferingsClusterGlyphProps): JSX.Element {
  const reduce = useReducedMotion();

  // Framer-motion `pathLength: 1` works for <path>, <line>, <circle>, <rect>,
  // <ellipse>, <polygon>, <polyline>. We pick the fastest primitive per glyph.
  // Unified return shape (always `initial`/`animate`/`transition`) so the
  // spread into SVG motion components doesn't widen to a discriminated union.
  type DrawProps = Pick<MotionProps, "initial" | "animate" | "transition">;
  const drawFor = (i: number, duration = 0.9): DrawProps => {
    if (reduce) {
      return {
        initial: { pathLength: 1, opacity: 1 },
        animate: { pathLength: 1, opacity: 1 },
        transition: { duration: 0 },
      };
    }
    return {
      initial: { pathLength: 0, opacity: 0 },
      animate: { pathLength: 1, opacity: 1 },
      transition: {
        pathLength: { duration, ease: [0.22, 1, 0.36, 1], delay: delay + i * 0.22 },
        opacity: { duration: 0.3, delay: delay + i * 0.22 },
      },
    };
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 28 28"
      width="28"
      height="28"
      fill="none"
      stroke={STROKE}
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0 text-white/40", className)}
    >
      {groupId === "photo" ? (
        <>
          <motion.circle cx="14" cy="14" r="9" {...drawFor(0, 1.05)} />
          <motion.circle cx="14" cy="14" r="3.5" {...drawFor(1, 0.7)} />
          <motion.line x1="14" y1="2.5" x2="14" y2="6.5" {...drawFor(2, 0.5)} />
        </>
      ) : null}

      {groupId === "video" ? (
        <>
          <motion.rect x="4.5" y="8.5" width="19" height="11" rx="0.5" {...drawFor(0, 1.05)} />
          <motion.line x1="4.5" y1="11.5" x2="23.5" y2="11.5" {...drawFor(1, 0.6)} />
          <motion.line x1="4.5" y1="16.5" x2="23.5" y2="16.5" {...drawFor(2, 0.6)} />
          <motion.line x1="10.5" y1="8.5" x2="10.5" y2="19.5" {...drawFor(3, 0.5)} />
          <motion.line x1="17.5" y1="8.5" x2="17.5" y2="19.5" {...drawFor(4, 0.5)} />
        </>
      ) : null}

      {groupId === "content_creation" ? (
        <>
          {/* phone outline */}
          <motion.rect x="9" y="3.5" width="10" height="21" rx="1.5" {...drawFor(0, 1.1)} />
          {/* notch / speaker slit */}
          <motion.line x1="12.5" y1="5.8" x2="15.5" y2="5.8" {...drawFor(1, 0.35)} />
          {/* play triangle */}
          <motion.path d="M12.5 11.2 L12.5 18.2 L17.4 14.7 Z" {...drawFor(2, 0.75)} />
        </>
      ) : null}

      {groupId === "cross_service" ? (
        <>
          {/* crosshair — four rays + inner ring */}
          <motion.line x1="14" y1="2.5" x2="14" y2="8" {...drawFor(0, 0.5)} />
          <motion.line x1="14" y1="20" x2="14" y2="25.5" {...drawFor(1, 0.5)} />
          <motion.line x1="2.5" y1="14" x2="8" y2="14" {...drawFor(2, 0.5)} />
          <motion.line x1="20" y1="14" x2="25.5" y2="14" {...drawFor(3, 0.5)} />
          <motion.circle cx="14" cy="14" r="4" {...drawFor(4, 0.85)} />
        </>
      ) : null}
    </svg>
  );
}

export const OfferingsClusterGlyph = memo(OfferingsClusterGlyphImpl);
