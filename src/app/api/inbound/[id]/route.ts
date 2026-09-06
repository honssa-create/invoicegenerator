import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { trashInbound } from '@/lib/trash';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const ownerId = await getDataOwnerId(session);
    if (!await trashInbound(ownerId, Number(params.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
  } catch {
    return NextResponse.json({ error: 'Failed to delete shipment' }, { status: 500 });
  }
}
