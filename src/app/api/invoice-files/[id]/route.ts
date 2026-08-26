import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';
import { trashInvoiceFile } from '@/lib/trash';
import { contentDispositionAttachment, sanitizeOriginalName } from '@/lib/attachment-server';
import { isAttachmentImage } from '@/lib/attachment-files';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const wantDownload = new URL(request.url).searchParams.get('download') === '1';

  const row = await db
    .prepare(
      `SELECT f.path, f.original_name FROM invoice_files f
       JOIN invoices i ON i.id = f.invoice_id
       WHERE f.id = ? AND i.user_id = ?`,
    )
    .get(params.id, ownerId) as { path: string; original_name: string | null } | undefined;
  if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const res = await imageResponseForStoredPath(row.path);
  if (wantDownload && res.status === 200) {
    const headers = new Headers(res.headers);
    headers.set(
      'Content-Disposition',
      contentDispositionAttachment(row.original_name?.trim() || `invoice-file-${params.id}`),
    );
    return new NextResponse(res.body, { status: res.status, headers });
  }
  return res;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  const fileId = Number(params.id);
  if (!Number.isFinite(fileId) || fileId <= 0) {
    return NextResponse.json({ error: 'Invalid file id' }, { status: 400 });
  }

  let body: { original_name?: unknown; set_thumbnail?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const row = await db
    .prepare(
      `SELECT f.id, f.path, f.original_name, f.invoice_id FROM invoice_files f
       JOIN invoices i ON i.id = f.invoice_id
       WHERE f.id = ? AND i.user_id = ?`,
    )
    .get(fileId, ownerId) as
    | { id: number; path: string; original_name: string | null; invoice_id: number }
    | undefined;
  if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  if (body.set_thumbnail === true) {
    if (!isAttachmentImage(row)) {
      return NextResponse.json({ error: 'Only image files can be thumbnails' }, { status: 400 });
    }
    await db
      .prepare('UPDATE invoices SET thumbnail_file_id = ? WHERE id = ? AND user_id = ?')
      .run(fileId, row.invoice_id, ownerId);
  }

  if (typeof body.original_name === 'string') {
    const raw = body.original_name.trim();
    if (!raw) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const name = sanitizeOriginalName(raw);
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    await db.prepare('UPDATE invoice_files SET original_name = ? WHERE id = ?').run(name, fileId);
  }

  const updated = await db
    .prepare('SELECT id, path, original_name FROM invoice_files WHERE id = ?')
    .get(fileId);
  return NextResponse.json({ file: updated });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  const fileId = Number(params.id);
  const parent = await db
    .prepare(
      `SELECT f.invoice_id FROM invoice_files f
       JOIN invoices i ON i.id = f.invoice_id
       WHERE f.id = ? AND i.user_id = ?`,
    )
    .get(fileId, ownerId) as { invoice_id: number } | undefined;
  if (!await trashInvoiceFile(ownerId, fileId)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  if (parent) {
    await db
      .prepare(
        `UPDATE invoices SET thumbnail_file_id = NULL
         WHERE id = ? AND user_id = ? AND thumbnail_file_id = ?`,
      )
      .run(parent.invoice_id, ownerId, fileId);
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
