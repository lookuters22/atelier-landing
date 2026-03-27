import { useEffect, useState } from "react";
import { useOfferViewportWidth } from "./OfferViewportContext";

function evaluateWidthQuery(query: string, width: number): boolean | null {
  const normalized = query.trim().toLowerCase();
  const minMatch = normalized.match(/\(min-width:\s*(\d+(?:\.\d+)?)px\)/);
  const maxMatch = normalized.match(/\(max-width:\s*(\d+(?:\.\d+)?)px\)/);

  if (!minMatch && !maxMatch) return null;

  const min = minMatch ? Number(minMatch[1]) : null;
  const max = maxMatch ? Number(maxMatch[1]) : null;

  if (min !== null && width < min) return false;
  if (max !== null && width > max) return false;
  return true;
}

export function useMediaQuery(query: string): boolean {
  const previewWidth = useOfferViewportWidth();
  const [matches, setMatches] = useState(() =>
    previewWidth != null
      ? (evaluateWidthQuery(query, previewWidth) ?? false)
      : typeof window !== "undefined"
        ? window.matchMedia(query).matches
        : false,
  );

  useEffect(() => {
    if (previewWidth != null) {
      setMatches(evaluateWidthQuery(query, previewWidth) ?? false);
      return;
    }

    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [previewWidth, query]);

  return matches;
}
