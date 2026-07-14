import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrder, listOrders, logActivity } from '@/lib/order-server';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ orders: listOrders(session.userId) });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = db
      .prepare(
        `INSERT INTO orders (user_id, po_number, name, description, status, delivery_date, customer_email, phone, shipping_address, notes, fields_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`
      )
      .run(
        session.userId,
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
    logActivity(id, session.userId, 'activity', session.name, 'created this order');
    return NextResponse.json({ order: getOrder(id, session.userId) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
