import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { generateInvoiceNumber, getInvoiceWithDetails } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = getDataOwnerId(session.userId);
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let query = 'SELECT id FROM invoices WHERE user_id = ?';
  const queryParams: (string | number)[] = [ownerId];

  if (status) {
    query += ' AND status = ?';
    queryParams.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...queryParams) as { id: number }[];
  const invoices = rows.map((r) => getInvoiceWithDetails(r.id, ownerId)).filter(Boolean);

  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);

  try {
    const body = await request.json();
    const {
      customer_id,
      issue_date,
      due_date,
      tax_rate = 0,
      notes,
      terms,
      status = 'draft',
      items = [],
    } = body;

    if (!customer_id || !issue_date || !due_date) {
      return NextResponse.json(
        { error: 'Customer, issue date, and due date are required' },
        { status: 400 }
      );
    }

    const customer = db
      .prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?')
      .get(customer_id, ownerId);

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (!items.length) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    const invoiceNumber = generateInvoiceNumber(ownerId);

    const createInvoice = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO invoices (user_id, customer_id, invoice_number, status, issue_date, due_date, tax_rate, notes, terms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ownerId,
          customer_id,
          invoiceNumber,
          status,
          issue_date,
          due_date,
          tax_rate,
          notes?.trim() || null,
          terms?.trim() || null
        );

      const invoiceId = result.lastInsertRowid as number;
      const insertItem = db.prepare(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
         VALUES (?, ?, ?, ?, ?)`
      );

      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unit_price) || 0;
        insertItem.run(invoiceId, item.description.trim(), qty, price, qty * price);
      }

      return invoiceId;
    });

    const invoiceId = createInvoice();
    logActivity('invoice', invoiceId, session.userId, 'activity', session.name, `created this invoice (${invoiceNumber})`);
    const invoice = getInvoiceWithDetails(invoiceId, ownerId);

    return NextResponse.json({ invoice }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
