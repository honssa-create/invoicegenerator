import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { imageResponseForStoredPath } from '@/lib/stored-image';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const row = db
    .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { fields_json: string | null } | undefined;
  if (!row) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  let stored: string | undefined;
  try {
    stored = row.fields_json ? JSON.parse(row.fields_json).payment_receipt_path : undefined;
  } catch {
    stored = undefined;
  }
  if (!stored) return NextResponse.json({ error: 'No payment receipt' }, { status: 404 });

  return imageResponseForStoredPath(stored);
}
