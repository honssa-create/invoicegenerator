import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { loadOrderDetailBootstrap } from '@/lib/order-detail-bootstrap-server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const payload = await loadOrderDetailBootstrap(ownerId, params.id);
  if (!payload) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(payload);
}
