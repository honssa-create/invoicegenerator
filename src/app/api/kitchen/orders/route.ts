import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { createDailyOrder, getState } from '@/lib/kitchen-server';
import { FINISHED_SKUS } from '@/lib/kitchen';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    if (!FINISHED_SKUS.includes(body.sku)) {
      return NextResponse.json({ error: 'Invalid SKU' }, { status: 400 });
    }
    const order = createDailyOrder(session.userId, {
      customer: body.customer,
      sku: body.sku,
      quantity: Number(body.quantity),
      source: body.source,
    });
    return NextResponse.json({ order, state: getState(session.userId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
