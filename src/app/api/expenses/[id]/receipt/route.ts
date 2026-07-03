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

  const expense = db
    .prepare('SELECT receipt_path FROM expenses WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { receipt_path: string | null } | undefined;

  if (!expense?.receipt_path) {
    return NextResponse.json({ error: 'No receipt for this expense' }, { status: 404 });
  }

  const filePath = receiptFilePath(expense.receipt_path);
  if (!filePath) {
    return NextResponse.json({ error: 'Receipt file missing' }, { status: 404 });
  }

  const file = fs.readFileSync(filePath);
  return new NextResponse(file, {
    headers: {
      'Content-Type': receiptContentType(expense.receipt_path),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
