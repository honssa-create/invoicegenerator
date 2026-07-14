import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { logActivity } from '@/lib/order-server';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const order = db
    .prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  try {
    const { body } = await request.json();
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) return NextResponse.json({ error: 'Comment cannot be empty' }, { status: 400 });
    logActivity(params.id, session.userId, 'comment', session.name, text);

    const activities = db
      .prepare(
        'SELECT id, kind, author, body, created_at FROM order_activities WHERE order_id = ? ORDER BY created_at ASC, id ASC'
      )
      .all(params.id);
    return NextResponse.json({ activities }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
