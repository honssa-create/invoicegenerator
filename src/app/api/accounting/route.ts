import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import db from '@/lib/db';
import { listOrdersSummary } from '@/lib/order-server';
import { expandOrderToPaymentEntries, orderTitle } from '@/lib/orders';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const orders = await listOrdersSummary(ownerId, { withPaymentFields: true });

  const linkedRows = (await db
    .prepare(
      `SELECT order_id, COALESCE(payment_slot, 1) AS payment_slot, MAX(id) AS linked_reconciliation_id
       FROM reconciliation_records
       WHERE user_id = ? AND status = 'Matched' AND order_id IS NOT NULL
       GROUP BY order_id, COALESCE(payment_slot, 1)`
    )
    .all(ownerId)) as { order_id: number; payment_slot: number; linked_reconciliation_id: number }[];

  const linkedByOrderSlot = new Map(
    linkedRows.map((row) => [`${row.order_id}-${row.payment_slot}`, row.linked_reconciliation_id])
  );

  const entries = orders.flatMap((o) =>
    expandOrderToPaymentEntries(o, {
      title: orderTitle(o),
      linkedByOrderSlot,
    })
  );

  return NextResponse.json({ entries });
}
