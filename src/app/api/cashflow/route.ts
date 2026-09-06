import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getSessionFromRequest } from '@/lib/auth';
import { listOrdersSummary } from '@/lib/order-server';
import type { LedgerEntry } from '@/lib/cashflow';
import { orderPaymentReceiptUrl, otherIncomeReceiptUrl } from '@/lib/image-url';
import { getDataOwnerId } from '@/lib/org-server';
import { displayOrderNumber } from '@/lib/record-numbering-core';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ownerId = await getDataOwnerId(session);
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);

  const entries: LedgerEntry[] = [];

  // Product Sales — month filtered in SQL (lean payment fields only).
  for (const o of await listOrdersSummary(ownerId, { paymentMonth: month })) {
    const amt = Number(o.fields.payment_amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const date = (o.fields.payment_date as string) || o.created_at.slice(0, 10);
    entries.push({
      key: `order-${o.id}`,
      kind: 'product',
      date,
      category: 'Product Sale',
      ref: displayOrderNumber(o.po_number) || o.reference_number,
      account: (o.fields.payment_bank as string) || '',
      amount: amt,
      receiptUrl: orderPaymentReceiptUrl(o.id, o.fields.payment_receipt_path as string | undefined),
      verified: o.fields.payment_verified === true || o.fields.payment_verified === 'true',
      orderId: o.id,
    });
  }

  // Other Income — manual entries for the selected month.
  const rows = (await db
    .prepare(
      `SELECT * FROM other_income
     WHERE user_id = ?
       AND (
         (txn_date IS NOT NULL AND txn_date LIKE ?)
         OR (txn_date IS NULL AND CAST(created_at AS text) LIKE ?)
       )`
    )
    .all(ownerId, `${month}%`, `${month}%`)) as {
    id: number;
    category: string | null;
    txn_date: string | null;
    amount: number;
    account: string | null;
    remarks: string | null;
    receipt_path: string | null;
    verified: number;
    created_at: string;
  }[];
  for (const r of rows) {
    entries.push({
      key: `income-${r.id}`,
      kind: 'other',
      date: r.txn_date || r.created_at.slice(0, 10),
      category: r.category || '其他',
      ref: r.remarks || '',
      account: r.account || '',
      amount: r.amount,
      receiptUrl: otherIncomeReceiptUrl(r.id, r.receipt_path),
      verified: r.verified === 1,
      incomeId: r.id,
    });
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const productSales = entries.filter((e) => e.kind === 'product').reduce((s, e) => s + e.amount, 0);
  const otherIncome = entries.filter((e) => e.kind === 'other').reduce((s, e) => s + e.amount, 0);

  return NextResponse.json({
    month,
    totals: { productSales, otherIncome, gross: productSales + otherIncome },
    entries,
  });
}
