import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useDirectoryPeople } from "../../../hooks/useDirectoryPeople";
import { parseSenderLine } from "../../../lib/senderContactParse";
import { ContactCreateDialog } from "../../contacts/ContactCreateDialog";
import type { ContactCreateInput } from "../../../lib/peopleDirectoryApi";
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
      <span className="inbox-sender-contact-hint" aria-live="polite">
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
        className="btn-ghostline inbox-sender-contact-btn"
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
      <button type="button" onClick={() => setDialogOpen(true)} className="btn-ghostline inbox-sender-contact-btn">
        <UserPlus className="inbox-sender-contact-ico" strokeWidth={2} aria-hidden />
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
