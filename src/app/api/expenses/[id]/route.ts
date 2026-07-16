import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import {
  assignExpenseNumbersAtomic,
  attachReceipts,
  normalizeNumber,
  receiptNumberPrefix,
  receiptPathsFromBody,
  reissueReceiptNumberAtomic,
} from '@/lib/expense-server';
import { normalizeExpensePaymentFields } from '@/lib/expense-payment-fields';
import { legacyPaymentToFundingSource } from '@/lib/expenses';
import { canAccessExpense, expenseWhereClause, getDataOwnerId } from '@/lib/org-server';
import { trashExpense } from '@/lib/trash';
import type { Expense } from '@/lib/types';
import type { FundingSourceId } from '@/lib/expenses';

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
    const payment_status = STATUSES.includes(body.payment_status) ? body.payment_status : 'paid';
    const amount_hkd = normalizeNumber(body.amount_hkd);
    const amount_rmb = normalizeNumber(body.amount_rmb);
    const receiptPaths = receiptPathsFromBody(body);

    if (amount_hkd === null && amount_rmb === null) {
      return NextResponse.json({ error: 'Enter an amount in HKD or RMB' }, { status: 400 });
    }

    const payment = normalizeExpensePaymentFields(body);
    if (!payment.ok) {
      return NextResponse.json({ error: payment.error }, { status: 400 });
    }

    const paidDate = body.paid_date?.trim() || '';
    if (!paidDate) {
      return NextResponse.json({ error: 'Paid date is required for receipt numbering 請填寫支出日期' }, { status: 400 });
    }

    const expenseId = Number(params.id);

    const update = db.transaction(() => {
      const existing = db
        .prepare(
          'SELECT batch_id, receipt_no, payment_method, funding_source, paid_date FROM expenses WHERE id = ? AND user_id = ?',
        )
        .get(params.id, ownerId) as {
        batch_id: string | null;
        receipt_no: string | null;
        payment_method: string | null;
        funding_source: string | null;
        paid_date: string | null;
      } | undefined;
      if (!existing) {
        throw new Error('Expense not found');
      }

      const fundingSource = payment.fields.funding_source as FundingSourceId;
      let batchId = existing.batch_id;
      let receiptNo = existing.receipt_no;

      if (!batchId || !receiptNo) {
        const assigned = assignExpenseNumbersAtomic(ownerId, paidDate, { fundingSource });
        batchId = assigned.batchId;
        receiptNo = assigned.receiptNo;
      } else {
        const prevFunding =
          (existing.funding_source as FundingSourceId | null) ||
          legacyPaymentToFundingSource(existing.payment_method);
        const prevPaid = existing.paid_date || paidDate;
        let oldPrefix = '';
        let newPrefix = '';
        try {
          if (prevFunding && prevPaid) {
            oldPrefix = receiptNumberPrefix(prevPaid, prevFunding);
          }
          newPrefix = receiptNumberPrefix(paidDate, fundingSource);
        } catch {
          newPrefix = receiptNumberPrefix(paidDate, fundingSource);
        }
        if (!oldPrefix || oldPrefix !== newPrefix) {
          receiptNo = reissueReceiptNumberAtomic(ownerId, expenseId, paidDate, fundingSource);
        }
      }

      db.prepare(
        `UPDATE expenses SET
           category = ?, merchant = ?, supplier_input = ?, amount_hkd = ?, amount_rmb = ?, paid_date = ?,
           order_no = ?, platform = ?, payment_method = ?, payment_channel = ?, funding_source = ?, card_last4 = ?,
           notes = ?, special_notes = ?, payment_status = ?, receipt_path = ?,
           batch_id = ?, receipt_no = ?,
           updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      ).run(
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
        batchId,
        receiptNo,
        params.id,
        ownerId,
      );

      db.prepare('DELETE FROM expense_receipts WHERE expense_id = ? AND user_id = ?').run(
        params.id,
        ownerId,
      );
      const insertReceipt = db.prepare(
        'INSERT INTO expense_receipts (expense_id, user_id, path, source_url) VALUES (?, ?, ?, ?)',
      );
      for (const p of receiptPaths) insertReceipt.run(params.id, ownerId, p, null);
    });

    update.immediate();

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(params.id) as Expense;
    attachReceipts([expense]);
    return NextResponse.json({ expense });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update expense';
    return NextResponse.json({ error: message }, { status: 500 });
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
