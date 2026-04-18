import { Link } from "react-router-dom";
import { ExternalLink, Mail, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PaneInspectorEmptyState,
  PaneInspectorFrame,
  PaneInspectorScrollBody,
  PaneInspectorSectionTitle,
  PANE_INSPECTOR_BADGE_LABEL,
  PANE_INSPECTOR_BODY,
  PANE_INSPECTOR_SUBTITLE,
  PANE_INSPECTOR_TITLE,
} from "@/components/panes";
import { useDirectoryMode } from "./DirectoryModeContext";
import { WEDDING_CATALOG } from "../../../data/weddingCatalog";
import type { DirectoryContact } from "../../../data/contactsDirectory";

function coupleName(weddingId: string): string {
  return WEDDING_CATALOG[weddingId]?.couple ?? weddingId;
}

function IdleShell() {
  return (
    <PaneInspectorEmptyState
      icon={<Users className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
      message="Select a contact to view their profile, linked weddings, and communication history."
    />
  );
}

function ContactDossier({ contact }: { contact: DirectoryContact }) {
  return (
    <PaneInspectorFrame>
      <PaneInspectorScrollBody>
        <div>
          <h2 className={PANE_INSPECTOR_TITLE}>{contact.name}</h2>
          <p className={cn("mt-0.5", PANE_INSPECTOR_SUBTITLE)}>{contact.role}</p>
        </div>
        <div className="space-y-2">
          <a
            href={`mailto:${contact.email}`}
            className={cn("flex items-center gap-2 text-foreground hover:underline", PANE_INSPECTOR_BODY)}
          >
            <Mail className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            {contact.email}
          </a>
          {contact.phone ? (
            <p className={cn(PANE_INSPECTOR_BODY, "text-muted-foreground")}>
              <span className="font-medium text-foreground/90">Phone: </span>
              {contact.phone}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {contact.authority === "primary" && (
            <span className={cn("rounded-full border border-[#2563eb]/20 bg-[#2563eb]/10 px-2.5 py-0.5 text-[#2563eb]", PANE_INSPECTOR_BADGE_LABEL)}>
              Primary contact
            </span>
          )}
          {contact.authority === "secondary" && (
            <span className={cn("rounded-full border border-border px-2.5 py-0.5 text-muted-foreground", PANE_INSPECTOR_BADGE_LABEL)}>
              Secondary contact
            </span>
          )}
          {contact.logisticsRole && (
            <span className={cn("rounded-full border border-border px-2.5 py-0.5 text-muted-foreground", PANE_INSPECTOR_BADGE_LABEL)}>
              {contact.logisticsRole}
            </span>
          )}
        </div>
        {contact.weddings.length > 0 && (
          <div>
            <PaneInspectorSectionTitle>Linked Weddings</PaneInspectorSectionTitle>
            <div className="space-y-1.5">
              {contact.weddings.map((id) => (
                <Link
                  key={id}
                  to={`/pipeline/${id}`}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 font-medium text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                    PANE_INSPECTOR_BODY,
                  )}
                >
                  <span className="text-foreground">{coupleName(id)}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </PaneInspectorScrollBody>
    </PaneInspectorFrame>
  );
}

export function DirectoryInspector() {
  const { selectedRow } = useDirectoryMode();

  if (!selectedRow) return <IdleShell />;
  return <ContactDossier contact={selectedRow.data} />;
}
