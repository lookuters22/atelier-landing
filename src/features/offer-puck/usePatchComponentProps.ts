import type { Data } from "@measured/puck";
import { usePuck } from "@measured/puck";
import { useCallback } from "react";

/** Update props for a top-level component by its Puck `id`. */
export function usePatchComponentProps(componentId: string) {
  const { dispatch } = usePuck();

  return useCallback(
    <T extends Record<string, unknown>>(patch: Partial<T>) => {
      dispatch({
        type: "setData",
        data: (prev: Data) => ({
          ...prev,
          content: (prev.content ?? []).map((item) =>
            item.props?.id === componentId
              ? { ...item, props: { ...item.props, ...patch } }
              : item,
          ),
        }),
      });
    },
    [dispatch, componentId],
  );
}
