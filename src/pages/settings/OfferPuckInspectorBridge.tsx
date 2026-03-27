import { usePuck } from "@measured/puck";
import { useLayoutEffect } from "react";

/** Keeps the right inspector open at all times so the canvas width stays stable when selecting blocks. */
export function OfferPuckInspectorBridge() {
  const { appState, dispatch } = usePuck();
  const rightVisible = appState.ui.rightSideBarVisible;

  useLayoutEffect(() => {
    if (!rightVisible) {
      dispatch({
        type: "setUi",
        ui: { rightSideBarVisible: true },
        recordHistory: false,
      });
    }
  }, [rightVisible, dispatch]);

  return null;
}
