import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getDataOwnerId } from '@/lib/org-server';
import { trashOrder } from '@/lib/trash';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);

  try {
    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No order ids provided' }, { status: 400 });
    }

    const uniqueIds = Array.from(
      new Set(
        ids
          .map((id: unknown) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    if (!uniqueIds.length) {
      return NextResponse.json({ error: 'No order ids provided' }, { status: 400 });
    }

    let deleted = 0;
    const not_found: number[] = [];
    for (const id of uniqueIds) {
      if (await trashOrder(ownerId, id)) deleted++;
      else not_found.push(id);
    }

    return NextResponse.json({ deleted, not_found, retention_days: 60 });
  } catch {
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 });
  }
}
