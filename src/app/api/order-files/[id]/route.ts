import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';
import { trashOrderFile } from '@/lib/trash';

function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/["\\\r\n]/g, '_') || 'download';
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const wantDownload = new URL(request.url).searchParams.get('download') === '1';

  const row = await db
    .prepare(
      `SELECT f.path, f.original_name FROM order_files f
       JOIN orders o ON o.id = f.order_id
       WHERE f.id = ? AND o.user_id = ?`
    )
    .get(params.id, ownerId) as { path: string; original_name: string | null } | undefined;
  if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const res = await imageResponseForStoredPath(row.path);
  if (wantDownload && res.status === 200) {
    const headers = new Headers(res.headers);
    headers.set(
      'Content-Disposition',
      contentDispositionAttachment(row.original_name?.trim() || `order-file-${params.id}`)
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

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  const fileId = Number(params.id);
  if (!Number.isFinite(fileId) || fileId <= 0) {
    return NextResponse.json({ error: 'Invalid file id' }, { status: 400 });
  }

  let body: { original_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = typeof body.original_name === 'string' ? body.original_name.trim() : '';
  if (!raw) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  // Keep display name filesystem-safe-ish; strip path separators / control chars.
  const name = raw.replace(/[/\\:\0\r\n]/g, '_').slice(0, 200);
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const row = await db
    .prepare(
      `SELECT f.id FROM order_files f
       JOIN orders o ON o.id = f.order_id
       WHERE f.id = ? AND o.user_id = ?`
    )
    .get(fileId, ownerId) as { id: number } | undefined;
  if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  await db.prepare('UPDATE order_files SET original_name = ? WHERE id = ?').run(name, fileId);

  const updated = await db
    .prepare('SELECT id, path, original_name FROM order_files WHERE id = ?')
    .get(fileId);

  return NextResponse.json({ file: updated });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  if (!await trashOrderFile(ownerId, Number(params.id))) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
