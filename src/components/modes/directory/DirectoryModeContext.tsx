import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useDirectoryPeople } from "../../../hooks/useDirectoryPeople";
import { normalizeMailboxForComparison } from "../../../lib/mailboxNormalize";
import type { DirectoryContact } from "../../../data/contactsDirectory";

export type DirectoryCategory = "all" | "clients" | "vendors" | "venues";

export function matchesCategory(c: DirectoryContact, cat: DirectoryCategory): boolean {
  switch (cat) {
    case "all":
      return true;
    case "clients":
      return c.stakeholderGroup === "couple";
    case "vendors":
      return c.stakeholderGroup === "planning" || c.stakeholderGroup === "vendor";
    case "venues":
      return (
        c.role.toLowerCase().includes("venue") ||
        (c.logisticsRole?.toLowerCase().includes("venue") ?? false)
      );
  }
}

export function categoryLabel(cat: DirectoryCategory): string {
  switch (cat) {
    case "all":
      return "All Contacts";
    case "clients":
      return "Clients";
    case "vendors":
      return "Vendors";
    case "venues":
      return "Venues";
  }
}

export type SelectedRow = { kind: "contact"; data: DirectoryContact } | null;

interface DirectoryModeState {
  selectedRow: SelectedRow;
  setSelectedRow: (row: SelectedRow) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  contacts: DirectoryContact[];
  contactsLoading: boolean;
  activeCategory: DirectoryCategory;
  setActiveCategory: (cat: DirectoryCategory) => void;
  categoryCounts: Record<DirectoryCategory, number>;
}

const Ctx = createContext<DirectoryModeState | null>(null);

export function useDirectoryMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDirectoryMode must be used within DirectoryModeProvider");
  return ctx;
}

export function DirectoryModeProvider({ children }: { children: ReactNode }) {
  const { photographerId } = useAuth();
  const { contacts, isLoading: contactsLoading } = useDirectoryPeople(photographerId);
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedRow, setSelectedRow] = useState<SelectedRow>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<DirectoryCategory>("all");

  const categoryCounts = useMemo<Record<DirectoryCategory, number>>(() => ({
    all: contacts.length,
    clients: contacts.filter((c) => matchesCategory(c, "clients")).length,
    vendors: contacts.filter((c) => matchesCategory(c, "vendors")).length,
    venues: contacts.filter((c) => matchesCategory(c, "venues")).length,
  }), [contacts]);

  const selectedPersonId = selectedRow?.data.personId;
  useEffect(() => {
    if (!selectedPersonId) return;
    const next = contacts.find((c) => c.personId === selectedPersonId);
    if (!next) return;
    setSelectedRow((prev) => {
      if (!prev || prev.data.personId !== selectedPersonId) return prev;
      if (
        prev.data.name === next.name &&
        prev.data.email === next.email &&
        prev.data.role === next.role &&
        prev.data.phone === next.phone
      ) {
        return prev;
      }
      return { kind: "contact", data: next };
    });
  }, [contacts, selectedPersonId]);

  /** Deep-link from Inbox: /directory?contactEmail=… */
  useEffect(() => {
    const raw = searchParams.get("contactEmail");
    if (!raw?.trim() || contacts.length === 0) return;
    const n = normalizeMailboxForComparison(raw);
    const c = contacts.find((x) => normalizeMailboxForComparison(x.email) === n);
    if (c) {
      setSelectedRow({ kind: "contact", data: c });
      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete("contactEmail");
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, contacts, setSearchParams]);

  return (
    <Ctx.Provider
      value={{
        selectedRow,
        setSelectedRow,
        searchQuery,
        setSearchQuery,
        contacts,
        contactsLoading,
        activeCategory,
        setActiveCategory,
        categoryCounts,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
