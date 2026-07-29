import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getQuotationWithDetails } from '@/lib/quotation-server';
import { createInvoiceFromQuotation } from '@/lib/quotation-to-invoice-server';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);
  const q = await getQuotationWithDetails(params.id, ownerId);
  if (!q) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  let target: string;
  try {
    ({ target } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (target === 'invoice') {
    if (!q.customer_id) {
      return NextResponse.json({ error: 'Set a customer on the quotation before converting to an invoice' }, { status: 400 });
    }

    const { invoiceId: invId, invoiceNumber: invNo } = await createInvoiceFromQuotation(q, ownerId);
    await db.prepare("UPDATE quotations SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(params.id);
    await logActivity('quotation', params.id, session.userId, 'activity', session.name, `converted to invoice ${invNo}`);
    await logActivity('invoice', invId, session.userId, 'activity', session.name, `created from quotation ${q.quote_number}`);
    return NextResponse.json({ target: 'invoice', id: invId });
  }

  if (target === 'order') {
    const itemsSummary = q.items.map((i) => `• ${i.product_service || ''} × ${i.quantity} @ $${i.unit_price}`).join('\n');
    const first = q.items[0];
    const firstName = (first?.product_service || '').trim();
    const firstQty = first != null ? String(first.quantity ?? '') : '';
    const itemPart =
      firstName && firstQty !== '' ? `${firstName} x${firstQty}` : firstName || (firstQty !== '' ? `x${firstQty}` : '');
    const orderName = [(q.customer_name || '').trim(), itemPart].filter(Boolean).join(' - ');
    const orderId = await db.transaction(async () => {
      const result = await db
        .prepare(
          `INSERT INTO orders (user_id, po_number, name, description, status, customer_email, phone, shipping_address, notes, fields_json, quotation_id)
           VALUES (?, ?, ?, ?, '草稿', ?, ?, ?, ?, '{}', ?)`
        )
        .run(
          ownerId,
          (q.order_no || '').trim() || null,
          orderName || q.customer_name || null,
          null,
          q.customer_email || null,
          null,
          q.shipping_address?.trim() ||
            [q.customer_address, q.customer_city, q.customer_state, q.customer_zip].filter(Boolean).join(', ') ||
            null,
          itemsSummary || null,
          q.id
        );
      return result.lastInsertRowid as number;
    });
    await db.prepare("UPDATE quotations SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(params.id);
    await logActivity('quotation', params.id, session.userId, 'activity', session.name, 'converted to an order');
    await logActivity('order', orderId, session.userId, 'activity', session.name, `created from quotation ${q.quote_number}`);
    return NextResponse.json({ target: 'order', id: orderId });
  }

  return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
}
