import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const existing = (await db
    .prepare(
      `SELECT id, source_platform, attended_at FROM orders WHERE id = ? AND user_id = ?`
    )
    .get(params.id, ownerId)) as
    | { id: number; source_platform: string | null; attended_at: string | null }
    | undefined;
  if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const platform = (existing.source_platform || 'manual').trim();
  if (platform === 'manual') {
    return NextResponse.json({ attended: false, attended_at: existing.attended_at });
  }
  if (existing.attended_at) {
    return NextResponse.json({ attended: true, attended_at: existing.attended_at });
  }

  await db
    .prepare(
      `UPDATE orders SET attended_at = to_char(NOW() AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI:SS')
       WHERE id = ? AND user_id = ? AND attended_at IS NULL AND source_platform <> 'manual'`
    )
    .run(params.id, ownerId);

  const updated = (await db
    .prepare(`SELECT attended_at FROM orders WHERE id = ? AND user_id = ?`)
    .get(params.id, ownerId)) as { attended_at: string | null } | undefined;

  return NextResponse.json({ attended: true, attended_at: updated?.attended_at || null });
}
