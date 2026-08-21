import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import {
  completePrepProduction,
  getPrepOrder,
  resolveKitchenOwnerUserId,
} from '@/lib/kitchen-prep-server';
import { computePrepCalculationForOrder, type PrepCompletionSplit } from '@/lib/kitchen-prep';
import { loadKitchenCatalog } from '@/lib/kitchen-catalog-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await getPrepOrder(params.id);
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
      ? body.splits.map((s: { label?: string; qty?: number; flavor?: string }, i: number) => ({
          label: s.label || `Sub-order ${i + 1}`,
          qty: Number(s.qty) || 0,
          flavor: s.flavor as PrepCompletionSplit['flavor'] | undefined,
        }))
      : undefined;

    const order = await completePrepProduction(params.id, session.userId, session.name, {
      actual_yield: actualYield,
      completion_remarks: body.completion_remarks ?? null,
      splits,
    });

    if (!order) {
      return NextResponse.json({ error: 'Failed to complete production' }, { status: 500 });
    }

    const kitchenOwnerId = await resolveKitchenOwnerUserId();
    const { formulas } = await loadKitchenCatalog(kitchenOwnerId);
    const calculation = computePrepCalculationForOrder(order, formulas.stewFormulas);

    return NextResponse.json({ order, calculation });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to complete production';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
