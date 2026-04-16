/**
 * G3: Persist large sanitized Gmail HTML to Storage + `gmail_render_artifacts` row; metadata keeps a compact ref only.
 * Object path must start with `{photographer_id}/` so JWT storage policies match `message_attachment_media`.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { GMAIL_IMPORT_MEDIA_BUCKET } from "./gmailImportAttachments.ts";

export const GMAIL_RENDER_HTML_CONTENT_TYPE = "text/html; charset=utf-8";

export type GmailImportRenderHtmlRefV1 = {
  version: 1;
  artifact_id: string;
  storage_bucket: string;
  storage_path: string;
  byte_size: number;
};

export type PersistGmailRenderHtmlResult =
  | { ok: true; artifactId: string; ref: GmailImportRenderHtmlRefV1 }
  | { ok: false; error: string };

export function parseGmailImportRenderHtmlRefFromMetadata(
  metadata: unknown,
): GmailImportRenderHtmlRefV1 | null {
  if (!metadata || typeof metadata !== "object") return null;
  const gi = (metadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return null;
  const r = (gi as Record<string, unknown>).render_html_ref;
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (o.version !== 1) return null;
  const aid = o.artifact_id;
  const bucket = o.storage_bucket;
  const path = o.storage_path;
  if (typeof aid !== "string" || !aid || typeof bucket !== "string" || typeof path !== "string") {
    return null;
  }
  return {
    version: 1,
    artifact_id: aid,
    storage_bucket: bucket,
    storage_path: path,
    byte_size: typeof o.byte_size === "number" ? o.byte_size : 0,
  };
}

function textEncoder(): TextEncoder {
  return new TextEncoder();
}

export async function persistGmailRenderHtmlArtifact(
  supabase: SupabaseClient,
  opts: {
    photographerId: string;
    html: string;
    importCandidateId?: string;
    messageId?: string;
  },
): Promise<PersistGmailRenderHtmlResult> {
  const { photographerId, html, importCandidateId, messageId } = opts;
  if (!html || html.length === 0) {
    return { ok: false, error: "empty_html" };
  }

  const bytes = textEncoder().encode(html);
  const byteSize = bytes.byteLength;
  const artifactId = crypto.randomUUID();
  const storagePath = `${photographerId}/gmail_render/${artifactId}.html`;

  const blob = new Blob([bytes], { type: "text/html;charset=utf-8" });
  const { error: upErr } = await supabase.storage
    .from(GMAIL_IMPORT_MEDIA_BUCKET)
    .upload(storagePath, blob, {
      upsert: false,
      contentType: GMAIL_RENDER_HTML_CONTENT_TYPE,
    });

  if (upErr) {
    return { ok: false, error: `storage_upload:${upErr.message}` };
  }

  const { data: ins, error: insErr } = await supabase
    .from("gmail_render_artifacts")
    .insert({
      id: artifactId,
      photographer_id: photographerId,
      import_candidate_id: importCandidateId ?? null,
      message_id: messageId ?? null,
      storage_bucket: GMAIL_IMPORT_MEDIA_BUCKET,
      storage_path: storagePath,
      byte_size: byteSize,
      content_sha256: null,
    })
    .select("id")
    .single();

  if (insErr || !ins?.id) {
    await supabase.storage.from(GMAIL_IMPORT_MEDIA_BUCKET).remove([storagePath]).catch(() => {});
    return { ok: false, error: `artifact_insert:${insErr?.message ?? "unknown"}` };
  }

  return {
    ok: true,
    artifactId: ins.id as string,
    ref: {
      version: 1,
      artifact_id: ins.id as string,
      storage_bucket: GMAIL_IMPORT_MEDIA_BUCKET,
      storage_path: storagePath,
      byte_size: byteSize,
    },
  };
}

/** Embed compact ref in `metadata.gmail_import` and strip inline `body_html_sanitized`. */
export function applyGmailRenderRefToMetadata(
  metadata: Record<string, unknown>,
  ref: GmailImportRenderHtmlRefV1,
): Record<string, unknown> {
  const gi = metadata.gmail_import;
  const baseGi =
    gi && typeof gi === "object" && gi !== null ? { ...(gi as Record<string, unknown>) } : {};
  delete baseGi.body_html_sanitized;
  baseGi.render_html_ref = ref;
  return { ...metadata, gmail_import: baseGi };
}
