import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { expenseWhereClause } from '@/lib/org-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sql, params: whereParams } = await expenseWhereClause(session);
  const expense = await db
    .prepare(`SELECT receipt_path FROM expenses WHERE id = ? AND ${sql}`)
    .get(params.id, ...whereParams) as { receipt_path: string | null } | undefined;

  if (!expense?.receipt_path) {
    return NextResponse.json({ error: 'No receipt' }, { status: 404 });
  }

  return imageResponseForStoredPath(expense.receipt_path);
}
