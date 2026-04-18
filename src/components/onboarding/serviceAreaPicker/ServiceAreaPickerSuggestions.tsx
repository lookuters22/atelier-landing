import type { ServiceAreaSearchResult } from "@/lib/serviceAreaPicker/serviceAreaPickerTypes.ts";
import { ServiceAreaPickerChip } from "./ServiceAreaPickerChip.tsx";

export type ServiceAreaPickerSuggestionsProps = {
  candidates: ServiceAreaSearchResult[];
  /** Same keys as selection: `bundled:${provider_id}` or `custom:…`. */
  selectedKeys: Set<string>;
  onToggle: (result: ServiceAreaSearchResult) => void;
};

function selectionKey(r: ServiceAreaSearchResult): string {
  return `bundled:${r.provider_id}`;
}

export function ServiceAreaPickerSuggestions({
  candidates,
  selectedKeys,
  onToggle,
}: ServiceAreaPickerSuggestionsProps) {
  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
      {candidates.map((c) => {
        const id = selectionKey(c);
        const selected = selectedKeys.has(id);
        return (
          <ServiceAreaPickerChip
            key={id}
            label={c.label}
            isSelected={selected}
            onClick={() => onToggle(c)}
          />
        );
      })}
    </div>
  );
}
