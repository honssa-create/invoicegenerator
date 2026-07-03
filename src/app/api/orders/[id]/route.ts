import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrder, logActivity } from '@/lib/order-server';

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
];

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const order = getOrder(params.id, session.userId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json({ order });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = db
    .prepare('SELECT status, fields_json FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as { status: string; fields_json: string } | undefined;
  if (!existing) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  try {
    const body = await request.json();
    const core: Record<string, unknown> = body.core || {};
    const fields: Record<string, unknown> = body.fields || {};

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
      values.push(params.id, session.userId);
      db.prepare(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    }

    // Log a status change to the activity feed.
    if ('status' in core && core.status && core.status !== existing.status) {
      logActivity(params.id, session.userId, 'activity', session.name, `changed status to ${core.status}`);
    }

    return NextResponse.json({ order: getOrder(params.id, session.userId) });
  } catch {
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = db
    .prepare('DELETE FROM orders WHERE id = ? AND user_id = ?')
    .run(params.id, session.userId);
  if (result.changes === 0) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
