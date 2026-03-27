import type { Data } from "@measured/puck";
import { usePuck } from "@measured/puck";
import { useCallback } from "react";

/** Patch root props (e.g. document title). */
export function usePatchRootProps() {
  const { dispatch } = usePuck();

  return useCallback(
    (patch: Record<string, unknown>) => {
      dispatch({
        type: "setData",
        data: (prev: Data) => ({
          ...prev,
          root: {
            ...prev.root,
            props: {
              ...(prev.root.props ?? {}),
              ...patch,
            },
          },
        }),
      });
    },
    [dispatch],
  );
}
