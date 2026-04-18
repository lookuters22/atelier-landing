import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useDirectoryPeople } from "../../../hooks/useDirectoryPeople";
import { parseSenderLine } from "../../../lib/senderContactParse";
import { ContactCreateDialog } from "../../contacts/ContactCreateDialog";
import type { ContactCreateInput } from "../../../lib/peopleDirectoryApi";
import { cn } from "@/lib/utils";

export function InboxSenderContactActions({ sender }: { sender: string }) {
  const navigate = useNavigate();
  const { photographerId } = useAuth();
  const { findByEmail, isLoading, createContact, isCreating, refetch } = useDirectoryPeople(photographerId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const parsed = useMemo(() => parseSenderLine(sender), [sender]);
  const existing = useMemo(() => {
    if (!parsed.email) return undefined;
    return findByEmail(parsed.email);
  }, [parsed.email, findByEmail]);

  if (!parsed.email) return null;

  if (isLoading) {
    return (
      <span className="text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
        Contacts…
      </span>
    );
  }

  if (existing) {
    return (
      <button
        type="button"
        onClick={() =>
          navigate(`/directory?contactEmail=${encodeURIComponent(existing.email)}`, { replace: false })
        }
        title="Already in contacts"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground",
        )}
      >
        Open in Directory
      </button>
    );
  }

  async function handleSubmit(values: ContactCreateInput) {
    const r = await createContact(values);
    if (r.ok) {
      await refetch();
      return { ok: true };
    }
    if (r.existingPersonId) {
      await refetch();
      navigate(`/directory?contactEmail=${encodeURIComponent(values.email.trim())}`);
      return { ok: true };
    }
    return { ok: false, error: r.error };
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-accent"
      >
        <UserPlus className="h-3 w-3" strokeWidth={2} aria-hidden />
        Add to contacts
      </button>
      <ContactCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Add to contacts"
        initialValues={{
          fullName: parsed.displayName,
          email: parsed.email,
        }}
        onSubmit={handleSubmit}
        submitting={isCreating}
      />
    </>
  );
}
