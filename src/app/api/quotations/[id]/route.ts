import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getQuotationWithDetails } from '@/lib/quotation-server';
import { getDataOwnerId } from '@/lib/org-server';
import { trashQuotation } from '@/lib/trash';
import { logActivity } from '@/lib/activity';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = getDataOwnerId(session.userId);
  const quotation = getQuotationWithDetails(params.id, ownerId);
  if (!quotation) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  const business = db.prepare('SELECT name, company_name, email FROM users WHERE id = ?').get(ownerId);
  return NextResponse.json({ quotation, business });
}

function pushField(
  fields: string[],
  values: (string | number | null)[],
  column: string,
  value: unknown,
  transform: (v: unknown) => string | number | null = (v) =>
    typeof v === 'string' ? v.trim() || null : (v as string | number | null)
) {
  fields.push(`${column} = ?`);
  values.push(transform(value));
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);

  const existing = db
    .prepare('SELECT id, status FROM quotations WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId) as { id: number; status: string } | undefined;
  if (!existing) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });

  try {
    const body = await request.json();
    const {
      customer_id,
      issue_date,
      valid_until,
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
      status,
      items,
    } = body;

    const update = db.transaction(() => {
      const fields: string[] = [];
      const values: (string | number | null)[] = [];
      if (customer_id !== undefined) pushField(fields, values, 'customer_id', customer_id || null, (v) => v as number | null);
      if (issue_date !== undefined) pushField(fields, values, 'issue_date', issue_date, (v) => String(v));
      if (valid_until !== undefined) pushField(fields, values, 'valid_until', valid_until);
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
      if (status !== undefined) pushField(fields, values, 'status', status, (v) => String(v));
      fields.push("updated_at = datetime('now')");
      values.push(params.id, ownerId);
      if (fields.length > 1) {
        db.prepare(`UPDATE quotations SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }
      if (items && Array.isArray(items)) {
        db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(params.id);
        const insertItem = db.prepare(
          `INSERT INTO quotation_items (
             quotation_id, service_date, product_service, description, quantity, unit_price, amount, class_name
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const item of items) {
          const desc = String(item.description || item.product_service || '').trim();
          if (!desc && !String(item.product_service || '').trim()) continue;
          const qty = Number(item.quantity) || 0;
          const price = Number(item.unit_price) || 0;
          insertItem.run(
            params.id,
            item.service_date?.trim() || null,
            item.product_service?.trim() || null,
            desc || item.product_service?.trim() || '',
            qty,
            price,
            qty * price,
            item.class_name?.trim() || null
          );
        }
      }
    });
    update();

    if (status !== undefined && status !== existing.status) {
      logActivity('quotation', params.id, session.userId, 'activity', session.name, `updated Status to ${status}`);
    }

    return NextResponse.json({ quotation: getQuotationWithDetails(params.id, ownerId) });
  } catch {
    return NextResponse.json({ error: 'Failed to update quotation' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const denied = denyReadOnlyWrite(session, 'quotations', request.method);
  if (denied) return denied;

  const ownerId = getDataOwnerId(session.userId);
  if (!trashQuotation(ownerId, Number(params.id))) {
    return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
