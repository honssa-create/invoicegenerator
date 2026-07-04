import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { importFromOrder } from '@/lib/kitchen-prep-server';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const orderId = Number(body.order_id);
    if (!Number.isFinite(orderId)) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }
    const order = importFromOrder(session.userId, orderId);
    if (!order) return NextResponse.json({ error: 'Order not found or not importable' }, { status: 404 });
    return NextResponse.json({ order }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
