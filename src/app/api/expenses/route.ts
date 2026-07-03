import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  attachReceipts,
  generateReceiptNumber,
  normalizeNumber,
  receiptPathsFromBody,
} from '@/lib/expense-server';
import type { Expense } from '@/lib/types';

const STATUSES = ['unpaid', 'pending', 'paid'];

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const status = searchParams.get('status');

  let query = 'SELECT * FROM expenses WHERE user_id = ?';
  const params: (string | number)[] = [session.userId];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (status && STATUSES.includes(status)) {
    query += ' AND payment_status = ?';
    params.push(status);
  }

  query += ' ORDER BY COALESCE(paid_date, created_at) DESC, id DESC';

  const expenses = db.prepare(query).all(...params) as Expense[];
  attachReceipts(expenses);
  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

    const receiptNo = generateReceiptNumber(session.userId);

    const create = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO expenses
            (user_id, receipt_no, category, merchant, amount_hkd, amount_rmb, paid_date, order_no, platform, payment_method, notes, payment_status, receipt_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          session.userId,
          receiptNo,
          category,
          body.merchant?.trim() || null,
          amount_hkd,
          amount_rmb,
          body.paid_date?.trim() || null,
          body.order_no?.trim() || null,
          body.platform?.trim() || null,
          body.payment_method?.trim() || null,
          body.notes?.trim() || null,
          payment_status,
          receiptPaths[0] || null
        );
      const expenseId = result.lastInsertRowid as number;
      const insertReceipt = db.prepare(
        'INSERT INTO expense_receipts (expense_id, user_id, path) VALUES (?, ?, ?)'
      );
      for (const p of receiptPaths) insertReceipt.run(expenseId, session.userId, p);
      return expenseId;
    });

    const expenseId = create();
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId) as Expense;
    attachReceipts([expense]);
    return NextResponse.json({ expense }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
