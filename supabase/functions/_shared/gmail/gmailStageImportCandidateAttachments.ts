/**
 * G2: Stage Gmail attachment bytes under photographer-owned storage paths before message rows exist;
 * finalize copies into canonical message paths on approve.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64UrlToBytes } from "./gmailBase64.ts";
import { fetchGmailAttachmentBytes } from "./gmailAttachmentFetch.ts";
import type { GmailAttachmentCandidate } from "./gmailMimeAttachments.ts";
import { GMAIL_IMPORT_MEDIA_BUCKET } from "./gmailImportAttachments.ts";

const MAX_BYTES = 25 * 1024 * 1024;

export type StagingUploadFailure = { candidate_index: number; error: string };

export type StagedImportAttachmentRef = {
  /** Object path within `message_attachment_media` (first segment = photographer_id). */
  storage_path: string;
  mime_type: string;
  original_filename: string;
  /** Stable key for message_attachments.source_url uniqueness */
  source_url: string;
  metadata: Record<string, unknown>;
};

function sanitizeFilenameSegment(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "file";
  return base.slice(0, 180);
}

function buildStagingPrefix(photographerId: string, importCandidateId: string): string {
  return `${photographerId}/staging_import/${importCandidateId}`;
}

/**
 * Fetch or decode attachment bytes and upload to staging paths (no message_attachments rows).
 */
export async function stageImportCandidateAttachments(
  supabase: SupabaseClient,
  opts: {
    accessToken: string;
    gmailMessageId: string;
    photographerId: string;
    importCandidateId: string;
    candidates: GmailAttachmentCandidate[];
  },
): Promise<{ staged: StagedImportAttachmentRef[]; upload_failures: StagingUploadFailure[] }> {
  const { accessToken, gmailMessageId, photographerId, importCandidateId, candidates } = opts;
  const prefix = buildStagingPrefix(photographerId, importCandidateId);
  const out: StagedImportAttachmentRef[] = [];
  const uploadFailures: StagingUploadFailure[] = [];

  let index = 0;
  for (const c of candidates) {
    let bytes: Uint8Array;
    if (c.inlineDataBase64Url) {
      bytes = decodeBase64UrlToBytes(c.inlineDataBase64Url);
    } else if (c.attachmentId) {
      bytes = await fetchGmailAttachmentBytes(accessToken, gmailMessageId, c.attachmentId);
    } else {
      index += 1;
      continue;
    }
    if (bytes.byteLength > MAX_BYTES) {
      index += 1;
      continue;
    }

    const safe = sanitizeFilenameSegment(c.filename);
    const short = crypto.randomUUID().slice(0, 8);
    const objectPath = `${prefix}/${short}-${safe}`;
    const blob = new Blob([bytes], { type: c.mimeType || "application/octet-stream" });
    const { error: upErr } = await supabase.storage
      .from(GMAIL_IMPORT_MEDIA_BUCKET)
      .upload(objectPath, blob, {
        upsert: true,
        contentType: c.mimeType || "application/octet-stream",
      });
    if (upErr) {
      uploadFailures.push({ candidate_index: index, error: upErr.message.slice(0, 500) });
      index += 1;
      continue;
    }

    const source_url = `gmail-import:staged:${importCandidateId}:${index}`;
    out.push({
      storage_path: objectPath,
      mime_type: c.mimeType || "application/octet-stream",
      original_filename: c.filename,
      source_url,
      metadata: {
        source: "gmail_import_staging",
        storage_bucket: GMAIL_IMPORT_MEDIA_BUCKET,
        gmail_message_id: gmailMessageId,
        gmail_attachment_id: c.attachmentId,
        gmail_part_id: c.partId,
        gmail_size_bytes: c.sizeBytes,
        content_id: c.contentId,
        disposition: c.disposition,
        bytes_source: c.inlineDataBase64Url ? "body_data" : "attachments_api",
      },
    });
    index += 1;
  }

  return { staged: out, upload_failures: uploadFailures };
}

/**
 * Copy staged objects to canonical message paths, insert rows, remove staging objects.
 */
export async function finalizeStagedImportAttachmentsToMessage(
  supabase: SupabaseClient,
  opts: {
    photographerId: string;
    messageId: string;
    importCandidateId: string;
    staged: StagedImportAttachmentRef[];
  },
): Promise<{ imported: number; failed: number }> {
  const { photographerId, messageId, importCandidateId, staged } = opts;
  let imported = 0;
  let failed = 0;
  const bucket = GMAIL_IMPORT_MEDIA_BUCKET;

  for (const s of staged) {
    const short = crypto.randomUUID().slice(0, 8);
    const safe = sanitizeFilenameSegment(s.original_filename);
    const destPath = `${photographerId}/${messageId}/${short}-${safe}`;

    // Server-side copy avoids streaming bytes through the Edge worker (download + re-upload).
    const { error: copyErr } = await supabase.storage.from(bucket).copy(s.storage_path, destPath);
    if (copyErr) {
      console.warn("[finalizeStagedImportAttachments] copy", copyErr.message);
      failed += 1;
      continue;
    }

    const { error: insErr } = await supabase.from("message_attachments").insert({
      message_id: messageId,
      photographer_id: photographerId,
      kind: "attachment",
      source_url: s.source_url,
      storage_path: destPath,
      mime_type: s.mime_type,
      metadata: {
        ...s.metadata,
        finalized_from_staging: true,
        import_candidate_id: importCandidateId,
      },
    });

    if (insErr) {
      console.warn("[finalizeStagedImportAttachments] insert", insErr.message);
      failed += 1;
      await supabase.storage.from(bucket).remove([destPath]).catch(() => {});
      continue;
    }

    await supabase.storage.from(bucket).remove([s.storage_path]).catch(() => {});
    imported += 1;
  }

  return { imported, failed };
}

/** Best-effort delete all objects under staging prefix for a candidate (after approve or on prepare retry). */
export async function deleteStagingPrefixForImportCandidate(
  supabase: SupabaseClient,
  photographerId: string,
  importCandidateId: string,
): Promise<void> {
  const prefix = buildStagingPrefix(photographerId, importCandidateId);
  const bucket = GMAIL_IMPORT_MEDIA_BUCKET;
  const { data: list } = await supabase.storage.from(bucket).list(prefix, { limit: 500 });
  if (!list?.length) return;
  const paths = list.map((f) => `${prefix}/${f.name}`);
  await supabase.storage.from(bucket).remove(paths).catch(() => {});
}
