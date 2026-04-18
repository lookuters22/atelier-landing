import { Check } from "lucide-react";
import { scopeSectorGlassPillBase, scopeSectorGlassPillOn } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import { cn } from "@/lib/utils";

export type ServiceAreaPickerChipProps = {
  label: string;
  isSelected: boolean;
  onClick: () => void;
  onRemove?: () => void;
  className?: string;
};

export function ServiceAreaPickerChip({
  label,
  isSelected,
  onClick,
  onRemove,
  className,
}: ServiceAreaPickerChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        scopeSectorGlassPillBase,
        "inline-flex max-w-full items-center gap-1.5 px-3 py-1.5 text-[13px]",
        isSelected && scopeSectorGlassPillOn,
        className,
      )}
    >
      {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden /> : null}
      <span className="truncate">{label}</span>
      {onRemove ? (
        <span
          role="button"
          tabIndex={0}
          className="ml-0.5 shrink-0 text-white/55 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          aria-label={`Remove ${label}`}
        >
          ×
        </span>
      ) : null}
    </button>
  );
}
