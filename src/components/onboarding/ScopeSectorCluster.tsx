import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { SectorDonutBubbleField } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import type { SectorDonutLayoutOptions } from "@/lib/onboardingScopeRadialScatter.ts";
import { cn } from "@/lib/utils";

/** Same outer shell as `ServicesRadialPebbleCluster` — one consistent field for every scope step. */
export const SCOPE_SECTOR_FIELD_SHELL_CLASS =
  "relative mx-auto w-full max-w-[min(36rem,100%)] overflow-visible py-2 min-h-[min(18rem,38vh)] h-[min(23rem,min(44vh,420px))] sm:min-h-[20rem] sm:h-[min(25rem,min(46vh,440px))]";

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
      />
    </div>
  );
}
