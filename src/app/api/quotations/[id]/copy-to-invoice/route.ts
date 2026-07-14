import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getQuotationWithDetails } from '@/lib/quotation-server';
import { generateInvoiceNumber } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

// Copy a quotation into a BRAND NEW invoice. The source quotation (and its line
// items) is only read here — it is never modified.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);
  const quote = getQuotationWithDetails(params.id, ownerId);
  if (!quote) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  // Client details (name, email, phone, shipping address) are carried through the
  // shared customer record, so the invoice must reference a customer.
  if (!quote.customer_id) {
    return NextResponse.json(
      { error: 'Add a customer to the quotation first — client name, email, phone and address are copied from it.' },
      { status: 400 }
    );
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
      .run(ownerId, quote.customer_id, invoiceNumber, today, due, quote.tax_rate, quote.notes, quote.terms);
    const invoiceId = result.lastInsertRowid as number;

    const insertItem = db.prepare(
      'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount) VALUES (?, ?, ?, ?, ?)'
    );
    for (const it of quote.items) {
      insertItem.run(invoiceId, it.description, it.quantity, it.unit_price, it.amount);
    }
    return { invoiceId, invoiceNumber };
  });

  const { invoiceId, invoiceNumber: invNo } = create();

  // Activity logging on both records (the quotation row itself stays untouched).
  logActivity('quotation', params.id, session.userId, 'activity', session.name, `converted Quotation ${quote.quote_number} to a new Invoice`);
  logActivity('invoice', invoiceId, session.userId, 'activity', session.name, `created by copying quotation ${quote.quote_number}`);

  return NextResponse.json({ id: invoiceId, invoice_number: invNo }, { status: 201 });
}
