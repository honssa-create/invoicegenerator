export interface AttachmentFile {
  id: number;
  path: string;
  original_name: string | null;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)(?:$|[?#])/i;

/** True when a stored attachment is a displayable raster image. */
export function isAttachmentImage(file: {
  path?: string | null;
  original_name?: string | null;
}): boolean {
  return IMAGE_EXT_RE.test(file.original_name || '') || IMAGE_EXT_RE.test(file.path || '');
}

export function parseThumbnailFileId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return null;
}

/** Prefer an explicit thumbnail id when it still points at an image, else first image. */
export function pickThumbnailFile(
  files: AttachmentFile[],
  thumbnailFileId?: unknown,
): AttachmentFile | null {
  if (!files.length) return null;
  const preferredId = parseThumbnailFileId(thumbnailFileId);
  if (preferredId) {
    const preferred = files.find((f) => f.id === preferredId && isAttachmentImage(f));
    if (preferred) return preferred;
  }
  return files.find(isAttachmentImage) || null;
}
