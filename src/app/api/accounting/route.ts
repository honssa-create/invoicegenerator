import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { listOrders } from '@/lib/order-server';
import { orderTitle } from '@/lib/orders';

const PAYMENT_KEYS = ['payment_date', 'payment_amount', 'payment_bank', 'payment_method_detail', 'payment_reference', 'payment_receipt_path'];

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orders = listOrders(session.userId);
  const entries = orders
    .filter((o) => PAYMENT_KEYS.some((k) => o.fields[k] !== undefined && String(o.fields[k]).trim() !== ''))
    .map((o) => ({
      order_id: o.id,
      order_ref: o.po_number || `#${o.id}`,
      title: orderTitle(o),
      customer: o.name || '',
      order_type: (o.fields.order_type as string) || '',
      payment_date: (o.fields.payment_date as string) || '',
      amount: (o.fields.payment_amount as string) || '',
      bank: (o.fields.payment_bank as string) || '',
      method: (o.fields.payment_method_detail as string) || '',
      reference: (o.fields.payment_reference as string) || '',
      has_receipt: Boolean(o.fields.payment_receipt_path),
      verified: o.fields.payment_verified === true || o.fields.payment_verified === 'true',
    }));

  return NextResponse.json({ entries });
}
