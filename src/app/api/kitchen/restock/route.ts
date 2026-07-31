import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDataOwnerId } from '@/lib/org-server';
import { restockRaw, getState } from '@/lib/kitchen-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await getDataOwnerId(session.userId);

  try {
    const body = await request.json();
    const deltas = Array.isArray(body.deltas) ? body.deltas : [];
    const finishedDeltas = Array.isArray(body.finishedDeltas) ? body.finishedDeltas : [];
    const result = await restockRaw(ownerId, session.userId, {
      deltas: deltas.map((d: { name?: string; qty?: number }) => ({
        name: String(d.name || ''),
        qty: Number(d.qty),
      })),
      finishedDeltas: finishedDeltas.map((d: { sku?: string; qty?: number }) => ({
        sku: String(d.sku || ''),
        qty: Number(d.qty),
      })),
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    const state = await getState(ownerId, { isAdmin: session.role === 'admin' });
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'Failed to restock' }, { status: 500 });
  }
}
