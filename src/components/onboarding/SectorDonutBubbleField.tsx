import type { ReactNode } from "react";
import { useMemo } from "react";
import { LayoutGroup, motion } from "framer-motion";
import {
  computeSectorDonutPoses,
  type SectorDonutLayoutOptions,
  scatterPillPaddingClass,
} from "@/lib/onboardingScopeRadialScatter.ts";
import { cn } from "@/lib/utils";

/** Shared glass pill tokens — match across services / geography / all scope sector steps. */
export const scopeSectorGlassPillBase =
  "whitespace-nowrap rounded-full border border-white/20 bg-white/10 text-[15px] font-medium leading-snug text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px] transition-[background,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25";

export const scopeSectorGlassPillOn =
  "border-[#9ca893]/90 bg-[#9ca893]/22 shadow-[0_0_24px_rgba(156,168,147,0.38),inset_0_1px_0_rgba(255,255,255,0.1)]";

export type SectorDonutBubbleFieldProps<T extends string> = {
  itemIds: readonly T[];
  getLabel: (id: T) => ReactNode;
  isSelected: (id: T) => boolean;
  onActivate: (id: T) => void;
  size: { w: number; h: number };
  phaseShift: number;
  /** Shift donut center (px); negative pulls cluster up (room for bottom slot). */
  centerYOffsetPx?: number;
  layoutGroupId: string;
  roleRadio?: boolean;
  pillClassName?: string;
  staggerBaseMs?: number;
  staggerStepMs?: number;
  /** Extra spacing around each bubble (Tailwind margin on the motion wrapper). */
  bubbleMarginClassName?: string;
  /** Orbit radius / fit tuning — see `computeSectorDonutPoses`. */
  orbitLayout?: SectorDonutLayoutOptions;
  /** Replace the default button for an item (e.g. inline edit on the same bubble). */
  renderItemSlot?: (id: T, index: number) => ReactNode | null | undefined;
};

export function SectorDonutBubbleField<T extends string>({
  itemIds,
  getLabel,
  isSelected,
  onActivate,
  size,
  phaseShift,
  centerYOffsetPx = 0,
  layoutGroupId,
  roleRadio = false,
  pillClassName,
  staggerBaseMs = 450,
  staggerStepMs = 85,
  bubbleMarginClassName,
  orbitLayout,
  renderItemSlot,
}: SectorDonutBubbleFieldProps<T>) {
  const poses = useMemo(
    () => computeSectorDonutPoses(itemIds.length, size.w, size.h, phaseShift, centerYOffsetPx, orbitLayout),
    [itemIds.length, size.w, size.h, phaseShift, centerYOffsetPx, orbitLayout],
  );

  const pill = pillClassName ?? scopeSectorGlassPillBase;

  return (
    <LayoutGroup id={layoutGroupId}>
      {itemIds.map((id, i) => {
        const pose = poses[i];
        if (!pose) return null;
        const on = isSelected(id);
        const slot = renderItemSlot?.(id, i);

        return (
          <div
            key={String(id)}
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          >
            <motion.div
              className={cn("pointer-events-auto", bubbleMarginClassName ?? "m-2")}
              initial={{
                x: pose.entryX,
                y: pose.entryY,
                opacity: 0,
                scale: 0.88,
                rotate: pose.entryRotate,
              }}
              animate={{
                x: pose.x,
                y: pose.y,
                opacity: 1,
                scale: 1,
                rotate: pose.rotate,
              }}
              transition={{
                type: "spring",
                stiffness: 120,
                damping: 14,
                delay: (staggerBaseMs + i * staggerStepMs) / 1000,
              }}
            >
              {slot != null ? (
                slot
              ) : (
                <motion.button
                  layout="position"
                  type="button"
                  role={roleRadio ? "radio" : undefined}
                  aria-checked={roleRadio ? on : undefined}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  onClick={() => onActivate(id)}
                  className={cn(pill, scatterPillPaddingClass(i), on && scopeSectorGlassPillOn)}
                >
                  {getLabel(id)}
                </motion.button>
              )}
            </motion.div>
          </div>
        );
      })}
    </LayoutGroup>
  );
}
