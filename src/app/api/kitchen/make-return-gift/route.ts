import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, makeReturnGift, getState } from '@/lib/kitchen-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await resolveKitchenOwnerUserId();

  try {
    const body = await request.json();
    const orderId = Number(body.orderId);
    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    const result = await makeReturnGift(ownerId, session.userId, {
      orderId,
      lines: Array.isArray(body.lines)
        ? body.lines.map((l: { needKey?: string; qty?: number }) => ({
            needKey: String(l.needKey || ''),
            qty: Number(l.qty),
          }))
        : undefined,
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    const state = await getState(ownerId, { isAdmin: session.role === 'admin' });
    return NextResponse.json({ state });
  } catch {
    return NextResponse.json({ error: 'Failed to make return gift' }, { status: 500 });
  }
}
