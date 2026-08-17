import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getInvoiceWithDetails } from '@/lib/invoices';
import { getDataOwnerId } from '@/lib/org-server';
import { trashInvoice } from '@/lib/trash';
import { logActivity } from '@/lib/activity';

async function linkedOrder(orderId: number | null | undefined, ownerId: number) {
  if (!orderId) return null;
  const row = (await db
    .prepare(
      'SELECT id, reference_number, po_number, name, description, fields_json FROM orders WHERE id = ? AND user_id = ?',
    )
    .get(orderId, ownerId)) as
    | {
        id: number;
        reference_number: string;
        po_number: string | null;
        name: string | null;
        description: string | null;
        fields_json: string | null;
      }
    | undefined;
  if (!row) return null;

  let fields: Record<string, string | boolean> = {};
  try {
    fields = row.fields_json ? (JSON.parse(row.fields_json) as Record<string, string | boolean>) : {};
  } catch {
    fields = {};
  }

  return {
    id: row.id,
    reference_number: row.reference_number,
    po_number: row.po_number,
    name: row.name,
    description: row.description,
    fields,
  };
}

function pushField(
  fields: string[],
  values: (string | number | null)[],
  column: string,
  value: unknown,
  transform: (v: unknown) => string | number | null = (v) =>
    typeof v === 'string' ? v.trim() || null : (v as string | number | null),
) {
  fields.push(`${column} = ?`);
  values.push(transform(value));
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = await getDataOwnerId(session);
  const invoice = await getInvoiceWithDetails(Number(params.id), ownerId);
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const user = await db
    .prepare('SELECT name, company_name, email FROM users WHERE id = ?')
    .get(ownerId);

  return NextResponse.json({
    invoice,
    business: user,
    linkedOrder: await linkedOrder(invoice.order_id, ownerId),
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);

  const existing = await db
    .prepare('SELECT id, invoice_number, status, order_id FROM invoices WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId) as
      | { id: number; invoice_number: string; status: string; order_id: number | null }
      | undefined;

  if (!existing) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const {
      customer_id,
      issue_date,
      due_date,
      tax_rate,
      notes,
      terms,
      billing_address,
      shipping_address,
      email,
      send_later,
      ship_via,
      shipping_date,
      tracking_no,
      order_no,
      receipt_date,
      currency,
      discount_type,
      discount_value,
      shipping_amount,
      term,
      status,
      items,
      order_id,
    } = body;

    if (customer_id) {
      const customer = await db
        .prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?')
        .get(customer_id, ownerId);
      if (!customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
    }

    await db.transaction(async () => {
      const fields: string[] = [];
      const values: (string | number | null)[] = [];

      if (customer_id !== undefined) pushField(fields, values, 'customer_id', customer_id, (v) => v as number);
      if (issue_date !== undefined) pushField(fields, values, 'issue_date', issue_date, (v) => String(v));
      if (due_date !== undefined) pushField(fields, values, 'due_date', due_date, (v) => String(v));
      if (tax_rate !== undefined) pushField(fields, values, 'tax_rate', tax_rate, (v) => Number(v) || 0);
      if (notes !== undefined) pushField(fields, values, 'notes', notes);
      if (terms !== undefined) pushField(fields, values, 'terms', terms);
      if (billing_address !== undefined) pushField(fields, values, 'billing_address', billing_address);
      if (shipping_address !== undefined) pushField(fields, values, 'shipping_address', shipping_address);
      if (email !== undefined) pushField(fields, values, 'email', email);
      if (send_later !== undefined) pushField(fields, values, 'send_later', send_later ? 1 : 0, (v) => Number(v) || 0);
      if (ship_via !== undefined) pushField(fields, values, 'ship_via', ship_via);
      if (shipping_date !== undefined) pushField(fields, values, 'shipping_date', shipping_date);
      if (tracking_no !== undefined) pushField(fields, values, 'tracking_no', tracking_no);
      if (order_no !== undefined) pushField(fields, values, 'order_no', order_no);
      if (receipt_date !== undefined) pushField(fields, values, 'receipt_date', receipt_date);
      if (currency !== undefined) pushField(fields, values, 'currency', currency || 'HKD', (v) => String(v || 'HKD'));
      if (discount_type !== undefined) {
        pushField(fields, values, 'discount_type', discount_type === 'amount' ? 'amount' : 'percent', (v) => String(v));
      }
      if (discount_value !== undefined) pushField(fields, values, 'discount_value', discount_value, (v) => Number(v) || 0);
      if (shipping_amount !== undefined) pushField(fields, values, 'shipping_amount', shipping_amount, (v) => Number(v) || 0);
      if (term !== undefined) pushField(fields, values, 'term', term || 'NET30', (v) => String(v || 'NET30'));
      if (status !== undefined) pushField(fields, values, 'status', status, (v) => String(v));
      if (order_id !== undefined) pushField(fields, values, 'order_id', order_id || null, (v) => v as number | null);

      fields.push("updated_at = datetime('now')");
      values.push(params.id, ownerId);

      if (fields.length > 1) {
        await db.prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }

      if (items && Array.isArray(items)) {
        await db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(params.id);
        const insertItem = db.prepare(
          `INSERT INTO invoice_items (
             invoice_id, service_date, product_service, description, quantity, unit_price, amount, class_name
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const item of items) {
          const desc = String(item.description || item.product_service || '').trim();
          if (!desc && !String(item.product_service || '').trim()) continue;
          const qty = Number(item.quantity) || 0;
          const price = Number(item.unit_price) || 0;
          await insertItem.run(
            params.id,
            item.service_date?.trim() || null,
            item.product_service?.trim() || null,
            desc || item.product_service?.trim() || '',
            qty,
            price,
            qty * price,
            item.class_name?.trim() || null,
          );
        }
      }
    });

    if (status !== undefined && status !== existing.status) {
      await logActivity('invoice', params.id, session.userId, 'activity', session.name, `updated Status to ${status}`);
    }
    if (order_id !== undefined && (order_id || null) !== existing.order_id) {
      if (order_id) {
        const order = await linkedOrder(order_id, ownerId);
        await logActivity(
          'invoice',
          params.id,
          session.userId,
          'activity',
          session.name,
          `linked to order ${order?.reference_number || order_id}`,
        );
        await logActivity(
          'order',
          order_id,
          session.userId,
          'activity',
          session.name,
          `linked invoice ${existing.invoice_number}`,
        );
      } else {
        await logActivity('invoice', params.id, session.userId, 'activity', session.name, 'unlinked from order');
      }
    }

    const invoice = await getInvoiceWithDetails(Number(params.id), ownerId);
    return NextResponse.json({
      invoice,
      linkedOrder: await linkedOrder(invoice?.order_id, ownerId),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'invoices', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);
  if (!await trashInvoice(ownerId, Number(params.id))) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
