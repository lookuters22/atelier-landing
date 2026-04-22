import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../../context/AuthContext";
import { loadJson, saveJson } from "../../../lib/settingsStorage";
import { supabase } from "../../../lib/supabase";
import { fetchInvoiceSetupRemote, upsertInvoiceSetupRemote } from "../../../lib/invoiceSetupRemote";
import { invoiceSetupLocalStorageKey } from "../../../lib/invoiceSetupLocalKey";
import {
  defaultInvoiceSetup,
  type InvoiceSetupState,
} from "../../../lib/invoiceSetupTypes";

interface InvoiceSetupCtx {
  setup: InvoiceSetupState;
  setSetup: React.Dispatch<React.SetStateAction<InvoiceSetupState>>;
}

const Ctx = createContext<InvoiceSetupCtx | null>(null);

const REMOTE_DEBOUNCE_MS = 450;

export function InvoiceSetupProvider({ children }: { children: ReactNode }) {
  const { photographerId, isLoading: authLoading } = useAuth();
  const [setup, setSetup] = useState<InvoiceSetupState>(defaultInvoiceSetup);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const skipNextRemotePersist = useRef(false);
  const [remoteReady, setRemoteReady] = useState(false);

  useEffect(() => {
    if (authLoading || !photographerId) return;
    saveJson(invoiceSetupLocalStorageKey(photographerId), setup);
  }, [setup, photographerId, authLoading]);

  useEffect(() => {
    if (authLoading || !photographerId) {
      setRemoteReady(false);
      return;
    }

    const pid = photographerId;
    setRemoteReady(false);
    const fromLocal = loadJson(invoiceSetupLocalStorageKey(pid), defaultInvoiceSetup());
    setSetup(fromLocal);

    let cancelled = false;
    (async () => {
      try {
        const row = await fetchInvoiceSetupRemote(supabase, pid);
        if (cancelled) return;
        if (row) {
          skipNextRemotePersist.current = true;
          setSetup(row.template);
          saveJson(invoiceSetupLocalStorageKey(pid), row.template);
        } else {
          await upsertInvoiceSetupRemote(supabase, pid, fromLocal);
          skipNextRemotePersist.current = true;
        }
      } catch (e) {
        console.warn("[invoice-setup] remote sync failed", e);
      } finally {
        if (!cancelled) setRemoteReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, photographerId]);

  useEffect(() => {
    if (authLoading || !photographerId || !remoteReady) return;
    if (skipNextRemotePersist.current) {
      skipNextRemotePersist.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      upsertInvoiceSetupRemote(supabase, photographerId, setup).catch((e) => {
        console.warn("[invoice-setup] remote save failed", e);
      });
    }, REMOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [setup, photographerId, authLoading, remoteReady]);

  return <Ctx.Provider value={{ setup, setSetup }}>{children}</Ctx.Provider>;
}

export function useInvoiceSetup() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInvoiceSetup must be used within InvoiceSetupProvider");
  return ctx;
}
