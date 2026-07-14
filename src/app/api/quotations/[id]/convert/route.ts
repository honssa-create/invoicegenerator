import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getQuotationWithDetails } from '@/lib/quotation-server';
import { generateInvoiceNumber } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);
  const q = getQuotationWithDetails(params.id, ownerId);
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
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const invoiceNumber = generateInvoiceNumber(ownerId);

    const create = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO invoices (user_id, customer_id, invoice_number, status, issue_date, due_date, tax_rate, notes, terms)
           VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
        )
        .run(ownerId, q.customer_id, invoiceNumber, today, due, q.tax_rate, q.notes, q.terms);
      const invId = result.lastInsertRowid as number;
      const insertItem = db.prepare(
        'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)'
      );
      for (const it of q.items) insertItem.run(invId, it.description, it.quantity, it.unit_price, it.amount);
      return { invId, invoiceNumber };
    });

    const { invId, invoiceNumber: invNo } = create();
    db.prepare("UPDATE quotations SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(params.id);
    logActivity('quotation', params.id, session.userId, 'activity', session.name, `converted to invoice ${invNo}`);
    logActivity('invoice', invId, session.userId, 'activity', session.name, `created from quotation ${q.quote_number}`);
    return NextResponse.json({ target: 'invoice', id: invId });
  }

  if (target === 'order') {
    const itemsSummary = q.items.map((i) => `• ${i.description} × ${i.quantity} @ ${i.unit_price}`).join('\n');
    const create = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO orders (user_id, po_number, name, description, status, customer_email, phone, shipping_address, notes, fields_json, quotation_id)
           VALUES (?, ?, ?, ?, '草稿', ?, ?, ?, ?, '{}', ?)`
        )
        .run(
          session.userId,
          q.quote_number,
          q.customer_name || null,
          `From ${q.quote_number}`,
          q.customer_email || null,
          null,
          [q.customer_address, q.customer_city, q.customer_state, q.customer_zip].filter(Boolean).join(', ') || null,
          itemsSummary || null,
          q.id
        );
      return result.lastInsertRowid as number;
    });
    const orderId = create();
    // Give the order a proper receipt-style number is not needed; orders use their own ids.
    db.prepare("UPDATE quotations SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(params.id);
    logActivity('quotation', params.id, session.userId, 'activity', session.name, 'converted to an order');
    logActivity('order', orderId, session.userId, 'activity', session.name, `created from quotation ${q.quote_number}`);
    return NextResponse.json({ target: 'order', id: orderId });
  }

  return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
}
