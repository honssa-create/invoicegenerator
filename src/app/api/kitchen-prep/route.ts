import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { createPrepOrder, listPrepOrders } from '@/lib/kitchen-prep-server';
import { PREP_CAPACITIES, PREP_ORDER_TYPES, isRedDateAllowed } from '@/lib/kitchen-prep';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ orders: listPrepOrders(session.userId) });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const capacity = PREP_CAPACITIES.includes(body.capacity) ? body.capacity : '45g';
    const order_type = PREP_ORDER_TYPES.includes(body.order_type) ? body.order_type : 'daily';
    if (!body.stewing_date) {
      return NextResponse.json({ error: 'Stewing date is required' }, { status: 400 });
    }
    const qtyRed = Number(body.qty_red_date) || 0;
    if (qtyRed > 0 && !isRedDateAllowed(capacity)) {
      return NextResponse.json({ error: 'Red Date (紅棗) is not allowed for 25g capacity' }, { status: 400 });
    }
    const order = createPrepOrder(session.userId, {
      stewing_date: body.stewing_date,
      order_type,
      capacity,
      qty_osmanthus: Number(body.qty_osmanthus) || 0,
      qty_red_date: qtyRed,
      qty_rock_sugar: Number(body.qty_rock_sugar) || 0,
      linked_order_id: body.linked_order_id ?? null,
      order_code: body.order_code,
      notes: body.notes,
    });
    return NextResponse.json({ order }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create prep order' }, { status: 500 });
  }
}
