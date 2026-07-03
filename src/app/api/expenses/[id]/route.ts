import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';

const CATEGORIES = ['ingredients', 'packaging', 'marketing', 'rent', 'other'];
const STATUSES = ['unpaid', 'pending', 'paid'];

function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const expense = db
    .prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId);

  if (!expense) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }
  return NextResponse.json({ expense });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = db
    .prepare('SELECT id FROM expenses WHERE id = ? AND user_id = ?')
    .get(params.id, session.userId);

  if (!existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const category = CATEGORIES.includes(body.category) ? body.category : 'other';
    const payment_status = STATUSES.includes(body.payment_status) ? body.payment_status : 'unpaid';
    const amount_hkd = normalizeNumber(body.amount_hkd);
    const amount_rmb = normalizeNumber(body.amount_rmb);

    if (amount_hkd === null && amount_rmb === null) {
      return NextResponse.json({ error: 'Enter an amount in HKD or RMB' }, { status: 400 });
    }

    db.prepare(
      `UPDATE expenses SET
         category = ?, merchant = ?, amount_hkd = ?, amount_rmb = ?, paid_date = ?,
         order_no = ?, platform = ?, notes = ?, payment_status = ?, receipt_path = ?,
         updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(
      category,
      body.merchant?.trim() || null,
      amount_hkd,
      amount_rmb,
      body.paid_date?.trim() || null,
      body.order_no?.trim() || null,
      body.platform?.trim() || null,
      body.notes?.trim() || null,
      payment_status,
      body.receipt_path?.trim() || null,
      params.id,
      session.userId
    );

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(params.id);
    return NextResponse.json({ expense });
  } catch {
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = db
    .prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?')
    .run(params.id, session.userId);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
