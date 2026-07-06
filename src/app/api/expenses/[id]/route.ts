import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { attachReceipts, normalizeNumber, receiptPathsFromBody } from '@/lib/expense-server';
import { canAccessExpense, expenseWhereClause, getDataOwnerId } from '@/lib/org-server';
import { trashExpense } from '@/lib/trash';
import type { Expense } from '@/lib/types';

const STATUSES = ['unpaid', 'pending', 'paid'];

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sql, params: whereParams } = expenseWhereClause(session);
  const expense = db
    .prepare(`SELECT * FROM expenses WHERE id = ? AND ${sql}`)
    .get(params.id, ...whereParams) as Expense | undefined;

  if (!expense) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }
  attachReceipts([expense]);
  return NextResponse.json({ expense });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canAccessExpense(session, Number(params.id))) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }

  const ownerId = getDataOwnerId(session.userId);

  try {
    const body = await request.json();
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'other';
    const payment_status = STATUSES.includes(body.payment_status) ? body.payment_status : 'unpaid';
    const amount_hkd = normalizeNumber(body.amount_hkd);
    const amount_rmb = normalizeNumber(body.amount_rmb);
    const receiptPaths = receiptPathsFromBody(body);

    if (amount_hkd === null && amount_rmb === null) {
      return NextResponse.json({ error: 'Enter an amount in HKD or RMB' }, { status: 400 });
    }

    const update = db.transaction(() => {
      db.prepare(
        `UPDATE expenses SET
           category = ?, merchant = ?, supplier_input = ?, amount_hkd = ?, amount_rmb = ?, paid_date = ?,
           order_no = ?, platform = ?, payment_method = ?, notes = ?, special_notes = ?, payment_status = ?, receipt_path = ?,
           updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      ).run(
        category,
        body.merchant?.trim() || null,
        body.supplier_input?.trim() || null,
        amount_hkd,
        amount_rmb,
        body.paid_date?.trim() || null,
        body.order_no?.trim() || null,
        body.platform?.trim() || null,
        body.payment_method?.trim() || null,
        body.notes?.trim() || null,
        body.special_notes?.trim() || null,
        payment_status,
        receiptPaths[0] || null,
        params.id,
        ownerId
      );

      db.prepare('DELETE FROM expense_receipts WHERE expense_id = ? AND user_id = ?').run(
        params.id,
        ownerId
      );
      const insertReceipt = db.prepare(
        'INSERT INTO expense_receipts (expense_id, user_id, path) VALUES (?, ?, ?)'
      );
      for (const p of receiptPaths) insertReceipt.run(params.id, ownerId, p);
    });

    update();

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(params.id) as Expense;
    attachReceipts([expense]);
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

  if (!trashExpense(session, Number(params.id))) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, trashed: true, retention_days: 60 });
}
