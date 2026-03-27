import { usePuck } from "@measured/puck";
import { useEffect, useRef } from "react";

/** Puck root drop zone id (see @measured/puck root-droppable-id). */
const ROOT_DROP_ZONE = "root:default-zone";

/**
 * First paint with itemSelector null leaves zoom/layout unstable (blank canvas). Select first
 * block once when the page has content — does not re-select after user clears selection.
 */
export function OfferPuckInitialSelection() {
  const { appState, dispatch } = usePuck();
  const didAutoSelect = useRef(false);

  useEffect(() => {
    if (didAutoSelect.current) return;
    const content = appState.data?.content;
    if (!Array.isArray(content) || content.length === 0) return;
    if (appState.ui.itemSelector != null) {
      didAutoSelect.current = true;
      return;
    }
    didAutoSelect.current = true;
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: 0, zone: ROOT_DROP_ZONE } },
      recordHistory: false,
    });
  }, [appState.data?.content, appState.ui.itemSelector, dispatch]);

  return null;
}
