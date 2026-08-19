import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { generateInvoiceNumber, getInvoiceWithDetails, listInvoices, listInvoiceOptions } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const { searchParams } = new URL(request.url);
  if (searchParams.get('fields') === 'options') {
    return NextResponse.json({ invoices: await listInvoiceOptions(ownerId) });
  }
  const status = searchParams.get('status') || undefined;

  const invoices = await listInvoices(ownerId, status ? { status } : {});
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);

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

    const customer = await db
      .prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?')
      .get(customer_id, ownerId);

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const lineItems = (Array.isArray(items) ? items : [])
      .map((item: { description?: unknown; quantity?: unknown; unit_price?: unknown }) => ({
        description: String(item?.description ?? '').trim(),
        quantity: Number(item?.quantity) || 0,
        unit_price: Number(item?.unit_price) || 0,
      }))
      .filter((item) => item.description);

    if (!lineItems.length) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }

    const { invoiceId, invoiceNumber } = await db.transaction(async () => {
      const invoiceNumber = await generateInvoiceNumber(ownerId);
      const result = await db
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

      const invoiceId = Number(result.lastInsertRowid);
      if (!invoiceId) {
        throw new Error('Invoice insert did not return an id');
      }
      const insertItem = db.prepare(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
         VALUES (?, ?, ?, ?, ?)`
      );

      for (const item of lineItems) {
        await insertItem.run(
          invoiceId,
          item.description,
          item.quantity,
          item.unit_price,
          item.quantity * item.unit_price,
        );
      }

      return { invoiceId, invoiceNumber };
    });

    await logActivity('invoice', invoiceId, session.userId, 'activity', session.name, `created this invoice (${invoiceNumber})`);
    const invoice = await getInvoiceWithDetails(invoiceId, ownerId);
    if (!invoice) {
      throw new Error('Invoice was created but could not be reloaded');
    }

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/invoices]', err);
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
