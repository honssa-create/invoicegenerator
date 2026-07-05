import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { imageResponseForStoredPath } from '@/lib/stored-image';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const row = db
    .prepare(
      `SELECT f.path FROM order_files f
       JOIN orders o ON o.id = f.order_id
       WHERE f.id = ? AND o.user_id = ?`
    )
    .get(params.id, session.userId) as { path: string } | undefined;
  if (!row) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  return imageResponseForStoredPath(row.path);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = db
    .prepare(
      `DELETE FROM order_files WHERE id = ? AND order_id IN (SELECT id FROM orders WHERE user_id = ?)`
    )
    .run(params.id, session.userId);
  if (result.changes === 0) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
