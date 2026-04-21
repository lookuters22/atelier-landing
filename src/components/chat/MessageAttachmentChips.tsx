import { useCallback, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { MESSAGE_ATTACHMENT_MEDIA_BUCKET } from "../../lib/messageAttachmentStorage";

export type ChatAttachmentRow = {
  id: string;
  source_url: string;
  storage_path: string | null;
  mime_type: string | null;
  metadata: Record<string, unknown> | null;
};

function displayName(a: ChatAttachmentRow): string {
  const m = a.metadata;
  if (m && typeof m.original_filename === "string" && m.original_filename.trim()) {
    return m.original_filename.trim();
  }
  const fromSource = a.source_url.split("/").pop();
  return fromSource && fromSource.length > 0 ? fromSource : "Attachment";
}

function storageBucket(a: ChatAttachmentRow): string {
  const m = a.metadata;
  if (m && typeof m.storage_bucket === "string" && m.storage_bucket.trim()) {
    return m.storage_bucket.trim();
  }
  return MESSAGE_ATTACHMENT_MEDIA_BUCKET;
}

export function MessageAttachmentChips({
  attachments,
  variant = "default",
}: {
  attachments: ChatAttachmentRow[];
  /** Tighter chips for Ana inbox thread messages. */
  variant?: "default" | "inboxAna";
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const open = useCallback(async (a: ChatAttachmentRow) => {
    if (!a.storage_path) {
      window.open(a.source_url, "_blank", "noopener,noreferrer");
      return;
    }
    setLoadingId(a.id);
    try {
      const bucket = storageBucket(a);
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(a.storage_path, 600);
      if (error || !data?.signedUrl) {
        console.error("attachment signed URL", error?.message);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setLoadingId(null);
    }
  }, []);

  if (attachments.length === 0) return null;

  const chipCls =
    variant === "inboxAna"
      ? "msg-attach-chip inline-flex max-w-full items-center gap-1.5 text-left transition disabled:opacity-60"
      : "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2 py-1 text-left text-[11px] font-medium text-foreground shadow-sm transition hover:bg-accent disabled:opacity-60";

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => void open(a)}
          disabled={loadingId === a.id}
          className={chipCls}
          title={displayName(a)}
        >
          {loadingId === a.id ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <FileDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate">{displayName(a)}</span>
          {a.mime_type ? (
            <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
              {a.mime_type.split("/")[1] ?? a.mime_type}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
