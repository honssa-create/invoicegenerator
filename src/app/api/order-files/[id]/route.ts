import { NextResponse } from 'next/server';
import fs from 'fs';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { receiptFilePath, receiptContentType } from '@/lib/receipt';

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

  const filePath = receiptFilePath(row.path);
  if (!filePath) return NextResponse.json({ error: 'File missing' }, { status: 404 });

  const file = fs.readFileSync(filePath);
  return new NextResponse(file, {
    headers: {
      'Content-Type': receiptContentType(row.path),
      'Cache-Control': 'private, max-age=3600',
    },
  });
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
