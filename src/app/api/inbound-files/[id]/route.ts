import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { imageResponseForStoredPath } from '@/lib/stored-image';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const row = db
    .prepare('SELECT photo_path FROM inbound_shipments WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { photo_path: string | null } | undefined;
  if (!row?.photo_path) return NextResponse.json({ error: 'No photo' }, { status: 404 });

  return imageResponseForStoredPath(row.photo_path);
}
