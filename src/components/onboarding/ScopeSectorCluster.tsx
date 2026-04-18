import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { SectorDonutBubbleField } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import type {
  BubbleSizeBucket,
  SectorDonutLayoutOptions,
} from "@/lib/onboardingScopeRadialScatter.ts";
import { cn } from "@/lib/utils";

/**
 * Outer shell for every scope step.
 * Wider than tall so the force-packed cluster settles into a horizontal
 * ellipse instead of a circle that eats into the question header / nav row.
 */
export const SCOPE_SECTOR_FIELD_SHELL_CLASS =
  "relative mx-auto w-full max-w-[min(50rem,100%)] overflow-visible py-1 min-h-[16rem] h-[min(20rem,min(38vh,360px))] sm:min-h-[18rem] sm:h-[min(22rem,min(42vh,380px))]";

export type ScopeSectorClusterProps<T extends string> = {
  itemIds: readonly T[];
  getLabel: (id: T) => ReactNode;
  isSelected: (id: T) => boolean;
  onActivate: (id: T) => void;
  phaseShift?: number;
  centerYOffsetPx?: number;
  layoutGroupId: string;
  roleRadio?: boolean;
  pillClassName?: string;
  staggerBaseMs?: number;
  staggerStepMs?: number;
  bubbleMarginClassName?: string;
  orbitLayout?: SectorDonutLayoutOptions;
  getSizeBucket?: (id: T, index: number) => BubbleSizeBucket;
  getIsCenterAnchored?: (id: T, index: number) => boolean;
  /**
   * Optional per-bubble slot renderer. Returning non-null replaces the
   * default pill for that bubble while keeping the physics body — used by
   * the services stage to turn the "+ Your own" bubble into an inline input.
   */
  renderItemSlot?: (id: T, index: number) => ReactNode | null | undefined;
  /**
   * Optional per-bubble tint. See `SectorDonutBubbleField#getBubbleTint`.
   * Only the services stage opts in; neutral stages leave it undefined so
   * the classic dark-glass pills render unchanged.
   */
  getBubbleTint?: (
    id: T,
    index: number,
  ) => { primary: string; secondary?: string } | null | undefined;
} & Omit<ComponentPropsWithoutRef<"div">, "children">;

export function ScopeSectorCluster<T extends string>({
  itemIds,
  getLabel,
  isSelected,
  onActivate,
  phaseShift = 0,
  centerYOffsetPx = 0,
  layoutGroupId,
  roleRadio,
  pillClassName,
  staggerBaseMs,
  staggerStepMs,
  bubbleMarginClassName,
  orbitLayout,
  getSizeBucket,
  getIsCenterAnchored,
  renderItemSlot,
  getBubbleTint,
  className,
  ...divProps
}: ScopeSectorClusterProps<T>) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 340 });

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize({ w: r.width, h: r.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={fieldRef} className={cn(SCOPE_SECTOR_FIELD_SHELL_CLASS, className)} {...divProps}>
      <SectorDonutBubbleField
        itemIds={itemIds}
        getLabel={getLabel}
        isSelected={isSelected}
        onActivate={onActivate}
        size={size}
        phaseShift={phaseShift}
        centerYOffsetPx={centerYOffsetPx}
        layoutGroupId={layoutGroupId}
        roleRadio={roleRadio}
        pillClassName={pillClassName}
        staggerBaseMs={staggerBaseMs}
        staggerStepMs={staggerStepMs}
        bubbleMarginClassName={bubbleMarginClassName}
        orbitLayout={orbitLayout}
        getSizeBucket={getSizeBucket}
        getIsCenterAnchored={getIsCenterAnchored}
        renderItemSlot={renderItemSlot}
        getBubbleTint={getBubbleTint}
      />
    </div>
  );
}
