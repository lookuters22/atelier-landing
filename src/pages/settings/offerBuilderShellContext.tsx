import { createContext, useContext, useState, type ReactNode } from "react";

export type OfferBuilderShellCommands = {
  documentTitle: string;
  downloadHtml: () => void;
  saveNow: () => void;
  previewOpen: boolean;
  togglePreview: () => void;
};

type ShellCtx = {
  commands: OfferBuilderShellCommands | null;
  setCommands: (c: OfferBuilderShellCommands | null) => void;
};

const OfferBuilderShellContext = createContext<ShellCtx | null>(null);

export function OfferBuilderShellProvider({ children }: { children: ReactNode }) {
  const [commands, setCommands] = useState<OfferBuilderShellCommands | null>(null);
  return (
    <OfferBuilderShellContext.Provider value={{ commands, setCommands }}>{children}</OfferBuilderShellContext.Provider>
  );
}

export function useOfferBuilderShell() {
  const ctx = useContext(OfferBuilderShellContext);
  if (!ctx) {
    throw new Error("useOfferBuilderShell must be used within OfferBuilderShellProvider");
  }
  return ctx;
}
