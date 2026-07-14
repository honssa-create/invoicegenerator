import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { trashOtherIncome } from '@/lib/trash';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = db.prepare('SELECT id FROM other_income WHERE id = ? AND user_id = ?').get(params.id, session.userId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  if (body.verified !== undefined) {
    db.prepare('UPDATE other_income SET verified = ? WHERE id = ? AND user_id = ?').run(body.verified ? 1 : 0, params.id, session.userId);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!trashOtherIncome(session.userId, Number(params.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
