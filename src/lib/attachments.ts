import type { Attachment } from "@/lib/database.types";

/** Matches the `attachments` bucket's file_size_limit (migration …_storage.sql). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Documents the picker offers; the bucket's allowed_mime_types agrees. */
export const DOCUMENT_MIME_TYPE = "application/pdf";

/**
 * Reduce a picked file name to a safe Supabase Storage object key segment.
 * Spaces, slashes, and punctuation in names like "Manual (2019) — LG.pdf"
 * either break the key or survive only percent-encoded, so the readable name
 * is stored in `attachments.file_name` and the path gets this instead.
 */
export function storageSafeName(name: string): string {
  // Drop any directory part first: a name is only ever one key segment.
  const base = name.split(/[\\/]/).pop() ?? "";
  // Split before sanitizing so truncation never eats the extension — anything
  // that later opens the object by URL infers the type from it.
  const dot = base.lastIndexOf(".");
  const hasExt = dot > 0 && dot < base.length - 1;
  const stem = sanitizePart(hasExt ? base.slice(0, dot) : base).slice(0, 80);
  const ext = hasExt ? sanitizePart(base.slice(dot + 1)).slice(0, 11) : "";
  return ext ? `${stem || "file"}.${ext}` : stem || "file";
}

function sanitizePart(part: string): string {
  return part
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "");
}

/**
 * What to show under a non-image thumb. Falls back to the storage path's last
 * segment (minus the upload timestamp prefix) for rows without `file_name`.
 * The migration backfills legacy rows because their original names cannot be
 * distinguished reliably from the random suffix in newer object keys.
 */
export function attachmentDisplayName(
  attachment: Pick<Attachment, "file_name" | "storage_path">,
): string {
  if (attachment.file_name) return attachment.file_name;
  const segment = attachment.storage_path.split("/").pop() ?? "";
  return segment.replace(/^\d+-/, "") || "Attachment";
}

/**
 * Object key for a newly uploaded file: `{household}/{item}/{ts}-{rand}-{name}`.
 * The household prefix is what storage RLS checks. `Date.now()` alone collides
 * when two members upload the same file name in the same millisecond, and
 * `storage_path` is unique, so a random suffix keeps that from failing an
 * otherwise valid upload.
 */
export function attachmentStoragePath(
  householdId: string,
  itemId: string,
  fileName: string,
): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${householdId}/${itemId}/${Date.now()}-${suffix}-${storageSafeName(fileName)}`;
}

/** Throws a user-facing error when a picked file exceeds the bucket limit. */
export function assertWithinSizeLimit(name: string, size: number | undefined) {
  if (size != null && size > MAX_ATTACHMENT_BYTES) {
    const mb = (MAX_ATTACHMENT_BYTES / 1024 / 1024).toFixed(0);
    throw new Error(`"${name}" is larger than the ${mb} MB limit.`);
  }
}
