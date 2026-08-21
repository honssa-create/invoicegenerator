import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getInvoiceWithDetails } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';
import { allocateGlobalRecordNumber } from '@/lib/record-numbering';
import { getOrder } from '@/lib/order-server';
import { trySyncCustomerFromOrderRecord } from '@/lib/customer-server';

/** Convert an invoice into a new order (mirrors quotation → order). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  const inv = await getInvoiceWithDetails(params.id, ownerId);
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  let target: string;
  try {
    ({ target } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (target !== 'order') {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  }

  const itemsSummary = inv.items
    .map((i) => `• ${i.product_service || ''} × ${i.quantity} @ $${i.unit_price}`)
    .join('\n');
  const first = inv.items[0];
  const firstName = (first?.product_service || '').trim();
  const firstQty = first != null ? String(first.quantity ?? '') : '';
  const itemPart =
    firstName && firstQty !== '' ? `${firstName} x${firstQty}` : firstName || (firstQty !== '' ? `x${firstQty}` : '');
  const orderName = [(inv.customer_name || '').trim(), itemPart].filter(Boolean).join(' - ');

  const { orderId, referenceNumber } = await db.transaction(async () => {
    const referenceNumber = await allocateGlobalRecordNumber('order');
    const result = await db
      .prepare(
        `INSERT INTO orders (
           user_id, reference_number, po_number, name, description, status,
           customer_email, phone, shipping_address, notes, fields_json
         ) VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, '{}')`,
      )
      .run(
        ownerId,
        referenceNumber,
        (inv.order_no || '').trim() || null,
        orderName || inv.customer_name || null,
        null,
        inv.email || inv.customer_email || null,
        null,
        inv.shipping_address?.trim() || inv.customer_address?.trim() || null,
        itemsSummary || null,
      );
    const oid = result.lastInsertRowid as number;

    // Link the invoice to the new order when it has no linked order yet.
    if (!inv.order_id) {
      await db.prepare(
        "UPDATE invoices SET order_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
      ).run(oid, params.id, ownerId);
    }

    return { orderId: oid, referenceNumber };
  });

  const order = await getOrder(orderId, ownerId);
  if (order && inv.customer_name?.trim()) {
    await trySyncCustomerFromOrderRecord(ownerId, order, inv.customer_name.trim());
  }

  await logActivity('invoice', params.id, session.userId, 'activity', session.name, `converted to order ${referenceNumber}`);
  await logActivity('order', orderId, session.userId, 'activity', session.name, `created from invoice ${inv.invoice_number}`);
  return NextResponse.json({ target: 'order', id: orderId });
}
