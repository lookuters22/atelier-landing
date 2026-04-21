/**
 * Derives optional explicit memory focus ids for the operator "Ask Ana" widget from the current URL.
 * Conservative: only pathname patterns that unambiguously name a wedding/project id.
 * No fuzzy extraction from query strings or labels.
 */

export type OperatorAnaRouteSurface = "pipeline" | "offer_builder";

export type OperatorAnaPathFocus = {
  weddingId: string | null;
  surface: OperatorAnaRouteSurface | null;
};

/**
 * Pathname-derived focus for the operator Ana widget (id + which app surface the user is on).
 */
export function deriveOperatorAnaFocusFromPathname(pathname: string): OperatorAnaPathFocus {
  const p = pathname.trim();
  const pipeline = p.match(/^\/pipeline\/([^/]+)\/?$/);
  if (pipeline?.[1]?.trim()) {
    return { weddingId: pipeline[1].trim(), surface: "pipeline" };
  }
  const offer = p.match(/\/workspace\/offer-builder\/edit\/([^/]+)/);
  if (offer?.[1]?.trim()) {
    return { weddingId: offer[1].trim(), surface: "offer_builder" };
  }
  return { weddingId: null, surface: null };
}

export function deriveFocusedWeddingIdFromPathname(pathname: string): string | null {
  return deriveOperatorAnaFocusFromPathname(pathname).weddingId;
}

/** Short operator-facing label when a project id is in scope from the route (no extra fetching). */
export function operatorAnaFocusBadgeLabel(focus: OperatorAnaPathFocus): string | null {
  if (!focus.weddingId) return null;
  if (focus.surface === "pipeline") {
    return "Using this pipeline project";
  }
  if (focus.surface === "offer_builder") {
    return "Using this project's offer builder";
  }
  return "Using current project context";
}
