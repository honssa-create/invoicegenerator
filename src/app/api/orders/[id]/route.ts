import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getOrder, logActivity } from '@/lib/order-server';
import { logActivity as logUnifiedActivity } from '@/lib/activity';
import { getDataOwnerId } from '@/lib/org-server';
import { trashOrder } from '@/lib/trash';

const CORE_COLUMNS = [
  'po_number',
  'name',
  'description',
  'status',
  'delivery_date',
  'customer_email',
  'phone',
  'shipping_address',
  'notes',
  'carton_count',
  'quotation_id',
  'total_amount',
];

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = await getDataOwnerId(session.userId);
  const order = await getOrder(params.id, ownerId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json({ order });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);

  const existing = await db
    .prepare('SELECT status, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId) as { status: string; fields_json: string } | undefined;
  if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  try {
    const body = await request.json();
    const core: Record<string, unknown> = body.core || {};
    const fields: Record<string, unknown> = body.fields || {};
    const linkedInvoiceId = body.linked_invoice_id;
    const linkedQuotationId = body.linked_quotation_id;

    // Update whitelisted core columns.
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const col of CORE_COLUMNS) {
      if (col in core) {
        setClauses.push(`${col} = ?`);
        const v = core[col];
        values.push(typeof v === 'string' ? (v.trim() || null) : v ?? null);
      }
    }

    // Merge custom fields into fields_json.
    if (Object.keys(fields).length) {
      let current: Record<string, unknown> = {};
      try {
        current = existing.fields_json ? JSON.parse(existing.fields_json) : {};
      } catch {
        current = {};
      }
      const merged = { ...current, ...fields };
      setClauses.push('fields_json = ?');
      values.push(JSON.stringify(merged));
    }

    if (setClauses.length) {
      setClauses.push("updated_at = datetime('now')");
      values.push(params.id, ownerId);
      await db.prepare(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    }

    if (linkedInvoiceId !== undefined) {
      const invoiceId = linkedInvoiceId ? Number(linkedInvoiceId) : null;
      if (invoiceId) {
        const invoice = await db
          .prepare('SELECT id FROM invoices WHERE id = ? AND user_id = ?')
          .get(invoiceId, ownerId);
        if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      await db.prepare('UPDATE invoices SET order_id = NULL, updated_at = datetime(\'now\') WHERE order_id = ? AND user_id = ?')
        .run(params.id, ownerId);
      if (invoiceId) {
        await db.prepare('UPDATE invoices SET order_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
          .run(params.id, invoiceId, ownerId);
        await logActivity(params.id, session.userId, 'activity', session.name, `linked invoice #${invoiceId}`);
      } else {
        await logActivity(params.id, session.userId, 'activity', session.name, 'unlinked invoice');
      }
    }

    if (linkedQuotationId !== undefined) {
      const quotationId = linkedQuotationId ? Number(linkedQuotationId) : null;
      if (quotationId) {
        const quote = await db
          .prepare('SELECT id, quote_number FROM quotations WHERE id = ? AND user_id = ?')
          .get(quotationId, ownerId) as { id: number; quote_number: string } | undefined;
        if (!quote) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 });
        await db.prepare('UPDATE orders SET quotation_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
          .run(quotationId, params.id, ownerId);
        await logActivity(params.id, session.userId, 'activity', session.name, `linked quotation ${quote.quote_number}`);
        await logUnifiedActivity('quotation', quotationId, session.userId, 'activity', session.name, `linked order #${params.id}`);
      } else {
        await db.prepare('UPDATE orders SET quotation_id = NULL, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
          .run(params.id, ownerId);
        await logActivity(params.id, session.userId, 'activity', session.name, 'unlinked quotation');
      }
    }

    // Log a status change to the activity feed.
    if ('status' in core && core.status && core.status !== existing.status) {
      await logActivity(params.id, session.userId, 'activity', session.name, `changed status to ${core.status}`);
    }

    return NextResponse.json({ order: await getOrder(params.id, ownerId) });
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);
  if (!await trashOrder(ownerId, Number(params.id))) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
