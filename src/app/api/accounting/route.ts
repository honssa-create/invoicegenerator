import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import db from '@/lib/db';
import { listOrdersSummary } from '@/lib/order-server';
import { orderTitle } from '@/lib/orders';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const orders = await listOrdersSummary(ownerId, { withPaymentFields: true });

  const linkedRows = (await db
    .prepare(
      `SELECT order_id, MAX(id) AS linked_reconciliation_id
       FROM reconciliation_records
       WHERE user_id = ? AND status = 'Matched' AND order_id IS NOT NULL
       GROUP BY order_id`
    )
    .all(ownerId)) as { order_id: number; linked_reconciliation_id: number }[];

  const linkedByOrder = new Map(
    linkedRows.map((row) => [row.order_id, row.linked_reconciliation_id])
  );

  const entries = orders.map((o) => ({
    order_id: o.id,
    order_ref: o.reference_number,
    title: orderTitle(o),
    customer: o.name || '',
    order_type: (o.fields.order_type as string) || '',
    payment_date: (o.fields.payment_date as string) || '',
    amount: (o.fields.payment_amount as string) || '',
    bank: (o.fields.payment_bank as string) || '',
    method: (o.fields.payment_method_detail as string) || '',
    reference: (o.fields.payment_reference as string) || '',
    has_receipt: Boolean(o.fields.payment_receipt_path),
    payment_receipt_path: (o.fields.payment_receipt_path as string) || '',
    verified: o.fields.payment_verified === true || o.fields.payment_verified === 'true',
    linked_reconciliation_id: linkedByOrder.get(o.id) ?? null,
  }));

  return NextResponse.json({ entries });
}
