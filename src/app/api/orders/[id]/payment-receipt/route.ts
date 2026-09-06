import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);

  const row = await db
    .prepare('SELECT fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId) as { fields_json: string | null } | undefined;
  if (!row) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const slotParam = new URL(request.url).searchParams.get('slot');
  const slot = slotParam === '2' || slotParam === '3' ? Number(slotParam) : 1;
  const pathKey =
    slot === 3 ? 'payment3_receipt_path' : slot === 2 ? 'payment2_receipt_path' : 'payment_receipt_path';

  let stored: string | undefined;
  try {
    const fields = row.fields_json ? JSON.parse(row.fields_json) : {};
    stored = fields?.[pathKey];
  } catch {
    stored = undefined;
  }
  if (!stored) return NextResponse.json({ error: 'No payment receipt' }, { status: 404 });

  return imageResponseForStoredPath(stored);
}
