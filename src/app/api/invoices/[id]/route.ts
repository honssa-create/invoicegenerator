import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getInvoiceWithDetails } from '@/lib/invoices';

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

  return NextResponse.json({ invoice, business: user });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = db
    .prepare('SELECT id FROM invoices WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId);

  if (!existing) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { customer_id, issue_date, due_date, tax_rate, notes, terms, status, items } = body;

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

  const result = db
    .prepare('DELETE FROM invoices WHERE id = ? AND user_id = ?')
    .run(params.id, session.userId);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
