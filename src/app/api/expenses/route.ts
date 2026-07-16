import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  assignExpenseNumbersAtomic,
  attachReceipts,
  normalizeNumber,
  receiptPathsFromBody,
} from '@/lib/expense-server';
import { normalizeExpensePaymentFields } from '@/lib/expense-payment-fields';
import { getDataOwnerId } from '@/lib/org-server';
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
  const idsParam = searchParams.get('ids');

  const ownerId = getDataOwnerId(session.userId);
  let query = 'SELECT * FROM expenses WHERE user_id = ?';
  const params: (string | number)[] = [ownerId];

  if (session.role === 'operator') {
    query += ' AND created_by_user_id = ?';
    params.push(session.userId);
  }

  if (idsParam) {
    const ids = idsParam
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length) {
      query += ` AND id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
  }

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
    const payment_status = STATUSES.includes(body.payment_status) ? body.payment_status : 'paid';
    const amount_hkd = normalizeNumber(body.amount_hkd);
    const amount_rmb = normalizeNumber(body.amount_rmb);
    const receiptPaths = receiptPathsFromBody(body);
    const ownerId = getDataOwnerId(session.userId);
    const paidDate = body.paid_date?.trim() || '';

    if (amount_hkd === null && amount_rmb === null) {
      return NextResponse.json({ error: 'Enter an amount in HKD or RMB' }, { status: 400 });
    }

    const payment = normalizeExpensePaymentFields(body);
    if (!payment.ok) {
      return NextResponse.json({ error: payment.error }, { status: 400 });
    }

    if (!paidDate) {
      return NextResponse.json({ error: 'Paid date is required for receipt numbering 請填寫支出日期' }, { status: 400 });
    }

    const create = db.transaction(() => {
      const { batchId, receiptNo } = assignExpenseNumbersAtomic(ownerId, paidDate, {
        reuseBatch: Boolean(body.reuse_batch),
        fundingSource: payment.fields.funding_source!,
      });

      const result = db
        .prepare(
          `INSERT INTO expenses
            (user_id, created_by_user_id, receipt_no, batch_id, category, merchant, supplier_input, amount_hkd, amount_rmb, paid_date, order_no, platform, payment_method, payment_channel, funding_source, card_last4, notes, special_notes, payment_status, receipt_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ownerId,
          session.userId,
          receiptNo,
          batchId,
          category,
          body.merchant?.trim() || null,
          body.supplier_input?.trim() || null,
          amount_hkd,
          amount_rmb,
          paidDate,
          body.order_no?.trim() || null,
          body.platform?.trim() || null,
          null,
          payment.fields.payment_channel,
          payment.fields.funding_source,
          payment.fields.card_last4,
          body.notes?.trim() || null,
          body.special_notes?.trim() || null,
          payment_status,
          receiptPaths[0] || null,
        );
      const expenseId = result.lastInsertRowid as number;
      const insertReceipt = db.prepare(
        'INSERT INTO expense_receipts (expense_id, user_id, path, source_url) VALUES (?, ?, ?, ?)',
      );
      for (const p of receiptPaths) insertReceipt.run(expenseId, ownerId, p, null);
      return expenseId;
    });

    const expenseId = create.immediate();
    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId) as Expense;
    attachReceipts([expense]);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create expense';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
