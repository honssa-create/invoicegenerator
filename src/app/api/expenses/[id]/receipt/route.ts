import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { imageResponseForStoredPath } from '@/lib/stored-image';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expense = db
    .prepare('SELECT receipt_path FROM expenses WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { receipt_path: string | null } | undefined;

  if (!expense?.receipt_path) {
    return NextResponse.json({ error: 'No receipt' }, { status: 404 });
  }

  return imageResponseForStoredPath(expense.receipt_path);
}
