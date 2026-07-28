import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getInvoiceWithDetails } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

/** Convert an invoice into a new order (mirrors quotation → order). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);
  const inv = getInvoiceWithDetails(params.id, ownerId);
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
    .map((i) => `• ${i.product_service || i.description} × ${i.quantity} @ ${i.unit_price}`)
    .join('\n');
  const first = inv.items[0];
  const firstName = (first?.product_service || first?.description || '').trim();
  const firstQty = first != null ? String(first.quantity ?? '') : '';
  const itemPart =
    firstName && firstQty !== '' ? `${firstName} x${firstQty}` : firstName || (firstQty !== '' ? `x${firstQty}` : '');
  const orderName = [(inv.customer_name || '').trim(), itemPart].filter(Boolean).join(' - ');

  const orderId = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO orders (user_id, po_number, name, description, status, customer_email, phone, shipping_address, notes, fields_json)
         VALUES (?, ?, ?, ?, '草稿', ?, ?, ?, ?, '{}')`,
      )
      .run(
        ownerId,
        (inv.order_no || '').trim() || null,
        orderName || inv.customer_name || null,
        null,
        inv.email || inv.customer_email || null,
        null,
        inv.shipping_address?.trim() ||
          [inv.customer_address, inv.customer_city, inv.customer_state, inv.customer_zip].filter(Boolean).join(', ') ||
          null,
        itemsSummary || null,
      );
    const oid = result.lastInsertRowid as number;

    // Link the invoice to the new order when it has no linked order yet.
    if (!inv.order_id) {
      db.prepare(
        "UPDATE invoices SET order_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
      ).run(oid, params.id, ownerId);
    }

    return oid;
  })();

  logActivity('invoice', params.id, session.userId, 'activity', session.name, 'converted to an order');
  logActivity('order', orderId, session.userId, 'activity', session.name, `created from invoice ${inv.invoice_number}`);
  return NextResponse.json({ target: 'order', id: orderId });
}
