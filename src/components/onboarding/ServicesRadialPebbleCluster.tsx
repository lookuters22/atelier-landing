import { useEffect, useMemo, useRef, useState } from "react";
import type { OfferedServiceType } from "@/lib/onboardingBusinessScopeDeterministic.ts";
import type { BusinessScopeCustomService } from "@/lib/onboardingBusinessScopeExtensions.ts";
import { ALL_OFFERED_SERVICE_TYPES, OFFERED_SERVICE_LABELS } from "@/lib/onboardingBriefingScopeDefaults.ts";
import { scatterPillPaddingClass } from "@/lib/onboardingScopeRadialScatter.ts";
import { SCOPE_SECTOR_FIELD_SHELL_CLASS } from "@/components/onboarding/ScopeSectorCluster.tsx";
import { SectorDonutBubbleField } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import { cn } from "@/lib/utils";

/** Sixth slot — same ring as core services (sector layout). */
const CUSTOM_SERVICE_SLOT = "__custom__" as const;

/** Preset service, indexed custom row from parent, or add-more slot */
export type ServiceBubbleId = OfferedServiceType | `custom:${number}` | typeof CUSTOM_SERVICE_SLOT;

const inlineCustomInputClass =
  "min-w-[min(14rem,72vw)] max-w-[min(18rem,88vw)] rounded-full border border-dashed border-white/35 bg-white/[0.12] px-5 py-3.5 text-[15px] font-medium leading-snug text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px] placeholder:text-white/45 outline-none transition-[border-color,background] focus:border-white/45 focus:bg-white/[0.16] focus:ring-2 focus:ring-white/15";

export type ServicesRadialPebbleClusterProps = {
  offeredServices: readonly OfferedServiceType[];
  /** Custom services appear as floating bubbles in the same ring (not a separate chip row). */
  customServices: readonly BusinessScopeCustomService[];
  onRemoveCustom: (index: number) => void;
  onToggleService: (s: OfferedServiceType) => void;
  customBubbleDraft: string;
  onCustomBubbleDraftChange: (v: string) => void;
  customBubbleOpen: boolean;
  onOpenCustom: () => void;
  /** Pass the raw input value on Enter (not parent state — avoids stale closure + blur races). */
  onSubmitCustom: (value: string) => void;
  onCancelCustom: () => void;
};

function parseCustomIndex(id: ServiceBubbleId): number | null {
  if (typeof id === "string" && id.startsWith("custom:")) {
    const n = Number(id.slice("custom:".length));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function ServicesRadialPebbleCluster({
  offeredServices,
  customServices,
  onRemoveCustom,
  onToggleService,
  customBubbleDraft,
  onCustomBubbleDraftChange,
  customBubbleOpen,
  onOpenCustom,
  onSubmitCustom,
  onCancelCustom,
}: ServicesRadialPebbleClusterProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 340 });
  const customInputRef = useRef<HTMLInputElement>(null);
  /** Enter submit runs sync; blur microtask must not cancel before save. */
  const skipBlurCancelRef = useRef(false);

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

  useEffect(() => {
    if (!customBubbleOpen) return;
    requestAnimationFrame(() => {
      customInputRef.current?.focus();
      customInputRef.current?.select();
    });
  }, [customBubbleOpen]);

  const itemIds = useMemo((): readonly ServiceBubbleId[] => {
    const customIds = customServices.map((_, i) => `custom:${i}` as `custom:${number}`);
    return [...ALL_OFFERED_SERVICE_TYPES, ...customIds, CUSTOM_SERVICE_SLOT];
  }, [customServices]);

  const phaseShift = offeredServices.length * 0.11 + customServices.length * 0.065;

  return (
    <div ref={fieldRef} className={SCOPE_SECTOR_FIELD_SHELL_CLASS}>
      <SectorDonutBubbleField<ServiceBubbleId>
        itemIds={itemIds}
        getLabel={(id) => {
          if (id === CUSTOM_SERVICE_SLOT) return "+ Your own bubble";
          const ci = parseCustomIndex(id);
          if (ci != null) {
            const label = customServices[ci]?.label ?? "";
            return (
              <span className="inline-flex max-w-[min(15rem,78vw)] items-center gap-1.5">
                <span className="min-w-0 truncate">{label}</span>
                <button
                  type="button"
                  className="shrink-0 rounded-full px-1.5 text-[15px] leading-none text-white/55 transition-colors hover:text-white"
                  aria-label={`Remove ${label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCustom(ci);
                  }}
                >
                  ×
                </button>
              </span>
            );
          }
          return OFFERED_SERVICE_LABELS[id as OfferedServiceType];
        }}
        isSelected={(id) => {
          if (id === CUSTOM_SERVICE_SLOT) return false;
          if (parseCustomIndex(id) != null) return true;
          return offeredServices.includes(id as OfferedServiceType);
        }}
        onActivate={(id) => {
          if (id === CUSTOM_SERVICE_SLOT) {
            onOpenCustom();
            return;
          }
          if (parseCustomIndex(id) != null) return;
          onToggleService(id as OfferedServiceType);
        }}
        renderItemSlot={(id, i) => {
          if (id !== CUSTOM_SERVICE_SLOT || !customBubbleOpen) return null;
          return (
            <input
              ref={customInputRef}
              type="text"
              value={customBubbleDraft}
              onChange={(e) => onCustomBubbleDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  skipBlurCancelRef.current = true;
                  onSubmitCustom(e.currentTarget.value);
                  queueMicrotask(() => {
                    skipBlurCancelRef.current = false;
                  });
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancelCustom();
                }
              }}
              onBlur={() => {
                queueMicrotask(() => {
                  if (skipBlurCancelRef.current) return;
                  if (document.activeElement === customInputRef.current) return;
                  onCancelCustom();
                });
              }}
              placeholder="Your service…"
              aria-label="Custom service name"
              autoComplete="off"
              className={cn(inlineCustomInputClass, scatterPillPaddingClass(i))}
            />
          );
        }}
        size={size}
        phaseShift={phaseShift}
        centerYOffsetPx={0}
        layoutGroupId="services-sector-donut"
      />
    </div>
  );
}
