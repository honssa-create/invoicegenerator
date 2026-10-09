import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getOrder, listOrdersPage, logActivity } from '@/lib/order-server';
import { parseOrderListQuery } from '@/lib/order-list-filters';
import { getDataOwnerId } from '@/lib/org-server';
import { ORDER_TYPES, WEDDING_GIFT_ORDER_TYPE, orderDueDateColumnFromFields, statusesForOrderType } from '@/lib/orders';
import { ensurePrepFromWeddingOrder } from '@/lib/kitchen-prep-server';
import { allocateGlobalRecordNumber } from '@/lib/record-numbering';
import { trySyncCustomerFromOrderRecord } from '@/lib/customer-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = await getDataOwnerId(session);
  const fields = new URL(request.url).searchParams.get('fields');
  if (fields === 'options') {
    const { listOrderOptions } = await import('@/lib/order-server');
    return NextResponse.json({ orders: await listOrderOptions(ownerId) });
  }
  const parsed = parseOrderListQuery(new URL(request.url).searchParams);
  const { limit, offset, ...listQuery } = parsed;
  const page = await listOrdersPage(ownerId, {
    includeFileListMeta: true,
    listQuery,
    limit,
    offset,
  });
  return NextResponse.json(page);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session);

  try {
    const body = await request.json();
    const orderType =
      typeof body.order_type === 'string' &&
      (ORDER_TYPES as readonly string[]).includes(body.order_type.trim())
        ? body.order_type.trim()
        : '';
    const statusRaw = typeof body.status === 'string' ? body.status.trim() : '';
    const allowedStatuses = statusesForOrderType(orderType);
    const status =
      statusRaw && allowedStatuses.includes(statusRaw) ? statusRaw : 'OPEN';
    const fields = orderType ? { order_type: orderType } : {};
    const fieldsJson = JSON.stringify(fields);
    const { id, referenceNumber } = await db.transaction(async () => {
      const referenceNumber = await allocateGlobalRecordNumber('order');
      const result = await db
        .prepare(
          `INSERT INTO orders (
             user_id, reference_number, po_number, name, description, status,
             customer_email, phone, shipping_address, notes, fields_json, order_type, due_date
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ownerId,
          referenceNumber,
          body.po_number?.trim() || null,
          body.name?.trim() || null,
          body.description?.trim() || null,
          status,
          body.customer_email?.trim() || null,
          body.phone?.trim() || null,
          body.shipping_address?.trim() || null,
          body.notes?.trim() || null,
          fieldsJson,
          orderType || null,
          orderDueDateColumnFromFields(fields)
        );
      return { id: result.lastInsertRowid as number, referenceNumber };
    });
    await logActivity(id, session.userId, 'activity', session.name, `created order ${referenceNumber}`);
    if (orderType === WEDDING_GIFT_ORDER_TYPE) {
      try {
        await ensurePrepFromWeddingOrder(ownerId, id);
      } catch {
        // Order still created; prep can be caught up by cron.
      }
    }
    const order = await getOrder(id, ownerId);
    if (order?.name?.trim()) {
      await trySyncCustomerFromOrderRecord(ownerId, order);
    }
    return NextResponse.json({ order }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
