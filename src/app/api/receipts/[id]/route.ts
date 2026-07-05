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
      `SELECT r.path FROM expense_receipts r
       JOIN expenses e ON e.id = r.expense_id
       WHERE r.id = ? AND e.user_id = ?`
    )
    .get(params.id, session.userId) as { path: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  return imageResponseForStoredPath(row.path);
}
