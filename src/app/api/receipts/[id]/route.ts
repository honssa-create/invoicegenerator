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

  const { sql, params: whereParams } = expenseWhereClause(session);
  const row = db
    .prepare(
      `SELECT r.path, r.source_url FROM expense_receipts r
       JOIN expenses e ON e.id = r.expense_id
       WHERE r.id = ? AND e.${sql}`
    )
    .get(params.id, ...whereParams) as { path: string; source_url: string | null } | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  return imageResponseForStoredPath(row.path, row.source_url);
}
