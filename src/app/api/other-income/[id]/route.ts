import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const income = db
    .prepare('SELECT * FROM other_income WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId);
  if (!income) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ income });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = db
    .prepare('SELECT * FROM other_income WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId) as Record<string, unknown> | undefined;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (body.verified !== undefined) {
    sets.push('verified = ?');
    vals.push(body.verified ? 1 : 0);
  }
  if (body.bank_cleared !== undefined) {
    sets.push('bank_cleared = ?');
    vals.push(body.bank_cleared ? 1 : 0);
  }
  if (body.remarks !== undefined) {
    sets.push('remarks = ?');
    vals.push(body.remarks?.trim() || null);
  }
  if (body.receipt_path !== undefined) {
    sets.push('receipt_path = ?');
    vals.push(body.receipt_path?.trim() || null);
  }
  if (body.category !== undefined) {
    sets.push('category = ?');
    vals.push(body.category?.trim() || '其他');
  }
  if (body.txn_date !== undefined) {
    sets.push('txn_date = ?');
    vals.push(body.txn_date?.trim() || null);
  }
  if (body.account !== undefined) {
    sets.push('account = ?');
    vals.push(body.account?.trim() || null);
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (Number.isFinite(amount) && amount > 0) {
      sets.push('amount = ?');
      vals.push(amount);
    }
  }

  if (sets.length) {
    vals.push(params.id, session.userId);
    db.prepare(`UPDATE other_income SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
  }

  const income = db.prepare('SELECT * FROM other_income WHERE id = ?').get(params.id);
  return NextResponse.json({ income });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const res = db.prepare('DELETE FROM other_income WHERE id = ? AND user_id = ?').run(params.id, session.userId);
  if (res.changes === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
