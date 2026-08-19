import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { listOrdersSummary } from '@/lib/order-server';
import { orderTitle } from '@/lib/orders';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const orders = await listOrdersSummary(ownerId, { withPaymentFields: true });
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
  }));

  return NextResponse.json({ entries });
}
