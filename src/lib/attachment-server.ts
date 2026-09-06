import db from './db';
import type { AttachmentFile } from './attachment-files';

const PARENT_TABLE = {
  order_id: 'order_files',
  quotation_id: 'quotation_files',
  invoice_id: 'invoice_files',
} as const;

/** Batch-load attachments for a list of parent ids (one query). */
export async function loadFilesGrouped(
  parentCol: keyof typeof PARENT_TABLE,
  ids: number[],
): Promise<Map<number, AttachmentFile[]>> {
  const map = new Map<number, AttachmentFile[]>();
  if (!ids.length) return map;
  const table = PARENT_TABLE[parentCol];
  const placeholders = ids.map(() => '?').join(',');
  const rows = (await db
    .prepare(
      `SELECT id, ${parentCol} AS parent_id, path, original_name FROM ${table}
       WHERE ${parentCol} IN (${placeholders}) ORDER BY id`,
    )
    .all(...ids)) as Array<{ id: number; parent_id: number; path: string; original_name: string | null }>;

  for (const r of rows) {
    const file: AttachmentFile = { id: r.id, path: r.path, original_name: r.original_name };
    const list = map.get(r.parent_id);
    if (list) list.push(file);
    else map.set(r.parent_id, [file]);
  }
  return map;
}

export function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/["\\\r\n]/g, '_') || 'download';
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export function sanitizeOriginalName(raw: string): string {
  return raw.replace(/[/\\:\0\r\n]/g, '_').slice(0, 200);
}
