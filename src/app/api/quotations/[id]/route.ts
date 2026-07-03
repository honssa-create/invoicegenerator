import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getQuotationWithDetails } from '@/lib/quotation-server';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const quotation = getQuotationWithDetails(params.id, session.userId);
  if (!quotation) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  const business = db.prepare('SELECT name, company_name, email FROM users WHERE id = ?').get(session.userId);
  return NextResponse.json({ quotation, business });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = db
    .prepare('SELECT id, status FROM quotations WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { id: number; status: string } | undefined;
  if (!existing) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  try {
    const body = await request.json();
    const { customer_id, issue_date, valid_until, tax_rate, notes, terms, status, items } = body;

    const update = db.transaction(() => {
      const fields: string[] = [];
      const values: (string | number | null)[] = [];
      if (customer_id !== undefined) { fields.push('customer_id = ?'); values.push(customer_id || null); }
      if (issue_date !== undefined) { fields.push('issue_date = ?'); values.push(issue_date); }
      if (valid_until !== undefined) { fields.push('valid_until = ?'); values.push(valid_until?.trim() || null); }
      if (tax_rate !== undefined) { fields.push('tax_rate = ?'); values.push(tax_rate); }
      if (notes !== undefined) { fields.push('notes = ?'); values.push(notes?.trim() || null); }
      if (terms !== undefined) { fields.push('terms = ?'); values.push(terms?.trim() || null); }
      if (status !== undefined) { fields.push('status = ?'); values.push(status); }
      fields.push("updated_at = datetime('now')");
      values.push(params.id, session.userId);
      if (fields.length > 1) {
        db.prepare(`UPDATE quotations SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }
      if (items && Array.isArray(items)) {
        db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(params.id);
        const insertItem = db.prepare(
          'INSERT INTO quotation_items (quotation_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)'
        );
        for (const item of items) {
          if (!item.description?.trim()) continue;
          const qty = Number(item.quantity) || 0;
          const price = Number(item.unit_price) || 0;
          insertItem.run(params.id, item.description.trim(), qty, price, qty * price);
        }
      }
    });
    update();

    if (status !== undefined && status !== existing.status) {
      logActivity('quotation', params.id, session.userId, 'activity', session.name, `updated Status to ${status}`);
    }

    return NextResponse.json({ quotation: getQuotationWithDetails(params.id, session.userId) });
  } catch {
    return NextResponse.json({ error: 'Failed to update quotation' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = db.prepare('DELETE FROM quotations WHERE id = ? AND user_id = ?').run(params.id, session.userId);
  if (result.changes === 0) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
