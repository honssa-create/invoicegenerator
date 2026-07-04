import { NextResponse } from 'next/server';
import fs from 'fs';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { receiptFilePath, receiptContentType } from '@/lib/receipt';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const row = db
    .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { fields_json: string | null } | undefined;
  if (!row) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  let path: string | undefined;
  try {
    path = row.fields_json ? JSON.parse(row.fields_json).payment_receipt_path : undefined;
  } catch {
    path = undefined;
  }
  if (!path) return NextResponse.json({ error: 'No payment receipt' }, { status: 404 });

  const filePath = receiptFilePath(path);
  if (!filePath) return NextResponse.json({ error: 'File missing' }, { status: 404 });

  const file = fs.readFileSync(filePath);
  return new NextResponse(file, {
    headers: { 'Content-Type': receiptContentType(path), 'Cache-Control': 'private, max-age=3600' },
  });
}
