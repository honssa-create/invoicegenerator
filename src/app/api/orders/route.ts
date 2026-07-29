import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { denyReadOnlyWrite } from '@/lib/api-guard';
import { getOrder, listOrders, logActivity } from '@/lib/order-server';
import { getDataOwnerId } from '@/lib/org-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = await getDataOwnerId(session.userId);
  return NextResponse.json({ orders: await listOrders(ownerId) });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const denied = denyReadOnlyWrite(session, 'orders', request.method);
  if (denied) return denied;

  const ownerId = await getDataOwnerId(session.userId);

  try {
    const body = await request.json();
    const result = await db
      .prepare(
        `INSERT INTO orders (user_id, po_number, name, description, status, delivery_date, customer_email, phone, shipping_address, notes, fields_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`
      )
      .run(
        ownerId,
        body.po_number?.trim() || null,
        body.name?.trim() || null,
        body.description?.trim() || null,
        body.status?.trim() || '草稿',
        body.delivery_date?.trim() || null,
        body.customer_email?.trim() || null,
        body.phone?.trim() || null,
        body.shipping_address?.trim() || null,
        body.notes?.trim() || null
      );
    const id = result.lastInsertRowid as number;
    await logActivity(id, session.userId, 'activity', session.name, 'created this order');
    return NextResponse.json({ order: await getOrder(id, ownerId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
