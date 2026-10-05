import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { resolveKitchenOwnerUserId, allocateGiftBox } from '@/lib/kitchen-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerId = await resolveKitchenOwnerUserId();

  try {
    const body = await request.json();
    const orderId = Number(body.orderId);
    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    const result = await allocateGiftBox(ownerId, session.userId, {
      boxType: String(body.boxType || ''),
      quantity: Number(body.quantity),
      orderId,
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ state: result.state });
  } catch {
    return NextResponse.json({ error: 'Failed to allocate gift box' }, { status: 500 });
  }
}
