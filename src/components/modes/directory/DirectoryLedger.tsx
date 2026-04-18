import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
  weddingQueuePosition,
} from "@/lib/pipelineWeddingListNavigation";
import { useAuth } from "../../../context/AuthContext";
import { useDirectoryPeople } from "../../../hooks/useDirectoryPeople";
import type { ContactCreateInput } from "../../../lib/peopleDirectoryApi";
import { ContactCreateDialog } from "../../contacts/ContactCreateDialog";
import { Button } from "../../ui/button";
import { useDirectoryMode, matchesCategory, categoryLabel } from "./DirectoryModeContext";
import type { DirectoryContact } from "../../../data/contactsDirectory";

function matchesContactSearch(c: DirectoryContact, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    c.name.toLowerCase().includes(s) ||
    c.role.toLowerCase().includes(s) ||
    c.email.toLowerCase().includes(s) ||
    (c.logisticsRole?.toLowerCase().includes(s) ?? false)
  );
}

export function DirectoryLedger() {
  const navigate = useNavigate();
  const { photographerId } = useAuth();
  const { createContact, isCreating } = useDirectoryPeople(photographerId);
  const [createOpen, setCreateOpen] = useState(false);

  const { contacts, searchQuery, activeCategory, selectedRow, setSelectedRow } =
    useDirectoryMode();

  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) => matchesCategory(c, activeCategory) && matchesContactSearch(c, searchQuery),
      ),
    [contacts, activeCategory, searchQuery],
  );

  const listScrollRef = useRef<HTMLDivElement>(null);

  const orderedEmails = useMemo(() => filtered.map((c) => c.email), [filtered]);

  const selectedEmail = selectedRow?.kind === "contact" ? selectedRow.data.email : null;

  const contactQueuePosition = useMemo(
    () => weddingQueuePosition(orderedEmails, selectedEmail),
    [orderedEmails, selectedEmail],
  );

  const goPrevContact = useCallback(() => {
    const email = adjacentWeddingIdInOrderedList(orderedEmails, selectedEmail, -1);
    if (!email) return;
    const c = filtered.find((x) => x.email === email);
    if (c) setSelectedRow({ kind: "contact", data: c });
  }, [orderedEmails, selectedEmail, filtered, setSelectedRow]);

  const goNextContact = useCallback(() => {
    const email = adjacentWeddingIdInOrderedList(orderedEmails, selectedEmail, 1);
    if (!email) return;
    const c = filtered.find((x) => x.email === email);
    if (c) setSelectedRow({ kind: "contact", data: c });
  }, [orderedEmails, selectedEmail, filtered, setSelectedRow]);

  useEffect(() => {
    if (orderedEmails.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = pipelineWeddingAltVerticalDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const email = adjacentWeddingIdInOrderedList(orderedEmails, selectedEmail, delta);
      if (!email) return;
      const c = filtered.find((x) => x.email === email);
      if (!c) return;
      if (email === selectedEmail) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedRow({ kind: "contact", data: c });
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderedEmails, selectedEmail, filtered, setSelectedRow]);

  useLayoutEffect(() => {
    if (!selectedEmail) return;
    const root = listScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-directory-contact-row="${CSS.escape(selectedEmail)}"]`);
    if (el instanceof HTMLElement) scrollPipelineWeddingRowIntoView(el);
  }, [selectedEmail, orderedEmails]);

  const title = categoryLabel(activeCategory);

  async function handleCreateContact(values: ContactCreateInput) {
    const r = await createContact(values);
    if (r.ok) {
      navigate(`/directory?contactEmail=${encodeURIComponent(values.email.trim())}`);
      return { ok: true };
    }
    if (r.existingPersonId) {
      navigate(`/directory?contactEmail=${encodeURIComponent(values.email.trim())}`);
      return { ok: true };
    }
    return { ok: false, error: r.error };
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-row items-center justify-between border-b border-border bg-background px-6 py-5 min-h-[88px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            onClick={() => setCreateOpen(true)}
          >
            <UserPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Add contact
          </Button>
        {orderedEmails.length >= 2 ? (
          <div
            role="region"
            aria-label="Directory contact queue navigation"
            className="flex shrink-0 items-center gap-1"
          >
            {contactQueuePosition ? (
              <span className="mr-1 tabular-nums text-[12px] text-muted-foreground" aria-live="polite">
                {contactQueuePosition.current} / {contactQueuePosition.total}
              </span>
            ) : null}
            <button
              type="button"
              title="Previous contact (Alt+↑)"
              aria-label="Previous contact in list"
              onClick={goPrevContact}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              title="Next contact (Alt+↓)"
              aria-label="Next contact in list"
              onClick={goNextContact}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex w-[72px] shrink-0 items-center justify-end" aria-hidden />
        )}
        </div>
      </div>

      <ContactCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateContact}
        submitting={isCreating}
      />

      <div ref={listScrollRef} className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-background text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Badges</th>
              <th className="px-4 py-2.5">Weddings</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No contacts match your search.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const isSelected = selectedEmail === c.email;
                return (
                  <tr
                    key={c.email}
                    data-directory-contact-row={c.email}
                    onClick={() => setSelectedRow({ kind: "contact", data: c })}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors last:border-0",
                      isSelected ? "bg-accent" : "hover:bg-accent/40",
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.role}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.email}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.authority === "primary" && (
                          <span className="rounded-full border border-[#2563eb]/20 bg-[#2563eb]/10 px-2 py-0.5 text-[11px] font-medium text-[#2563eb]">
                            Primary
                          </span>
                        )}
                        {c.authority === "secondary" && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Secondary
                          </span>
                        )}
                        {c.logisticsRole && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {c.logisticsRole}
                          </span>
                        )}
                        {!c.authority && !c.logisticsRole && (
                          <span className="text-[12px] text-muted-foreground">&mdash;</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {c.weddings.length}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
