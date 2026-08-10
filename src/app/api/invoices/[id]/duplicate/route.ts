import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getInvoiceWithDetails, nextInvoiceNumberAfter } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';
import { logActivity } from '@/lib/activity';

/** Duplicate an invoice with invoice_number = source + 1 (next free if taken). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);
  const source = await getInvoiceWithDetails(params.id, ownerId);
  if (!source) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  try {
    const { newId, invoiceNumber } = await db.transaction(async () => {
      const invoiceNumber = await nextInvoiceNumberAfter(ownerId, source.invoice_number);
      const result = await db
        .prepare(
          `INSERT INTO invoices (
             user_id, customer_id, invoice_number, status, issue_date, due_date, tax_rate, notes, terms,
             billing_address, shipping_address, email, send_later, ship_via, shipping_date, tracking_no, order_no,
             receipt_date, currency, discount_type, discount_value, shipping_amount, term
           ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          source.customer_id,
          invoiceNumber,
          source.issue_date,
          source.due_date,
          source.tax_rate,
          source.notes,
          source.terms,
          source.billing_address,
          source.shipping_address,
          source.email,
          source.send_later ? 1 : 0,
          source.ship_via,
          source.shipping_date,
          source.tracking_no,
          source.order_no,
          source.receipt_date,
          source.currency || 'HKD',
          source.discount_type === 'amount' ? 'amount' : 'percent',
          Number(source.discount_value) || 0,
          Number(source.shipping_amount) || 0,
          source.term || 'NET30',
        );
      const invId = result.lastInsertRowid as number;

      const insertItem = db.prepare(
        `INSERT INTO invoice_items (
           invoice_id, service_date, product_service, description, quantity, unit_price, amount, class_name
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const item of source.items) {
        await insertItem.run(
          invId,
          item.service_date,
          item.product_service,
          item.description,
          item.quantity,
          item.unit_price,
          item.amount,
          item.class_name,
        );
      }

      const insertFile = db.prepare(
        'INSERT INTO invoice_files (invoice_id, user_id, path, original_name) VALUES (?, ?, ?, ?)',
      );
      for (const f of source.files || []) {
        await insertFile.run(invId, ownerId, f.path, f.original_name);
      }

      return { newId: invId, invoiceNumber };
    });

    await logActivity(
      'invoice',
      params.id,
      session.userId,
      'activity',
      session.name,
      `duplicated as ${invoiceNumber}`,
    );
    await logActivity(
      'invoice',
      newId,
      session.userId,
      'activity',
      session.name,
      `created by duplicating ${source.invoice_number}`,
    );

    return NextResponse.json(
      { id: newId, invoice_number: invoiceNumber, invoice: await getInvoiceWithDetails(newId, ownerId) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to duplicate invoice' }, { status: 500 });
  }
}
