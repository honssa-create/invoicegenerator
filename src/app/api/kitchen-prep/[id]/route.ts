import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { deletePrepOrder, getPrepOrder, updatePrepOrder } from '@/lib/kitchen-prep-server';
import { PREP_CAPACITIES, PREP_ORDER_TYPES, PREP_STATUSES, computePrepCalculation, isRedDateAllowed } from '@/lib/kitchen-prep';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const order = getPrepOrder(params.id, session.userId);
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const calculation = computePrepCalculation(order.capacity, order.order_type, {
    osmanthus: order.qty_osmanthus,
    red_date: order.qty_red_date,
    rock_sugar: order.qty_rock_sugar,
  });

  return NextResponse.json({ order, calculation });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const existing = getPrepOrder(params.id, session.userId);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const capacity = PREP_CAPACITIES.includes(body.capacity) ? body.capacity : existing.capacity;
    const qtyRed = body.qty_red_date !== undefined ? Number(body.qty_red_date) : existing.qty_red_date;
    if (qtyRed > 0 && !isRedDateAllowed(capacity)) {
      return NextResponse.json({ error: 'Red Date (紅棗) is not allowed for 25g capacity' }, { status: 400 });
    }

    const order = updatePrepOrder(params.id, session.userId, {
      stewing_date: body.stewing_date,
      order_type: PREP_ORDER_TYPES.includes(body.order_type) ? body.order_type : undefined,
      capacity,
      status: PREP_STATUSES.includes(body.status) ? body.status : undefined,
      qty_osmanthus: body.qty_osmanthus !== undefined ? Number(body.qty_osmanthus) : undefined,
      qty_red_date: body.qty_red_date !== undefined ? qtyRed : undefined,
      qty_rock_sugar: body.qty_rock_sugar !== undefined ? Number(body.qty_rock_sugar) : undefined,
      notes: body.notes,
    });

    const calculation = computePrepCalculation(order!.capacity, order!.order_type, {
      osmanthus: order!.qty_osmanthus,
      red_date: order!.qty_red_date,
      rock_sugar: order!.qty_rock_sugar,
    });

    return NextResponse.json({ order, calculation });
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!deletePrepOrder(params.id, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
