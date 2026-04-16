/* eslint-disable react-refresh/only-export-components -- context + hook types shared with inbox shell */
import { createContext, useContext, type ReactNode, type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

export type InboxLayoutValue = {
  inspectorPanelRef: RefObject<PanelImperativeHandle | null>;
  inspectorCollapsed: boolean;
  collapseInspector: () => void;
  expandInspector: () => void;
};

const Ctx = createContext<InboxLayoutValue | null>(null);

export function InboxLayoutProvider({ value, children }: { value: InboxLayoutValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInboxLayout(): InboxLayoutValue | null {
  return useContext(Ctx);
}
