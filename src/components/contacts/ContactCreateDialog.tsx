import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "@/lib/utils";
import type { ContactCreateInput } from "../../lib/peopleDirectoryApi";

export type ContactCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<ContactCreateInput>;
  onSubmit: (values: ContactCreateInput) => Promise<{ ok: boolean; error?: string }>;
  submitting?: boolean;
  title?: string;
};

const empty: ContactCreateInput = {
  fullName: "",
  email: "",
  phone: "",
  company: "",
  role: "",
  notes: "",
};

export function ContactCreateDialog({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
  submitting,
  title = "Add contact",
}: ContactCreateDialogProps) {
  const [form, setForm] = useState<ContactCreateInput>(empty);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setForm({
      fullName: initialValues?.fullName?.trim() ?? "",
      email: initialValues?.email?.trim() ?? "",
      phone: initialValues?.phone?.trim() ?? "",
      company: initialValues?.company?.trim() ?? "",
      role: initialValues?.role?.trim() ?? "",
      notes: initialValues?.notes?.trim() ?? "",
    });
  }, [open, initialValues]);

  async function handleSave() {
    setLocalError(null);
    const r = await onSubmit({
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone?.trim() || undefined,
      company: form.company?.trim() || undefined,
      role: form.role?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    });
    if (r.ok) onOpenChange(false);
    else if (r.error) setLocalError(r.error);
  }

  /* Portaled: avoid semantic tokens. Typography matches InboxContextList rail (nav rows + section
     labels), not the Compose CTA (no black pill / font-semibold headline). */
  const fieldClass =
    "w-full rounded-md border border-[#e5e5e5] bg-white py-1.5 px-2.5 text-[13px] font-normal text-[#3c4043] outline-none transition placeholder:text-[#8e8e93] focus:ring-1 focus:ring-[#2563eb]";

  /* Same as folder section headers: INQUIRIES, WEDDINGS, … */
  const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-[#8e8e93]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="dashboard"
        className={cn(
          "font-dashboard dashboard-context-dialog-surface gap-3 p-5 !rounded-[18px] sm:max-w-[420px]",
        )}
      >
        <DialogHeader className="gap-1 space-y-0 text-left">
          {/* Inbox folder row: text-[13px] font-medium; use muted grey like inactive nav, not Compose weight */}
          <DialogTitle className="text-[13px] font-medium leading-snug text-[#5f6368]">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-[13px] text-[#3c4043]">
          <label className="grid gap-1">
            <span className={labelClass}>
              Full name
            </span>
            <input
              className={fieldClass}
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              autoComplete="name"
            />
          </label>
          <label className="grid gap-1">
            <span className={labelClass}>
              Email
            </span>
            <input
              type="email"
              className={fieldClass}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="email"
            />
          </label>
          <label className="grid gap-1">
            <span className={labelClass}>
              Phone (optional)
            </span>
            <input
              type="tel"
              className={fieldClass}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              autoComplete="tel"
            />
          </label>
          <label className="grid gap-1">
            <span className={labelClass}>
              Company (optional)
            </span>
            <input
              className={fieldClass}
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              autoComplete="organization"
            />
          </label>
          <label className="grid gap-1">
            <span className={labelClass}>
              Role / label (optional)
            </span>
            <input className={fieldClass} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className={labelClass}>
              Notes (optional)
            </span>
            <textarea
              rows={3}
              className={cn(fieldClass, "resize-none")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          {localError ? (
            <p className="text-[12px] text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
        </div>
        <DialogFooter className="mt-1 flex flex-row flex-wrap items-center justify-end gap-2 sm:gap-2">
          {/* Inactive folder row: text-muted-foreground + hover:bg-black/[0.04] */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-4 py-2 text-[13px] font-normal text-[#5f6368] transition hover:bg-black/[0.04]"
          >
            Cancel
          </button>
          {/* Selected folder row: bg-foreground/10 font-medium text-foreground — not Compose */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting}
            className="rounded-full bg-black/[0.06] px-4 py-2 text-[13px] font-medium text-[#3c4043] transition hover:bg-black/[0.09] disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save contact"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
