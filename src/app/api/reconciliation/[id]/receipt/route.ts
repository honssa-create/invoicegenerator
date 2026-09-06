import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { imageResponseForStoredPath } from '@/lib/stored-image';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const recordId = Number(params.id);
  if (!Number.isFinite(recordId)) {
    return NextResponse.json({ error: 'Invalid record id' }, { status: 400 });
  }

  const ownerId = await getDataOwnerId(session);
  const row = (await db
    .prepare('SELECT receipt_path FROM reconciliation_records WHERE id = ? AND user_id = ?')
    .get(recordId, ownerId)) as { receipt_path: string | null } | undefined;

  if (!row?.receipt_path) return NextResponse.json({ error: 'No receipt' }, { status: 404 });

  return imageResponseForStoredPath(row.receipt_path);
}
