import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';
import { trashOrderFile } from '@/lib/trash';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = getDataOwnerId(session.userId);

  const row = db
    .prepare(
      `SELECT f.path FROM order_files f
       JOIN orders o ON o.id = f.order_id
       WHERE f.id = ? AND o.user_id = ?`
    )
    .get(params.id, ownerId) as { path: string } | undefined;
  if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  return imageResponseForStoredPath(row.path);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);
  if (!trashOrderFile(ownerId, Number(params.id))) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
