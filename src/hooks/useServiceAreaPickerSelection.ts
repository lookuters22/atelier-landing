import { useCallback, useMemo } from "react";
import type { BusinessScopeServiceArea } from "@/lib/serviceAreaPicker/serviceAreaPickerTypes.ts";

export type UseServiceAreaPickerSelectionArgs = {
  value: BusinessScopeServiceArea[];
  onChange: (next: BusinessScopeServiceArea[]) => void;
};

function keyFor(a: BusinessScopeServiceArea): string {
  return `${a.provider}:${a.provider_id}`;
}

export function useServiceAreaPickerSelection({
  value,
  onChange,
}: UseServiceAreaPickerSelectionArgs): {
  add: (area: BusinessScopeServiceArea) => void;
  remove: (provider_id: string, provider: BusinessScopeServiceArea["provider"]) => void;
  toggle: (area: BusinessScopeServiceArea) => void;
  clear: () => void;
  has: (provider_id: string, provider: BusinessScopeServiceArea["provider"]) => boolean;
} {
  const keySet = useMemo(() => new Set(value.map(keyFor)), [value]);

  const has = useCallback(
    (provider_id: string, provider: BusinessScopeServiceArea["provider"]) =>
      keySet.has(`${provider}:${provider_id}`),
    [keySet],
  );

  const add = useCallback(
    (area: BusinessScopeServiceArea) => {
      const k = keyFor(area);
      if (keySet.has(k)) return;
      onChange([...value, area]);
    },
    [keySet, onChange, value],
  );

  const remove = useCallback(
    (provider_id: string, provider: BusinessScopeServiceArea["provider"]) => {
      const k = `${provider}:${provider_id}`;
      onChange(value.filter((a) => keyFor(a) !== k));
    },
    [onChange, value],
  );

  const toggle = useCallback(
    (area: BusinessScopeServiceArea) => {
      const k = keyFor(area);
      if (keySet.has(k)) {
        onChange(value.filter((a) => keyFor(a) !== k));
      } else {
        onChange([...value, area]);
      }
    },
    [keySet, onChange, value],
  );

  const clear = useCallback(() => onChange([]), [onChange]);

  return { add, remove, toggle, clear, has };
}
