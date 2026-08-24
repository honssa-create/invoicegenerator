import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getOrder, listOrdersSummary, logActivity } from '@/lib/order-server';
import { getDataOwnerId } from '@/lib/org-server';
import { ORDER_TYPES, ORDER_STATUSES, WEDDING_GIFT_ORDER_TYPE, orderTypeFromFields } from '@/lib/orders';
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
  return NextResponse.json({ orders: await listOrdersSummary(ownerId) });
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
    const status =
      statusRaw && (ORDER_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : 'OPEN';
    const fieldsJson = JSON.stringify(orderType ? { order_type: orderType } : {});
    const { id, referenceNumber } = await db.transaction(async () => {
      const referenceNumber = await allocateGlobalRecordNumber('order');
      const result = await db
        .prepare(
          `INSERT INTO orders (
             user_id, reference_number, po_number, name, description, status,
             customer_email, phone, shipping_address, notes, fields_json, order_type
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          orderType || null
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
