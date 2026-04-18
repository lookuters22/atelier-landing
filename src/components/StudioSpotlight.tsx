import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sun,
  MessageSquare,
  Columns3,
  CalendarDays,
  Briefcase,
  Users,
  Settings,
  Heart,
  User,
  Sparkles,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/context/AuthContext";
import { useWeddings } from "@/hooks/useWeddings";
import { useDirectoryPeople } from "@/hooks/useDirectoryPeople";
import { openAnaWithQuery } from "./SupportAssistantWidget";

const OPEN_SPOTLIGHT_EVENT = "studio-spotlight:open";

export function openSpotlight() {
  window.dispatchEvent(new Event(OPEN_SPOTLIGHT_EVENT));
}

const NAV_ITEMS = [
  { label: "Today", to: "/today", icon: Sun },
  { label: "Inbox", to: "/inbox", icon: MessageSquare },
  { label: "Pipeline", to: "/pipeline", icon: Columns3 },
  { label: "Calendar", to: "/calendar", icon: CalendarDays },
  { label: "Workspace", to: "/workspace", icon: Briefcase },
  { label: "Directory", to: "/directory", icon: Users },
  { label: "Settings", to: "/settings", icon: Settings },
];

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function AnaScopeBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[12px] font-medium text-violet-700">
      <Sparkles className="h-3 w-3" />
      Ask Ana
    </span>
  );
}

export function StudioSpotlight() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isAnaScoped, setIsAnaScoped] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const navigate = useNavigate();
  const { photographerId } = useAuth();
  const { data: weddings } = useWeddings(photographerId ?? "");
  const { contacts: directoryContacts } = useDirectoryPeople(photographerId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SPOTLIGHT_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SPOTLIGHT_EVENT, onOpenEvent);
    };
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setIsAnaScoped(false);
  }, []);

  const go = useCallback(
    (to: string) => {
      navigate(to);
      handleClose();
    },
    [navigate, handleClose],
  );

  const enterAnaScope = useCallback((preserveQuery = false) => {
    setIsAnaScoped(true);
    if (!preserveQuery) setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const exitAnaScope = useCallback(() => {
    setIsAnaScoped(false);
    setQuery("");
  }, []);

  const handleAnaSubmit = useCallback(() => {
    const text = query.trim();
    if (!text) return;
    handleClose();
    openAnaWithQuery(text);
  }, [query, handleClose]);

  const handleAnaFooterSelect = useCallback(() => {
    enterAnaScope(true);
  }, [enterAnaScope]);

  const filteredWeddings = useMemo(() => {
    if (isAnaScoped || debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return weddings
      .filter((w) => w.couple_names.toLowerCase().includes(q))
      .slice(0, 8);
  }, [weddings, debouncedQuery, isAnaScoped]);

  const filteredContacts = useMemo(() => {
    if (isAnaScoped || debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    return directoryContacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [debouncedQuery, isAnaScoped, directoryContacts]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
        else setOpen(true);
      }}
      title="Studio Spotlight"
      description="Search for a command, project, or contact"
      showCloseButton={false}
    >
      <CommandInput
        ref={inputRef}
        placeholder={isAnaScoped ? "Type your question for Ana…" : "Type a command or search…"}
        value={query}
        onValueChange={setQuery}
        prefix={isAnaScoped ? <AnaScopeBadge /> : undefined}
        onKeyDown={(e) => {
          if (isAnaScoped) {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAnaSubmit();
              return;
            }
            if (e.key === "Backspace" && query === "") {
              e.preventDefault();
              exitAnaScope();
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              if (query) {
                setQuery("");
              } else {
                exitAnaScope();
              }
              return;
            }
          }
        }}
      />

      {!isAnaScoped && (
        <CommandList>
          <CommandGroup heading="Navigation">
            {NAV_ITEMS.map((item) => (
              <CommandItem key={item.to} value={`go ${item.label}`} onSelect={() => go(item.to)}>
                <item.icon className="mr-2 h-4 w-4 text-slate-400" />
                <span>Go to {item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {filteredWeddings.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Projects">
                {filteredWeddings.map((w) => (
                  <CommandItem
                    key={w.id}
                    value={`project ${w.couple_names}`}
                    onSelect={() => go(`/pipeline/${w.id}`)}
                  >
                    <Heart className="mr-2 h-4 w-4 text-slate-400" />
                    <span className="flex-1 truncate">{w.couple_names}</span>
                    <span className="ml-2 shrink-0 rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] capitalize text-slate-500">
                      {formatStage(w.stage)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {filteredContacts.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Contacts">
                {filteredContacts.map((c) => (
                  <CommandItem
                    key={c.email}
                    value={`contact ${c.name} ${c.role}`}
                    onSelect={() => go("/directory")}
                  >
                    <User className="mr-2 h-4 w-4 text-slate-400" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="ml-2 text-[11px] text-slate-500">{c.role}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandGroup forceMount className="border-t border-slate-200/50 !mt-1 !pt-1">
            <CommandItem
              forceMount
              value="ask ana talk to ana ai help question"
              onSelect={handleAnaFooterSelect}
              className="text-violet-600"
            >
              <Sparkles className="mr-2 h-4 w-4 text-violet-400" />
              {query.trim() ? (
                <span>
                  Ask Ana: &ldquo;{query.trim().length > 50 ? query.trim().slice(0, 50) + "…" : query.trim()}&rdquo;
                </span>
              ) : (
                <span>Talk to Ana</span>
              )}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      )}

      {isAnaScoped && (
        <div className="px-4 py-6 text-center text-[12px] text-slate-400">
          Press <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">Enter</kbd> to send
          &nbsp;·&nbsp;
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">Backspace</kbd> to exit
        </div>
      )}
    </CommandDialog>
  );
}
