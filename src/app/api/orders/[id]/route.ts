import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getOrder, logActivity } from '@/lib/order-server';
import { logActivity as logUnifiedActivity } from '@/lib/activity';
import { getDataOwnerId } from '@/lib/org-server';
import { trashOrder } from '@/lib/trash';
import { isWeddingGiftOrderType, pruneStaleOrderFields } from '@/lib/orders';
import { ensurePrepFromWeddingOrder } from '@/lib/kitchen-prep-server';
import { CONFLICT_MESSAGE, timestampsMatch } from '@/lib/concurrency';

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

const PREP_SYNC_FIELD_KEYS = new Set([
  'order_type',
  'production_date',
  'expiry_date',
  'client_delivery_date',
  'bottle_capacity',
  'qty_osmanthus',
  'qty_red_date',
  'qty_rock_sugar',
  'big_day',
]);

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = await getDataOwnerId(session);
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

  const ownerId = await getDataOwnerId(session);

  const existing = await db
    .prepare('SELECT reference_number, status, fields_json, updated_at FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, ownerId) as {
    reference_number: string;
    status: string;
    fields_json: string;
    updated_at: string;
  } | undefined;
  if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  try {
    const body = await request.json();
    const expectedUpdatedAt = body.expected_updated_at as string | undefined;
    if (expectedUpdatedAt != null && !timestampsMatch(existing.updated_at, expectedUpdatedAt)) {
      return NextResponse.json(
        {
          error: CONFLICT_MESSAGE,
          conflict: true,
          order: await getOrder(params.id, ownerId),
        },
        { status: 409 },
      );
    }

    const core: Record<string, unknown> = body.core || {};
    const fields: Record<string, unknown> = body.fields || {};
    const linkedInvoiceId = body.linked_invoice_id;
    const linkedQuotationId = body.linked_quotation_id;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const col of CORE_COLUMNS) {
      if (col in core) {
        setClauses.push(`${col} = ?`);
        const v = core[col];
        values.push(typeof v === 'string' ? (v.trim() || null) : v ?? null);
      }
    }

    let mergedFields: Record<string, unknown> | null = null;
    if (Object.keys(fields).length) {
      let current: Record<string, unknown> = {};
      try {
        current = existing.fields_json ? JSON.parse(existing.fields_json) : {};
      } catch {
        current = {};
      }
      mergedFields = { ...current, ...fields };
      pruneStaleOrderFields(mergedFields);
      setClauses.push('fields_json = ?');
      values.push(JSON.stringify(mergedFields));
    }

    if (setClauses.length) {
      setClauses.push("updated_at = datetime('now')");
      if (expectedUpdatedAt != null) {
        values.push(params.id, ownerId, existing.updated_at);
        const result = await db
          .prepare(
            `UPDATE orders SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? AND updated_at = ?`,
          )
          .run(...values);
        if (!result.changes) {
          return NextResponse.json(
            {
              error: CONFLICT_MESSAGE,
              conflict: true,
              order: await getOrder(params.id, ownerId),
            },
            { status: 409 },
          );
        }
      } else {
        values.push(params.id, ownerId);
        await db.prepare(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }
    }

    if (linkedInvoiceId !== undefined) {
      const invoiceId = linkedInvoiceId ? Number(linkedInvoiceId) : null;
      if (invoiceId) {
        const invoice = await db
          .prepare('SELECT id, invoice_number FROM invoices WHERE id = ? AND user_id = ?')
          .get(invoiceId, ownerId) as { id: number; invoice_number: string } | undefined;
        if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }

      await db.prepare('UPDATE invoices SET order_id = NULL, updated_at = datetime(\'now\') WHERE order_id = ? AND user_id = ?')
        .run(params.id, ownerId);
      if (invoiceId) {
        await db.prepare('UPDATE invoices SET order_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
          .run(params.id, invoiceId, ownerId);
        const invoice = await db
          .prepare('SELECT invoice_number FROM invoices WHERE id = ?')
          .get(invoiceId) as { invoice_number: string } | undefined;
        await logActivity(
          params.id,
          session.userId,
          'activity',
          session.name,
          `linked invoice ${invoice?.invoice_number || invoiceId}`,
        );
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
        await logUnifiedActivity(
          'quotation',
          quotationId,
          session.userId,
          'activity',
          session.name,
          `linked order ${existing.reference_number}`,
        );
      } else {
        await db.prepare('UPDATE orders SET quotation_id = NULL, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
          .run(params.id, ownerId);
        await logActivity(params.id, session.userId, 'activity', session.name, 'unlinked quotation');
      }
    }

    if ('status' in core && core.status && core.status !== existing.status) {
      await logActivity(params.id, session.userId, 'activity', session.name, `changed status to ${core.status}`);
    }

    const shouldSyncPrep = Object.keys(fields).some((k) => PREP_SYNC_FIELD_KEYS.has(k));
    if (shouldSyncPrep) {
      let orderType = '';
      if (mergedFields) {
        orderType = String(mergedFields.order_type || '');
      } else {
        try {
          const cur = existing.fields_json ? JSON.parse(existing.fields_json) : {};
          orderType = String(cur.order_type || '');
        } catch {
          orderType = '';
        }
      }
      if (isWeddingGiftOrderType(orderType)) {
        try {
          await ensurePrepFromWeddingOrder(ownerId, Number(params.id));
        } catch {
          // Non-fatal — cron catch-up can retry.
        }
      }
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

  const ownerId = await getDataOwnerId(session);
  if (!await trashOrder(ownerId, Number(params.id))) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
