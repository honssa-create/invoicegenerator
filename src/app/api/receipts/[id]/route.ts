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
      `SELECT r.path FROM expense_receipts r
       JOIN expenses e ON e.id = r.expense_id
       WHERE r.id = ? AND e.user_id = ?`
    )
    .get(params.id, session.userId) as { path: string } | undefined;

  if (!row) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  const filePath = receiptFilePath(row.path);
  if (!filePath) {
    return NextResponse.json({ error: 'Receipt file missing' }, { status: 404 });
  }

  const file = fs.readFileSync(filePath);
  return new NextResponse(file, {
    headers: {
      'Content-Type': receiptContentType(row.path),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
