import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { createPrepOrder, createPrepOrdersBatch, listPrepOrders } from '@/lib/kitchen-prep-server';
import { PREP_CAPACITIES, PREP_ORDER_TYPES, validatePrepFlavorQtys } from '@/lib/kitchen-prep';

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
    const order_type = PREP_ORDER_TYPES.includes(body.order_type) ? body.order_type : 'daily';
    if (!body.stewing_date) {
      return NextResponse.json({ error: 'Stewing date is required' }, { status: 400 });
    }

    if (Array.isArray(body.lines) && body.lines.length > 0) {
      const lines = body.lines
        .filter((line: { capacity?: string }) =>
          line.capacity && (PREP_CAPACITIES as readonly string[]).includes(line.capacity)
        )
        .map((line: {
          capacity: string;
          qty_osmanthus?: number;
          qty_red_date?: number;
          qty_rock_sugar?: number;
        }) => ({
          capacity: line.capacity as (typeof PREP_CAPACITIES)[number],
          qty_osmanthus: Number(line.qty_osmanthus) || 0,
          qty_red_date: Number(line.qty_red_date) || 0,
          qty_rock_sugar: Number(line.qty_rock_sugar) || 0,
        }));

      if (lines.length === 0) {
        return NextResponse.json({ error: 'At least one valid capacity line is required' }, { status: 400 });
      }

      const orders = createPrepOrdersBatch(session.userId, {
        stewing_date: body.stewing_date,
        order_type,
        linked_order_id: body.linked_order_id ?? null,
        order_code: body.order_code,
        notes: body.notes,
        lines,
      });

      return NextResponse.json({ orders, order: orders[0] }, { status: 201 });
    }

    const capacity = PREP_CAPACITIES.includes(body.capacity) ? body.capacity : '45g';
    const qtys = {
      osmanthus: Number(body.qty_osmanthus) || 0,
      red_date: Number(body.qty_red_date) || 0,
      rock_sugar: Number(body.qty_rock_sugar) || 0,
    };
    const validationErr = validatePrepFlavorQtys(capacity, qtys);
    if (validationErr) {
      return NextResponse.json({ error: validationErr }, { status: 400 });
    }

    const order = createPrepOrder(session.userId, {
      stewing_date: body.stewing_date,
      order_type,
      capacity,
      qty_osmanthus: qtys.osmanthus,
      qty_red_date: qtys.red_date,
      qty_rock_sugar: qtys.rock_sugar,
      linked_order_id: body.linked_order_id ?? null,
      order_code: body.order_code,
      notes: body.notes,
    });
    return NextResponse.json({ order, orders: [order] }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create prep order';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
