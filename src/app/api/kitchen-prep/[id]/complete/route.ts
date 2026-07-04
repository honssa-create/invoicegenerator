import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { completePrepProduction, getPrepOrder } from '@/lib/kitchen-prep-server';
import { computePrepCalculation, type PrepCompletionSplit } from '@/lib/kitchen-prep';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = getPrepOrder(params.id, session.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status === 'completed') {
    return NextResponse.json({ error: 'This prep order is already completed' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const actualYield = Number(body.actual_yield);
    if (!Number.isFinite(actualYield) || actualYield < 0) {
      return NextResponse.json({ error: 'Actual yield must be a non-negative number' }, { status: 400 });
    }

    const splits: PrepCompletionSplit[] | undefined = Array.isArray(body.splits)
      ? body.splits.map((s: { label?: string; qty?: number }, i: number) => ({
          label: s.label || `Sub-order ${i + 1}`,
          qty: Number(s.qty) || 0,
        }))
      : undefined;

    const order = completePrepProduction(params.id, session.userId, session.name, {
      actual_yield: actualYield,
      completion_remarks: body.completion_remarks ?? null,
      splits,
    });

    if (!order) {
      return NextResponse.json({ error: 'Failed to complete production' }, { status: 500 });
    }

    const calculation = computePrepCalculation(order.capacity, order.order_type, {
      osmanthus: order.qty_osmanthus,
      red_date: order.qty_red_date,
      rock_sugar: order.qty_rock_sugar,
    });

    return NextResponse.json({ order, calculation });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to complete production';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
