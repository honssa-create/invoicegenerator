import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getInvoiceWithDetails } from '@/lib/invoices';
import { trashInvoice } from '@/lib/trash';
import { logActivity } from '@/lib/activity';

function linkedOrder(orderId: number | null | undefined, userId: number) {
  if (!orderId) return null;
  return (
    db
      .prepare('SELECT id, po_number, name, description FROM orders WHERE id = ? AND user_id = ?')
      .get(orderId, userId) || null
  );
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const invoice = getInvoiceWithDetails(Number(params.id), session.userId);
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const user = db
    .prepare('SELECT name, company_name, email FROM users WHERE id = ?')
    .get(session.userId);

  const orderRow = db
    .prepare('SELECT order_id FROM invoices WHERE id = ?')
    .get(params.id) as { order_id: number | null };

  return NextResponse.json({
    invoice: { ...invoice, order_id: orderRow?.order_id ?? null },
    business: user,
    linkedOrder: linkedOrder(orderRow?.order_id, session.userId),
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = db
    .prepare('SELECT id, status, order_id FROM invoices WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { id: number; status: string; order_id: number | null } | undefined;

  if (!existing) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { customer_id, issue_date, due_date, tax_rate, notes, terms, status, items, order_id } = body;

    if (customer_id) {
      const customer = db
        .prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?')
        .get(customer_id, session.userId);
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
    }

    const updateInvoice = db.transaction(() => {
      const fields: string[] = [];
      const values: (string | number | null)[] = [];

      if (customer_id !== undefined) { fields.push('customer_id = ?'); values.push(customer_id); }
      if (issue_date !== undefined) { fields.push('issue_date = ?'); values.push(issue_date); }
      if (due_date !== undefined) { fields.push('due_date = ?'); values.push(due_date); }
      if (tax_rate !== undefined) { fields.push('tax_rate = ?'); values.push(tax_rate); }
      if (notes !== undefined) { fields.push('notes = ?'); values.push(notes?.trim() || null); }
      if (terms !== undefined) { fields.push('terms = ?'); values.push(terms?.trim() || null); }
      if (status !== undefined) { fields.push('status = ?'); values.push(status); }
      if (order_id !== undefined) { fields.push('order_id = ?'); values.push(order_id || null); }

      fields.push("updated_at = datetime('now')");
      values.push(params.id, session.userId);

      if (fields.length > 1) {
        db.prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }

      if (items && Array.isArray(items)) {
        db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(params.id);
        const insertItem = db.prepare(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
           VALUES (?, ?, ?, ?, ?)`
        );
        for (const item of items) {
          const qty = Number(item.quantity) || 0;
          const price = Number(item.unit_price) || 0;
          insertItem.run(params.id, item.description.trim(), qty, price, qty * price);
        }
      }
    });

    updateInvoice();

    // Activity logging on the invoice, plus mirror to the linked order.
    if (status !== undefined && status !== existing.status) {
      logActivity('invoice', params.id, session.userId, 'activity', session.name, `updated Status to ${status}`);
    }
    if (order_id !== undefined && (order_id || null) !== existing.order_id) {
      if (order_id) {
        logActivity('invoice', params.id, session.userId, 'activity', session.name, `linked to order #${order_id}`);
        logActivity('order', order_id, session.userId, 'activity', session.name, `linked invoice #${params.id}`);
      } else {
        logActivity('invoice', params.id, session.userId, 'activity', session.name, 'unlinked from order');
      }
    }

    const invoice = getInvoiceWithDetails(Number(params.id), session.userId);
    return NextResponse.json({ invoice });
  } catch {
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!trashInvoice(session.userId, Number(params.id))) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
